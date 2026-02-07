import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, MAX_CHUNKS_PER_FRAME, UNLOAD_DISTANCE } from '../utils/constants.js';
import { BlockType } from './BlockType.js';
import { Chunk } from './Chunk.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { createTextureAtlas } from './TextureAtlas.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.terrainGenerator = new TerrainGenerator();
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

    // Cached bound getNeighborBlock (avoids closure creation per call)
    this._getNeighborBlock = (wx, wy, wz) => this.getBlock(wx, wy, wz);

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
  }

  chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  getChunk(cx, cz) {
    return this.chunks.get(this.chunkKey(cx, cz));
  }

  worldToChunk(worldX, worldZ) {
    return {
      cx: Math.floor(worldX / CHUNK_SIZE),
      cz: Math.floor(worldZ / CHUNK_SIZE),
    };
  }

  getBlock(worldX, worldY, worldZ) {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return BlockType.AIR;
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cz = Math.floor(worldZ / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return BlockType.AIR;
    const lx = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getBlock(lx, worldY, lz);
  }

  setBlock(worldX, worldY, worldZ, type) {
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
  }

  flushDirtyChunks() {
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

  rebuildChunk(cx, cz) {
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;

    // Remove old meshes from scene
    if (chunk.mesh) this.scene.remove(chunk.mesh);
    if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);

    chunk.buildMesh(this.opaqueMaterial, this.waterMaterial, this._getNeighborBlock);

    if (chunk.mesh) this.scene.add(chunk.mesh);
    if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
  }

  update(playerPosition) {
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
            if (!this.chunks.has(key)) {
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
        }
      }
    }

    // Load a few chunks per frame from cached toLoad list (index pointer instead of shift)
    let loaded = 0;
    while (this._toLoadIdx < this._cachedToLoad.length && loaded < MAX_CHUNKS_PER_FRAME) {
      const { cx, cz } = this._cachedToLoad[this._toLoadIdx++];
      if (!this.chunks.has(this.chunkKey(cx, cz))) {
        this.loadChunk(cx, cz);
        loaded++;
      }
    }

    this.loadedChunkCount = this.chunks.size;
  }

  loadChunk(cx, cz) {
    const chunk = new Chunk(cx, cz);
    this.terrainGenerator.generateChunk(chunk);
    this.chunks.set(this.chunkKey(cx, cz), chunk);

    chunk.buildMesh(this.opaqueMaterial, this.waterMaterial, this._getNeighborBlock);

    if (chunk.mesh) this.scene.add(chunk.mesh);
    if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
  }

  getSpawnHeight(x, z) {
    // Get surface height at position
    const height = this.terrainGenerator.getHeight(Math.floor(x), Math.floor(z));
    return Math.max(height + 2, 65);
  }
}
