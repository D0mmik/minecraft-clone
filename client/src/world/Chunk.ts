import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../utils/constants';
import { BlockType } from './BlockType';
import { buildChunkMesh, buffersToGeometry } from './ChunkMesher';
import type { MeshBuffers } from './ChunkMesher';
import type { GetNeighborBlock } from '../types';

export class Chunk {
  chunkX: number;
  chunkZ: number;
  blocks: Uint8Array;
  mesh: THREE.Mesh | null;
  waterMesh: THREE.Mesh | null;
  isDirty: boolean;

  constructor(chunkX: number, chunkZ: number) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.mesh = null;
    this.waterMesh = null;
    this.isDirty = true;
  }

  getIndex(x: number, y: number, z: number): number {
    return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
  }

  getBlock(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return BlockType.AIR;
    }
    return this.blocks[this.getIndex(x, y, z)];
  }

  setBlock(x: number, y: number, z: number, type: number): void {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return;
    }
    this.blocks[this.getIndex(x, y, z)] = type;
    this.isDirty = true;
  }

  buildMesh(material: THREE.Material, waterMaterial: THREE.Material, getNeighborBlock: GetNeighborBlock): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
    }
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
    }

    const { opaqueGeo, waterGeo } = buildChunkMesh(this, getNeighborBlock);
    this._applyGeos(opaqueGeo, waterGeo, material, waterMaterial);
  }

  /** Build meshes from pre-computed buffers (from worker) */
  buildMeshFromBuffers(buffers: MeshBuffers, material: THREE.Material, waterMaterial: THREE.Material): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
    }
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
    }

    const { opaqueGeo, waterGeo } = buffersToGeometry(buffers);
    this._applyGeos(opaqueGeo, waterGeo, material, waterMaterial);
  }

  private _applyGeos(opaqueGeo: THREE.BufferGeometry | null, waterGeo: THREE.BufferGeometry | null, material: THREE.Material, waterMaterial: THREE.Material): void {
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

  dispose(): void {
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
