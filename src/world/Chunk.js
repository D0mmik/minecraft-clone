import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../utils/constants.js';
import { BlockType, isTransparent, isSolid } from './BlockType.js';
import { buildChunkMesh } from './ChunkMesher.js';

export class Chunk {
  constructor(chunkX, chunkZ) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.mesh = null;
    this.waterMesh = null;
    this.isDirty = true;
  }

  getIndex(x, y, z) {
    return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
  }

  getBlock(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return BlockType.AIR;
    }
    return this.blocks[this.getIndex(x, y, z)];
  }

  setBlock(x, y, z, type) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return;
    }
    this.blocks[this.getIndex(x, y, z)] = type;
    this.isDirty = true;
  }

  buildMesh(material, waterMaterial, getNeighborBlock) {
    if (this.mesh) {
      this.mesh.geometry.dispose();
    }
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
    }

    const { opaqueGeo, waterGeo } = buildChunkMesh(this, getNeighborBlock);

    if (opaqueGeo) {
      this.mesh = new THREE.Mesh(opaqueGeo, material);
      this.mesh.position.set(
        this.chunkX * CHUNK_SIZE,
        0,
        this.chunkZ * CHUNK_SIZE
      );
      this.mesh.frustumCulled = true;
    } else {
      this.mesh = null;
    }

    if (waterGeo) {
      this.waterMesh = new THREE.Mesh(waterGeo, waterMaterial);
      this.waterMesh.position.set(
        this.chunkX * CHUNK_SIZE,
        0,
        this.chunkZ * CHUNK_SIZE
      );
      this.waterMesh.frustumCulled = true;
    } else {
      this.waterMesh = null;
    }

    this.isDirty = false;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      this.waterMesh = null;
    }
  }
}
