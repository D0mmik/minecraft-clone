export type BlockId = number;

// --- Network messages ---

// Client → Server
export type ClientMessage =
  | { type: 'join'; username: string }
  | { type: 'position'; x: number; y: number; z: number; yaw: number; pitch: number }
  | { type: 'block_set'; x: number; y: number; z: number; blockType: number }
  | { type: 'chat'; message: string }
  // Admin messages
  | { type: 'admin_auth'; key: string }
  | { type: 'admin_kick'; target: string }
  | { type: 'admin_ban'; target: string; reason?: string }
  | { type: 'admin_unban'; target: string }
  | { type: 'admin_chat'; message: string };

// Server → Client
export type ServerMessage =
  | { type: 'init'; id: string; players: ServerPlayerInfo[]; blockDiffs: BlockDiff[]; seed: number; timeOfDay: number }
  | { type: 'player_join'; id: string; username: string; x: number; y: number; z: number }
  | { type: 'player_leave'; id: string }
  | { type: 'players_update'; players: PlayerPositionData[] }
  | { type: 'block_set'; x: number; y: number; z: number; blockType: number }
  | { type: 'chat'; username: string; message: string }
  | { type: 'time_sync'; timeOfDay: number }
  // Admin messages
  | { type: 'admin_auth_result'; success: boolean }
  | { type: 'admin_state'; players: AdminPlayerInfo[]; playerCount: number; uptime: number; blockDiffsCount: number; seed: number; timeOfDay: number; bans: string[] }
  | { type: 'kicked'; reason: string }
  | { type: 'player_count'; count: number };

export interface ServerPlayerInfo {
  id: string;
  username: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface PlayerPositionData {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface BlockDiff {
  x: number;
  y: number;
  z: number;
  blockType: number;
}

export interface AdminPlayerInfo {
  id: string;
  username: string;
  x: number;
  y: number;
  z: number;
}
