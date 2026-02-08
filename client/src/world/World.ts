import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, MAX_CHUNKS_PER_FRAME, UNLOAD_DISTANCE } from '../utils/constants';
import { BlockType } from './BlockType';
import { Chunk } from './Chunk';
import { TerrainGenerator } from './TerrainGenerator';
import { createTextureAtlas } from './TextureAtlas';
import type { MeshBuffers } from './ChunkMesher';
import type { ChunkLoadEntry, GetNeighborBlock, BlockDiff } from '../types';

export class World {
  scene: THREE.Scene;
  chunks: Map<string, Chunk>;
  terrainGenerator: TerrainGenerator;
  pendingChunks: Chunk[];
  loadedChunkCount: number;
  atlasTexture: THREE.CanvasTexture;
  atlasCanvas: HTMLCanvasElement;
  opaqueMaterial: THREE.MeshLambertMaterial;
  waterMaterial: THREE.MeshLambertMaterial;

  // Cached chunk iteration state
  private _lastPlayerCX: number | null;
  private _lastPlayerCZ: number | null;
  private _cachedNeeded: Set<string>;
  private _cachedToLoad: ChunkLoadEntry[];
  private _toLoadIdx: number;

  // Dirty chunk batching
  private _dirtyChunks: Set<string>;

  // Block diffs from server — applied per-chunk during loadChunk()
  private _blockDiffs: Map<string, { lx: number; y: number; lz: number; type: number }[]>;
  // Raw diffs kept for worker init
  private _rawBlockDiffs: BlockDiff[];

  // Cached bound getNeighborBlock
  _getNeighborBlock: GetNeighborBlock;

  // Web Worker for off-thread chunk gen+mesh
  private _worker: Worker | null;
  private _workerReady: boolean;
  private _pendingWorkerChunks: Set<string>;

  // Adaptive chunk loading
  private _adaptiveMax: number;
  private _fpsAccum: number;
  private _fpsFrames: number;
  private _fpsSampleTimer: number;

  private _seed: number;

  constructor(scene: THREE.Scene, seed = 12345) {
    this.scene = scene;
    this.chunks = new Map();
    this._seed = seed;
    this.terrainGenerator = new TerrainGenerator(seed);
    this.pendingChunks = [];
    this.loadedChunkCount = 0;

    // Cached chunk iteration state
    this._lastPlayerCX = null;
    this._lastPlayerCZ = null;
    this._cachedNeeded = new Set();
    this._cachedToLoad = [];
    this._toLoadIdx = 0;

    // Dirty chunk batching
    this._dirtyChunks = new Set();

    // Block diffs — keyed by chunk key
    this._blockDiffs = new Map();
    this._rawBlockDiffs = [];

    // Cached bound getNeighborBlock (avoids closure creation per call)
    this._getNeighborBlock = (wx: number, wy: number, wz: number) => this.getBlock(wx, wy, wz);

    // Create texture atlas
    const { texture, canvas } = createTextureAtlas();
    this.atlasTexture = texture;
    this.atlasCanvas = canvas;

    // Create materials
    this.opaqueMaterial = new THREE.MeshLambertMaterial({
      map: texture,
      vertexColors: true,
      alphaTest: 0.5,
    });

    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
    });

    // Worker setup
    this._worker = null;
    this._workerReady = false;
    this._pendingWorkerChunks = new Set();
    this._initWorker();

    // Adaptive loading
    this._adaptiveMax = MAX_CHUNKS_PER_FRAME;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._fpsSampleTimer = 0;
  }

  private _initWorker(): void {
    try {
      this._worker = new Worker(
        new URL('./meshWorker.ts', import.meta.url),
        { type: 'module' }
      );
      this._worker.onmessage = (e: MessageEvent) => this._onWorkerMessage(e);
      this._worker.onerror = () => {
        // Worker failed to load — fall back to sync
        this._worker = null;
        this._workerReady = false;
      };
    } catch {
      // Workers not supported — sync fallback
      this._worker = null;
    }
  }

  /** Send init data to worker once we have seed + diffs */
  initWorker(): void {
    if (!this._worker) return;
    this._worker.postMessage({
      type: 'init',
      seed: this._seed,
      blockDiffs: this._rawBlockDiffs,
    });
  }

  private _onWorkerMessage(e: MessageEvent): void {
    const msg = e.data;
    if (msg.type === 'ready') {
      this._workerReady = true;
      return;
    }

    if (msg.type === 'chunkResult') {
      const { cx, cz } = msg;
      const key = this.chunkKey(cx, cz);
      this._pendingWorkerChunks.delete(key);

      // If chunk was unloaded while worker was processing, discard
      if (!this._cachedNeeded.has(key)) return;
      // If chunk already exists (e.g. loaded synchronously), skip
      if (this.chunks.has(key)) return;

      const chunk = new Chunk(cx, cz);
      chunk.blocks = msg.blocks;
      this.chunks.set(key, chunk);

      const buffers: MeshBuffers = {
        opaquePos: msg.opaquePos,
        opaqueNrm: msg.opaqueNrm,
        opaqueUv: msg.opaqueUv,
        opaqueCol: msg.opaqueCol,
        opaqueIdx: msg.opaqueIdx,
        waterPos: msg.waterPos,
        waterNrm: msg.waterNrm,
        waterUv: msg.waterUv,
        waterCol: msg.waterCol,
        waterIdx: msg.waterIdx,
      };

      chunk.buildMeshFromBuffers(buffers, this.opaqueMaterial, this.waterMaterial);

      if (chunk.mesh) this.scene.add(chunk.mesh);
      if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
    }
  }

  chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(this.chunkKey(cx, cz));
  }

  worldToChunk(worldX: number, worldZ: number): { cx: number; cz: number } {
    return {
      cx: Math.floor(worldX / CHUNK_SIZE),
      cz: Math.floor(worldZ / CHUNK_SIZE),
    };
  }

  getBlock(worldX: number, worldY: number, worldZ: number): number {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return BlockType.AIR;
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cz = Math.floor(worldZ / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return BlockType.AIR;
    const lx = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getBlock(lx, worldY, lz);
  }

  setBlock(worldX: number, worldY: number, worldZ: number, type: number): void {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return;
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cz = Math.floor(worldZ / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;
    const lx = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setBlock(lx, worldY, lz, type);

    // Mark this chunk and edge neighbors as dirty (batched rebuild)
    this._dirtyChunks.add(this.chunkKey(cx, cz));
    if (lx === 0) this._dirtyChunks.add(this.chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this._dirtyChunks.add(this.chunkKey(cx + 1, cz));
    if (lz === 0) this._dirtyChunks.add(this.chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this._dirtyChunks.add(this.chunkKey(cx, cz + 1));

    // Notify worker of the diff so future chunk gen uses it
    if (this._worker && this._workerReady) {
      this._worker.postMessage({
        type: 'addDiff',
        diff: { x: worldX, y: worldY, z: worldZ, blockType: type },
      });
    }
  }

  flushDirtyChunks(): void {
    if (this._dirtyChunks.size === 0) return;
    for (const key of this._dirtyChunks) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;

      if (chunk.mesh) this.scene.remove(chunk.mesh);
      if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);

      chunk.buildMesh(this.opaqueMaterial, this.waterMaterial, this._getNeighborBlock);

      if (chunk.mesh) this.scene.add(chunk.mesh);
      if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
    }
    this._dirtyChunks.clear();
  }

  rebuildChunk(cx: number, cz: number): void {
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;

    // Remove old meshes from scene
    if (chunk.mesh) this.scene.remove(chunk.mesh);
    if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);

    chunk.buildMesh(this.opaqueMaterial, this.waterMaterial, this._getNeighborBlock);

    if (chunk.mesh) this.scene.add(chunk.mesh);
    if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
  }

  /** Track FPS for adaptive chunk loading */
  trackFps(dt: number): void {
    this._fpsFrames++;
    this._fpsSampleTimer += dt;
    if (this._fpsSampleTimer >= 0.5) {
      const avgFps = this._fpsFrames / this._fpsSampleTimer;
      this._fpsFrames = 0;
      this._fpsSampleTimer = 0;

      if (avgFps > 55 && this._adaptiveMax < 8) {
        this._adaptiveMax++;
      } else if (avgFps < 30 && this._adaptiveMax > 1) {
        this._adaptiveMax--;
      }
    }
  }

  update(playerPosition: THREE.Vector3): void {
    const playerCX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerCZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    // Only rebuild needed/toLoad when player crosses a chunk boundary
    if (playerCX !== this._lastPlayerCX || playerCZ !== this._lastPlayerCZ) {
      this._lastPlayerCX = playerCX;
      this._lastPlayerCZ = playerCZ;

      // Determine needed chunks in spiral order
      this._cachedNeeded.clear();
      this._cachedToLoad.length = 0;
      this._toLoadIdx = 0;

      for (let r = 0; r <= RENDER_DISTANCE; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.abs(dx) !== r && Math.abs(dz) !== r && r > 0) continue;
            const cx = playerCX + dx;
            const cz = playerCZ + dz;
            const key = this.chunkKey(cx, cz);
            this._cachedNeeded.add(key);
            if (!this.chunks.has(key) && !this._pendingWorkerChunks.has(key)) {
              const dist = dx * dx + dz * dz;
              this._cachedToLoad.push({ cx, cz, dist });
            }
          }
        }
      }

      // Sort by distance — closer chunks first
      this._cachedToLoad.sort((a, b) => a.dist - b.dist);

      // Unload distant chunks
      for (const [key, chunk] of this.chunks) {
        const dx = chunk.chunkX - playerCX;
        const dz = chunk.chunkZ - playerCZ;
        if (dx * dx + dz * dz > UNLOAD_DISTANCE * UNLOAD_DISTANCE) {
          if (chunk.mesh) this.scene.remove(chunk.mesh);
          if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
          chunk.dispose();
          this.chunks.delete(key);
          // Tell worker to free memory for this chunk
          if (this._worker && this._workerReady) {
            this._worker.postMessage({ type: 'unloadChunk', cx: chunk.chunkX, cz: chunk.chunkZ });
          }
        }
      }
    }

    // Load a few chunks per frame from cached toLoad list (index pointer instead of shift)
    let loaded = 0;
    const maxThisFrame = this._adaptiveMax;
    while (this._toLoadIdx < this._cachedToLoad.length && loaded < maxThisFrame) {
      const { cx, cz } = this._cachedToLoad[this._toLoadIdx++];
      const key = this.chunkKey(cx, cz);
      if (!this.chunks.has(key) && !this._pendingWorkerChunks.has(key)) {
        if (this._worker && this._workerReady) {
          // Offload to worker
          this._pendingWorkerChunks.add(key);
          this._worker.postMessage({ type: 'generateChunk', cx, cz });
        } else {
          // Synchronous fallback
          this.loadChunk(cx, cz);
        }
        loaded++;
      }
    }

    this.loadedChunkCount = this.chunks.size;
  }

  applyBlockDiffs(diffs: BlockDiff[]): void {
    this._rawBlockDiffs = diffs;
    // Group diffs by chunk key for deferred application during loadChunk()
    for (const diff of diffs) {
      const cx = Math.floor(diff.x / CHUNK_SIZE);
      const cz = Math.floor(diff.z / CHUNK_SIZE);
      const key = this.chunkKey(cx, cz);
      const lx = ((diff.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((diff.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      let arr = this._blockDiffs.get(key);
      if (!arr) {
        arr = [];
        this._blockDiffs.set(key, arr);
      }
      arr.push({ lx, y: diff.y, lz, type: diff.blockType });
    }
  }

  loadChunk(cx: number, cz: number): void {
    const chunk = new Chunk(cx, cz);
    this.terrainGenerator.generateChunk(chunk);

    // Apply any pending block diffs for this chunk
    const key = this.chunkKey(cx, cz);
    const diffs = this._blockDiffs.get(key);
    if (diffs) {
      for (const d of diffs) {
        chunk.setBlock(d.lx, d.y, d.lz, d.type);
      }
    }

    this.chunks.set(key, chunk);

    chunk.buildMesh(this.opaqueMaterial, this.waterMaterial, this._getNeighborBlock);

    if (chunk.mesh) this.scene.add(chunk.mesh);
    if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
  }

  getSpawnHeight(x: number, z: number): number {
    // Get surface height at position
    const height = this.terrainGenerator.getHeight(Math.floor(x), Math.floor(z));
    return Math.max(height + 2, 65);
  }
}
