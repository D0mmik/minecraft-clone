// Re-export shared network types
export type { BlockId, ClientMessage, ServerMessage, ServerPlayerInfo, PlayerPositionData, BlockDiff, AdminPlayerInfo } from '../../shared/types';

// Client-only types
export type FaceId = 0 | 1 | 2;

export interface InputDir {
  x: number;
  z: number;
}

export interface RaycastHit {
  x: number;
  y: number;
  z: number;
  block: number;
  nx: number;
  ny: number;
  nz: number;
}

export interface FaceDef {
  dir: [number, number, number];
  faceId: FaceId;
  axis: 0 | 1 | 2;
  pos: boolean;
  verts: [number, number, number][];
}

export type GetNeighborBlock = (wx: number, wy: number, wz: number) => number;

export interface RemotePlayerEntry {
  model: import('./net/PlayerModel').PlayerModel;
  username: string;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  prevX: number;
  prevZ: number;
  isMoving: boolean;
}

export interface ChunkLoadEntry {
  cx: number;
  cz: number;
  dist: number;
}
