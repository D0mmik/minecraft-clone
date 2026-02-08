import { createNoise2D, createNoise3D } from 'simplex-noise';
import { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } from '../utils/constants';
import { BlockType } from './BlockType';
import type { Chunk } from './Chunk';

export class TerrainGenerator {
  private noise2D: ReturnType<typeof createNoise2D>;
  private noise3D: ReturnType<typeof createNoise3D>;
  private treeRng: () => number;

  constructor(seed = 12345) {
    // Create seeded PRNG
    const rng = this.createRNG(seed);
    this.noise2D = createNoise2D(rng);
    this.noise3D = createNoise3D(rng);
    this.treeRng = this.createRNG(seed + 1);
  }

  createRNG(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  fbm2D(x: number, z: number, octaves: number, persistence: number, lacunarity: number, scale: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      value += this.noise2D(x * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return value / maxValue;
  }

  getHeight(worldX: number, worldZ: number): number {
    // Base height from multi-octave noise
    const baseNoise = this.fbm2D(worldX, worldZ, 4, 0.5, 2.0, 0.005);

    // Biome variation - controls amplitude
    const biomeNoise = this.fbm2D(worldX + 1000, worldZ + 1000, 2, 0.5, 2.0, 0.002);
    const biomeAmplitude = 20 + (biomeNoise + 1) * 20; // 20-60 range

    const baseHeight = 64;
    return Math.floor(baseHeight + baseNoise * biomeAmplitude);
  }

  hasCave(worldX: number, worldY: number, worldZ: number): boolean {
    const n = this.noise3D(worldX * 0.05, worldY * 0.05, worldZ * 0.05);
    return n > 0.6;
  }

  getOre(worldX: number, worldY: number, worldZ: number): number {
    // Diamond: rare, deep
    if (worldY < 16) {
      const n = this.noise3D(worldX * 0.15 + 500, worldY * 0.15, worldZ * 0.15 + 500);
      if (n > 0.85) return BlockType.DIAMOND_ORE;
    }
    // Iron: moderate depth
    if (worldY < 64) {
      const n = this.noise3D(worldX * 0.12 + 200, worldY * 0.12, worldZ * 0.12 + 200);
      if (n > 0.8) return BlockType.IRON_ORE;
    }
    // Coal: common, anywhere underground
    const n = this.noise3D(worldX * 0.1 + 100, worldY * 0.1, worldZ * 0.1 + 100);
    if (n > 0.75) return BlockType.COAL_ORE;

    return BlockType.STONE;
  }

  generateChunk(chunk: Chunk): void {
    const worldOffsetX = chunk.chunkX * CHUNK_SIZE;
    const worldOffsetZ = chunk.chunkZ * CHUNK_SIZE;

    // Precompute height map for this chunk
    const heightMap = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        heightMap[x + z * CHUNK_SIZE] = this.getHeight(worldOffsetX + x, worldOffsetZ + z);
      }
    }

    // Fill blocks
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
            // Deep stone layer with ores and caves
            if (this.hasCave(worldX, y, worldZ)) {
              block = BlockType.AIR;
            } else {
              block = this.getOre(worldX, y, worldZ);
            }
          } else if (y < surfaceHeight) {
            // Dirt layer
            if (this.hasCave(worldX, y, worldZ)) {
              block = BlockType.AIR;
            } else {
              block = BlockType.DIRT;
            }
          } else if (y === surfaceHeight) {
            // Surface block
            if (y <= SEA_LEVEL + 1) {
              block = BlockType.SAND;
            } else if (y > 100) {
              block = BlockType.SNOW;
            } else {
              block = BlockType.GRASS;
            }
          } else if (y <= SEA_LEVEL && y > surfaceHeight) {
            // Water fills to sea level
            block = BlockType.WATER;
          }

          if (block !== BlockType.AIR) {
            chunk.setBlock(x, y, z, block);
          }
        }
      }
    }

    // Generate trees
    this.generateTrees(chunk, heightMap, worldOffsetX, worldOffsetZ);
  }

  generateTrees(chunk: Chunk, heightMap: Int32Array, worldOffsetX: number, worldOffsetZ: number): void {
    for (let z = 2; z < CHUNK_SIZE - 2; z++) {
      for (let x = 2; x < CHUNK_SIZE - 2; x++) {
        const worldX = worldOffsetX + x;
        const worldZ = worldOffsetZ + z;
        const surfaceHeight = heightMap[x + z * CHUNK_SIZE];

        // Only place trees on grass
        if (chunk.getBlock(x, surfaceHeight, z) !== BlockType.GRASS) continue;
        if (surfaceHeight <= SEA_LEVEL + 1) continue;

        // Random chance based on position hash
        const hash = this.posHash(worldX, worldZ);
        if (hash > 0.02) continue;

        const treeHeight = 4 + Math.floor(hash * 150) % 3; // 4-6

        // Trunk
        for (let ty = 1; ty <= treeHeight; ty++) {
          const y = surfaceHeight + ty;
          if (y < CHUNK_HEIGHT) {
            chunk.setBlock(x, y, z, BlockType.WOOD);
          }
        }

        // Leaves canopy
        const leafBase = surfaceHeight + treeHeight - 1;
        for (let ly = 0; ly < 3; ly++) {
          const radius = ly === 2 ? 1 : 2;
          for (let lx = -radius; lx <= radius; lx++) {
            for (let lz = -radius; lz <= radius; lz++) {
              // Skip corners for rounder shape
              if (Math.abs(lx) === radius && Math.abs(lz) === radius && ly < 2) continue;
              const bx = x + lx;
              const bz = z + lz;
              const by = leafBase + ly;
              if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE && by < CHUNK_HEIGHT) {
                if (chunk.getBlock(bx, by, bz) === BlockType.AIR) {
                  chunk.setBlock(bx, by, bz, BlockType.LEAVES);
                }
              }
            }
          }
        }
      }
    }
  }

  posHash(x: number, z: number): number {
    // Deterministic hash for tree placement
    let h = (x * 374761393 + z * 668265263) & 0x7fffffff;
    h = ((h >> 13) ^ h) * 1274126177;
    h = ((h >> 16) ^ h) & 0x7fffffff;
    return h / 0x7fffffff;
  }
}
