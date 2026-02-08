import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../utils/constants';
import { BlockType, isTransparent, isSolid, isLiquid, getBlockTexture } from './BlockType';
import { UV_TABLE } from './TextureAtlas';
import type { Chunk } from './Chunk';
import type { FaceDef, GetNeighborBlock } from '../types';

// Face directions: [dx, dy, dz, face name for texture, axis, positive direction]
// Vertex winding is CCW when viewed from the face normal direction (Three.js front-face convention)
// faceId: 0=top, 1=side, 2=bottom (matches TEXTURE_LUT)
const FACES: FaceDef[] = [
  { dir: [0, 1, 0],  faceId: 0, axis: 1, pos: true,  verts: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { dir: [0, -1, 0], faceId: 2, axis: 1, pos: false, verts: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { dir: [1, 0, 0],  faceId: 1, axis: 0, pos: true,  verts: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { dir: [-1, 0, 0], faceId: 1, axis: 0, pos: false, verts: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { dir: [0, 0, 1],  faceId: 1, axis: 2, pos: true,  verts: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
  { dir: [0, 0, -1], faceId: 1, axis: 2, pos: false, verts: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
];

// Hoisted AO multiplier constants
const AO_MULTIPLIERS = [0.4, 0.6, 0.8, 1.0];

// AO neighbor offsets for each vertex of a face, relative to the face normal direction
// For vertex at corner of a face, we check 2 edge neighbors and 1 corner neighbor
function computeAO(side1: number, side2: number, corner: number): number {
  if (side1 && side2) return 0;
  return 3 - (side1 + side2 + corner);
}

// Pre-computed bounding sphere for chunks
const CHUNK_CENTER_X = CHUNK_SIZE / 2;
const CHUNK_CENTER_Y = CHUNK_HEIGHT / 2;
const CHUNK_CENTER_Z = CHUNK_SIZE / 2;
const CHUNK_BOUNDING_RADIUS = Math.sqrt(
  CHUNK_CENTER_X * CHUNK_CENTER_X +
  CHUNK_CENTER_Y * CHUNK_CENTER_Y +
  CHUNK_CENTER_Z * CHUNK_CENTER_Z
);
const CHUNK_BOUNDING_CENTER = new THREE.Vector3(CHUNK_CENTER_X, CHUNK_CENTER_Y, CHUNK_CENTER_Z);

// Pre-allocated typed array buffers (reused for every chunk build)
// Opaque: 50,000 faces max = 200,000 vertices
const MAX_OPAQUE_VERTS = 200000;
const MAX_OPAQUE_FACES = 50000;
// Water: 10,000 faces max = 40,000 vertices
const MAX_WATER_VERTS = 40000;
const MAX_WATER_FACES = 10000;

const opaquePosBuffer = new Float32Array(MAX_OPAQUE_VERTS * 3);
const opaqueNrmBuffer = new Float32Array(MAX_OPAQUE_VERTS * 3);
const opaqueUvBuffer  = new Float32Array(MAX_OPAQUE_VERTS * 2);
const opaqueColBuffer = new Float32Array(MAX_OPAQUE_VERTS * 3);
const opaqueIdxBuffer = new Uint32Array(MAX_OPAQUE_FACES * 6);

const waterPosBuffer = new Float32Array(MAX_WATER_VERTS * 3);
const waterNrmBuffer = new Float32Array(MAX_WATER_VERTS * 3);
const waterUvBuffer  = new Float32Array(MAX_WATER_VERTS * 2);
const waterColBuffer = new Float32Array(MAX_WATER_VERTS * 3);
const waterIdxBuffer = new Uint32Array(MAX_WATER_FACES * 6);

// Inline getBlock for interior vs boundary
function isSolidAt(chunk: Chunk, x: number, y: number, z: number, getNeighborBlock: GetNeighborBlock): number {
  let block: number;
  if (y < 0 || y >= CHUNK_HEIGHT) {
    block = BlockType.AIR;
  } else if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
    block = chunk.blocks[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
  } else {
    const worldX = chunk.chunkX * CHUNK_SIZE + x;
    const worldZ = chunk.chunkZ * CHUNK_SIZE + z;
    block = getNeighborBlock(worldX, y, worldZ);
  }
  return isSolid(block);
}

export function buildChunkMesh(chunk: Chunk, getNeighborBlock: GetNeighborBlock): { opaqueGeo: THREE.BufferGeometry | null; waterGeo: THREE.BufferGeometry | null } {
  let opaqueVertCount = 0;
  let opaqueIdxCount = 0;
  let waterVertCount = 0;
  let waterIdxCount = 0;

  const blocks = chunk.blocks;
  const chunkSizeSq = CHUNK_SIZE * CHUNK_SIZE;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    const yOffset = y * chunkSizeSq;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const zOffset = z * CHUNK_SIZE;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = blocks[x + zOffset + yOffset];
        if (block === BlockType.AIR) continue;

        const blockIsWater = isLiquid(block);
        const blockIsTransparent = isTransparent(block);

        // Hoist buffer selection outside face loop (constant per block)
        const posBuf = blockIsWater ? waterPosBuffer : opaquePosBuffer;
        const nrmBuf = blockIsWater ? waterNrmBuffer : opaqueNrmBuffer;
        const uvBuf  = blockIsWater ? waterUvBuffer  : opaqueUvBuffer;
        const colBuf = blockIsWater ? waterColBuffer : opaqueColBuffer;
        const idxBuf = blockIsWater ? waterIdxBuffer : opaqueIdxBuffer;

        for (let fi = 0; fi < 6; fi++) {
          const faceInfo = FACES[fi];
          const dx = faceInfo.dir[0];
          const dy = faceInfo.dir[1];
          const dz = faceInfo.dir[2];
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;

          // Inline neighbor block lookup for interior blocks
          let neighbor: number;
          if (ny < 0 || ny >= CHUNK_HEIGHT) {
            neighbor = BlockType.AIR;
          } else if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
            neighbor = blocks[nx + nz * CHUNK_SIZE + ny * chunkSizeSq];
          } else {
            const worldX = chunk.chunkX * CHUNK_SIZE + nx;
            const worldZ = chunk.chunkZ * CHUNK_SIZE + nz;
            neighbor = getNeighborBlock(worldX, ny, worldZ);
          }

          // Determine if we should render this face
          let shouldRender = false;
          if (blockIsWater) {
            shouldRender = neighbor === BlockType.AIR;
          } else if (block === BlockType.GLASS) {
            shouldRender = neighbor !== BlockType.GLASS;
          } else if (blockIsTransparent) {
            shouldRender = neighbor !== block && !!isTransparent(neighbor);
          } else {
            shouldRender = !!isTransparent(neighbor);
          }

          if (!shouldRender) continue;

          // Compute buffer offsets
          let vCount: number, posOff: number, uvOff: number, idxOff: number;
          if (blockIsWater) {
            vCount = waterVertCount;
            posOff = waterVertCount * 3;
            uvOff = waterVertCount * 2;
            idxOff = waterIdxCount;
          } else {
            vCount = opaqueVertCount;
            posOff = opaqueVertCount * 3;
            uvOff = opaqueVertCount * 2;
            idxOff = opaqueIdxCount;
          }

          // Get texture UVs from pre-computed table
          const texIndex = getBlockTexture(block, faceInfo.faceId);
          const ti4 = texIndex * 4;
          const u0 = UV_TABLE[ti4];
          const v0 = UV_TABLE[ti4 + 1];
          const u1 = UV_TABLE[ti4 + 2];
          const v1 = UV_TABLE[ti4 + 3];

          // Compute AO for each vertex of this face
          let ao0 = 3, ao1 = 3, ao2 = 3, ao3 = 3;
          if (!blockIsWater) {
            const vertAO = computeFaceAO(chunk, x, y, z, faceInfo, getNeighborBlock);
            ao0 = vertAO[0];
            ao1 = vertAO[1];
            ao2 = vertAO[2];
            ao3 = vertAO[3];
          }

          // Emit 4 vertices for this face (unrolled)
          const waterTop = blockIsWater && fi === 0;
          const v0x = faceInfo.verts[0], v1x = faceInfo.verts[1], v2x = faceInfo.verts[2], v3x = faceInfo.verts[3];

          // Vertex 0
          posBuf[posOff]     = x + v0x[0];
          posBuf[posOff + 1] = waterTop ? y + 0.9 : y + v0x[1];
          posBuf[posOff + 2] = z + v0x[2];
          nrmBuf[posOff]     = dx; nrmBuf[posOff + 1] = dy; nrmBuf[posOff + 2] = dz;
          const b0 = AO_MULTIPLIERS[ao0];
          colBuf[posOff] = b0; colBuf[posOff + 1] = b0; colBuf[posOff + 2] = b0;

          // Vertex 1
          posBuf[posOff + 3] = x + v1x[0];
          posBuf[posOff + 4] = waterTop ? y + 0.9 : y + v1x[1];
          posBuf[posOff + 5] = z + v1x[2];
          nrmBuf[posOff + 3] = dx; nrmBuf[posOff + 4] = dy; nrmBuf[posOff + 5] = dz;
          const b1 = AO_MULTIPLIERS[ao1];
          colBuf[posOff + 3] = b1; colBuf[posOff + 4] = b1; colBuf[posOff + 5] = b1;

          // Vertex 2
          posBuf[posOff + 6] = x + v2x[0];
          posBuf[posOff + 7] = waterTop ? y + 0.9 : y + v2x[1];
          posBuf[posOff + 8] = z + v2x[2];
          nrmBuf[posOff + 6] = dx; nrmBuf[posOff + 7] = dy; nrmBuf[posOff + 8] = dz;
          const b2 = AO_MULTIPLIERS[ao2];
          colBuf[posOff + 6] = b2; colBuf[posOff + 7] = b2; colBuf[posOff + 8] = b2;

          // Vertex 3
          posBuf[posOff + 9]  = x + v3x[0];
          posBuf[posOff + 10] = waterTop ? y + 0.9 : y + v3x[1];
          posBuf[posOff + 11] = z + v3x[2];
          nrmBuf[posOff + 9] = dx; nrmBuf[posOff + 10] = dy; nrmBuf[posOff + 11] = dz;
          const b3 = AO_MULTIPLIERS[ao3];
          colBuf[posOff + 9] = b3; colBuf[posOff + 10] = b3; colBuf[posOff + 11] = b3;

          // UV writes: [u0,v0], [u0,v1], [u1,v1], [u1,v0]
          uvBuf[uvOff]     = u0; uvBuf[uvOff + 1] = v0;
          uvBuf[uvOff + 2] = u0; uvBuf[uvOff + 3] = v1;
          uvBuf[uvOff + 4] = u1; uvBuf[uvOff + 5] = v1;
          uvBuf[uvOff + 6] = u1; uvBuf[uvOff + 7] = v0;

          // Determine triangle winding based on AO to fix anisotropy
          if (ao0 + ao2 > ao1 + ao3) {
            idxBuf[idxOff]     = vCount;
            idxBuf[idxOff + 1] = vCount + 1;
            idxBuf[idxOff + 2] = vCount + 2;
            idxBuf[idxOff + 3] = vCount;
            idxBuf[idxOff + 4] = vCount + 2;
            idxBuf[idxOff + 5] = vCount + 3;
          } else {
            idxBuf[idxOff]     = vCount + 1;
            idxBuf[idxOff + 1] = vCount + 2;
            idxBuf[idxOff + 2] = vCount + 3;
            idxBuf[idxOff + 3] = vCount + 1;
            idxBuf[idxOff + 4] = vCount + 3;
            idxBuf[idxOff + 5] = vCount;
          }

          if (blockIsWater) {
            waterVertCount += 4;
            waterIdxCount += 6;
          } else {
            opaqueVertCount += 4;
            opaqueIdxCount += 6;
          }
        }
      }
    }
  }

  let opaqueGeo: THREE.BufferGeometry | null = null;
  if (opaqueVertCount > 0) {
    opaqueGeo = new THREE.BufferGeometry();
    opaqueGeo.setAttribute('position', new THREE.BufferAttribute(opaquePosBuffer.slice(0, opaqueVertCount * 3), 3));
    opaqueGeo.setAttribute('normal', new THREE.BufferAttribute(opaqueNrmBuffer.slice(0, opaqueVertCount * 3), 3));
    opaqueGeo.setAttribute('uv', new THREE.BufferAttribute(opaqueUvBuffer.slice(0, opaqueVertCount * 2), 2));
    opaqueGeo.setAttribute('color', new THREE.BufferAttribute(opaqueColBuffer.slice(0, opaqueVertCount * 3), 3));
    opaqueGeo.setIndex(new THREE.BufferAttribute(opaqueIdxBuffer.slice(0, opaqueIdxCount), 1));
    // Pre-computed bounding sphere instead of scanning all vertices
    opaqueGeo.boundingSphere = new THREE.Sphere(CHUNK_BOUNDING_CENTER.clone(), CHUNK_BOUNDING_RADIUS);
  }

  let waterGeo: THREE.BufferGeometry | null = null;
  if (waterVertCount > 0) {
    waterGeo = new THREE.BufferGeometry();
    waterGeo.setAttribute('position', new THREE.BufferAttribute(waterPosBuffer.slice(0, waterVertCount * 3), 3));
    waterGeo.setAttribute('normal', new THREE.BufferAttribute(waterNrmBuffer.slice(0, waterVertCount * 3), 3));
    waterGeo.setAttribute('uv', new THREE.BufferAttribute(waterUvBuffer.slice(0, waterVertCount * 2), 2));
    waterGeo.setAttribute('color', new THREE.BufferAttribute(waterColBuffer.slice(0, waterVertCount * 3), 3));
    waterGeo.setIndex(new THREE.BufferAttribute(waterIdxBuffer.slice(0, waterIdxCount), 1));
    waterGeo.boundingSphere = new THREE.Sphere(CHUNK_BOUNDING_CENTER.clone(), CHUNK_BOUNDING_RADIUS);
  }

  return { opaqueGeo, waterGeo };
}

// Module-level reusable AO array (avoids allocation per face)
const _faceAO = [3, 3, 3, 3];

function computeFaceAO(chunk: Chunk, x: number, y: number, z: number, faceInfo: FaceDef, getNeighborBlock: GetNeighborBlock): number[] {
  const [dx, dy, dz] = faceInfo.dir;
  _faceAO[0] = 3; _faceAO[1] = 3; _faceAO[2] = 3; _faceAO[3] = 3;

  // For each vertex, determine the 3 neighbor checks for AO
  // The neighbors are relative to the face direction
  for (let vi = 0; vi < 4; vi++) {
    const v = faceInfo.verts[vi];
    // Vertex position in local block coords
    const vx = v[0], vy = v[1], vz = v[2];

    // Compute edge and corner neighbors based on vertex position relative to face
    // The face normal direction tells us which axis is "out"
    // The two other axes define the face plane
    let side1Solid: number, side2Solid: number, cornerSolid: number;

    if (faceInfo.axis === 1) {
      // Y axis face (top/bottom)
      const sy = dy > 0 ? y + 1 : y - 1;
      const s1x = vx === 0 ? x - 1 : x + 1;
      const s1z = z;
      const s2x = x;
      const s2z = vz === 0 ? z - 1 : z + 1;
      const cx = s1x;
      const cz = s2z;
      side1Solid = isSolidAt(chunk, s1x, sy, s1z, getNeighborBlock) ? 1 : 0;
      side2Solid = isSolidAt(chunk, s2x, sy, s2z, getNeighborBlock) ? 1 : 0;
      cornerSolid = isSolidAt(chunk, cx, sy, cz, getNeighborBlock) ? 1 : 0;
    } else if (faceInfo.axis === 0) {
      // X axis face (left/right)
      const sx = dx > 0 ? x + 1 : x - 1;
      const s1y = vy === 0 ? y - 1 : y + 1;
      const s1z = z;
      const s2y = y;
      const s2z = vz === 0 ? z - 1 : z + 1;
      const cy = s1y;
      const cz = s2z;
      side1Solid = isSolidAt(chunk, sx, s1y, s1z, getNeighborBlock) ? 1 : 0;
      side2Solid = isSolidAt(chunk, sx, s2y, s2z, getNeighborBlock) ? 1 : 0;
      cornerSolid = isSolidAt(chunk, sx, cy, cz, getNeighborBlock) ? 1 : 0;
    } else {
      // Z axis face (front/back)
      const sz = dz > 0 ? z + 1 : z - 1;
      const s1x = vx === 0 ? x - 1 : x + 1;
      const s1y = y;
      const s2x = x;
      const s2y = vy === 0 ? y - 1 : y + 1;
      const cx = s1x;
      const cy = s2y;
      side1Solid = isSolidAt(chunk, s1x, s1y, sz, getNeighborBlock) ? 1 : 0;
      side2Solid = isSolidAt(chunk, s2x, s2y, sz, getNeighborBlock) ? 1 : 0;
      cornerSolid = isSolidAt(chunk, cx, cy, sz, getNeighborBlock) ? 1 : 0;
    }

    _faceAO[vi] = computeAO(side1Solid, side2Solid, cornerSolid);
  }

  return _faceAO;
}
