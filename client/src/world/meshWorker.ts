// Web Worker for off-main-thread chunk terrain generation + meshing
import { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } from '../utils/constants';
import { BlockType, TRANSPARENT_LUT, SOLID_LUT, LIQUID_LUT, TEXTURE_LUT } from './BlockType';
import { TerrainGenerator } from './TerrainGenerator';
import { meshBlocks } from './ChunkMesher';
import { UV_TABLE } from './TextureAtlas';

let terrainGenerator: TerrainGenerator | null = null;

// Block diffs grouped by chunk key
const blockDiffs = new Map<string, { lx: number; y: number; lz: number; type: number }[]>();

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

// In-worker chunk storage for neighbor lookups during meshing
const chunkBlocks = new Map<string, Uint8Array>();

function getBlock(worldX: number, worldY: number, worldZ: number): number {
  if (worldY < 0 || worldY >= CHUNK_HEIGHT) return BlockType.AIR;
  const cx = Math.floor(worldX / CHUNK_SIZE);
  const cz = Math.floor(worldZ / CHUNK_SIZE);
  const blocks = chunkBlocks.get(chunkKey(cx, cz));
  if (!blocks) return BlockType.AIR;
  const lx = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return blocks[lx + lz * CHUNK_SIZE + worldY * CHUNK_SIZE * CHUNK_SIZE];
}

function generateChunkBlocks(cx: number, cz: number): Uint8Array {
  const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
  const gen = terrainGenerator!;
  const worldOffsetX = cx * CHUNK_SIZE;
  const worldOffsetZ = cz * CHUNK_SIZE;

  const heightMap = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      heightMap[x + z * CHUNK_SIZE] = gen.getHeight(worldOffsetX + x, worldOffsetZ + z);
    }
  }

  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const worldX = worldOffsetX + x;
      const worldZ = worldOffsetZ + z;
      const surfaceHeight = heightMap[x + z * CHUNK_SIZE];

      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        let block: number = BlockType.AIR;
        if (y === 0) {
          block = BlockType.BEDROCK;
        } else if (y < surfaceHeight - 4) {
          if (gen.hasCave(worldX, y, worldZ)) {
            block = BlockType.AIR;
          } else {
            block = gen.getOre(worldX, y, worldZ);
          }
        } else if (y < surfaceHeight) {
          if (gen.hasCave(worldX, y, worldZ)) {
            block = BlockType.AIR;
          } else {
            block = BlockType.DIRT;
          }
        } else if (y === surfaceHeight) {
          if (y <= SEA_LEVEL + 1) {
            block = BlockType.SAND;
          } else if (y > 100) {
            block = BlockType.SNOW;
          } else {
            block = BlockType.GRASS;
          }
        } else if (y <= SEA_LEVEL && y > surfaceHeight) {
          block = BlockType.WATER;
        }

        if (block !== BlockType.AIR) {
          blocks[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = block;
        }
      }
    }
  }

  // Trees
  for (let z = 2; z < CHUNK_SIZE - 2; z++) {
    for (let x = 2; x < CHUNK_SIZE - 2; x++) {
      const worldX = worldOffsetX + x;
      const worldZ = worldOffsetZ + z;
      const surfaceHeight = heightMap[x + z * CHUNK_SIZE];

      if (blocks[x + z * CHUNK_SIZE + surfaceHeight * CHUNK_SIZE * CHUNK_SIZE] !== BlockType.GRASS) continue;
      if (surfaceHeight <= SEA_LEVEL + 1) continue;

      const hash = gen.posHash(worldX, worldZ);
      if (hash > 0.02) continue;

      const treeHeight = 4 + Math.floor(hash * 150) % 3;

      for (let ty = 1; ty <= treeHeight; ty++) {
        const y = surfaceHeight + ty;
        if (y < CHUNK_HEIGHT) {
          blocks[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = BlockType.WOOD;
        }
      }

      const leafBase = surfaceHeight + treeHeight - 1;
      for (let ly = 0; ly < 3; ly++) {
        const radius = ly === 2 ? 1 : 2;
        for (let lx = -radius; lx <= radius; lx++) {
          for (let lz = -radius; lz <= radius; lz++) {
            if (Math.abs(lx) === radius && Math.abs(lz) === radius && ly < 2) continue;
            const bx = x + lx;
            const bz = z + lz;
            const by = leafBase + ly;
            if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE && by < CHUNK_HEIGHT) {
              if (blocks[bx + bz * CHUNK_SIZE + by * CHUNK_SIZE * CHUNK_SIZE] === BlockType.AIR) {
                blocks[bx + bz * CHUNK_SIZE + by * CHUNK_SIZE * CHUNK_SIZE] = BlockType.LEAVES;
              }
            }
          }
        }
      }
    }
  }

  return blocks;
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'init') {
    terrainGenerator = new TerrainGenerator(msg.seed);
    // Store block diffs
    if (msg.blockDiffs) {
      for (const diff of msg.blockDiffs as { x: number; y: number; z: number; blockType: number }[]) {
        const cx = Math.floor(diff.x / CHUNK_SIZE);
        const cz = Math.floor(diff.z / CHUNK_SIZE);
        const key = chunkKey(cx, cz);
        const lx = ((diff.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((diff.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        let arr = blockDiffs.get(key);
        if (!arr) { arr = []; blockDiffs.set(key, arr); }
        arr.push({ lx, y: diff.y, lz, type: diff.blockType });
      }
    }
    (self as unknown as Worker).postMessage({ type: 'ready' });
    return;
  }

  if (msg.type === 'addDiff') {
    const diff = msg.diff as { x: number; y: number; z: number; blockType: number };
    const cx = Math.floor(diff.x / CHUNK_SIZE);
    const cz = Math.floor(diff.z / CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    const lx = ((diff.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((diff.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    let arr = blockDiffs.get(key);
    if (!arr) { arr = []; blockDiffs.set(key, arr); }
    arr.push({ lx, y: diff.y, lz, type: diff.blockType });
    // Also update the in-memory chunk if it exists
    const blocks = chunkBlocks.get(key);
    if (blocks) {
      blocks[lx + lz * CHUNK_SIZE + diff.y * CHUNK_SIZE * CHUNK_SIZE] = diff.blockType;
    }
    return;
  }

  if (msg.type === 'generateChunk') {
    const { cx, cz } = msg;
    const key = chunkKey(cx, cz);

    // Generate terrain blocks
    const blocks = generateChunkBlocks(cx, cz);

    // Apply block diffs
    const diffs = blockDiffs.get(key);
    if (diffs) {
      for (const d of diffs) {
        blocks[d.lx + d.lz * CHUNK_SIZE + d.y * CHUNK_SIZE * CHUNK_SIZE] = d.type;
      }
    }

    // Store for neighbor lookups
    chunkBlocks.set(key, blocks);

    // Mesh using neighbor data
    const result = meshBlocks(
      blocks, cx, cz, getBlock,
      UV_TABLE, TRANSPARENT_LUT, SOLID_LUT, LIQUID_LUT, TEXTURE_LUT,
    );

    // Build transferable list
    const transferables: ArrayBuffer[] = [];
    const addTransfer = (arr: Float32Array | Uint32Array | null) => {
      if (arr) transferables.push(arr.buffer as ArrayBuffer);
    };
    addTransfer(result.opaquePos);
    addTransfer(result.opaqueNrm);
    addTransfer(result.opaqueUv);
    addTransfer(result.opaqueCol);
    addTransfer(result.opaqueIdx);
    addTransfer(result.waterPos);
    addTransfer(result.waterNrm);
    addTransfer(result.waterUv);
    addTransfer(result.waterCol);
    addTransfer(result.waterIdx);

    (self as unknown as Worker).postMessage({
      type: 'chunkResult',
      cx,
      cz,
      blocks,
      ...result,
    }, transferables);
    return;
  }

  if (msg.type === 'unloadChunk') {
    const key = chunkKey(msg.cx, msg.cz);
    chunkBlocks.delete(key);
    return;
  }
};
