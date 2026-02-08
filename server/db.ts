import { Database } from 'bun:sqlite';
import { join } from 'path';
import { mkdirSync } from 'fs';

const dataDir = process.env.DATA_DIR || '.';
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, 'world.db');

const db = new Database(dbPath);
db.exec('PRAGMA journal_mode=WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS block_diffs (
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    z INTEGER NOT NULL,
    block_type INTEGER NOT NULL,
    PRIMARY KEY (x, y, z)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS world_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bans (
    username TEXT PRIMARY KEY,
    reason TEXT,
    banned_at INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS player_positions (
    username TEXT PRIMARY KEY,
    x REAL NOT NULL,
    y REAL NOT NULL,
    z REAL NOT NULL,
    yaw REAL NOT NULL DEFAULT 0,
    pitch REAL NOT NULL DEFAULT 0
  )
`);

const stmtLoadDiffs = db.prepare('SELECT x, y, z, block_type FROM block_diffs');
const stmtUpsertDiff = db.prepare(
  'INSERT OR REPLACE INTO block_diffs (x, y, z, block_type) VALUES (?, ?, ?, ?)'
);
const stmtGetMeta = db.prepare('SELECT value FROM world_meta WHERE key = ?');
const stmtSetMeta = db.prepare(
  'INSERT OR REPLACE INTO world_meta (key, value) VALUES (?, ?)'
);

export function loadBlockDiffs(): Map<string, number> {
  const diffs = new Map<string, number>();
  for (const row of stmtLoadDiffs.all() as { x: number; y: number; z: number; block_type: number }[]) {
    diffs.set(`${row.x},${row.y},${row.z}`, row.block_type);
  }
  return diffs;
}

export function saveBlockDiff(x: number, y: number, z: number, blockType: number): void {
  stmtUpsertDiff.run(x, y, z, blockType);
}

export function getWorldMeta(key: string): string | undefined {
  const row = stmtGetMeta.get(key) as { value: string } | null;
  return row?.value;
}

export function setWorldMeta(key: string, value: string): void {
  stmtSetMeta.run(key, value);
}

// --- Player Positions ---
const stmtGetPlayerPos = db.prepare('SELECT x, y, z, yaw, pitch FROM player_positions WHERE username = ?');
const stmtSavePlayerPos = db.prepare(
  'INSERT OR REPLACE INTO player_positions (username, x, y, z, yaw, pitch) VALUES (?, ?, ?, ?, ?, ?)'
);

export function getPlayerPosition(username: string): { x: number; y: number; z: number; yaw: number; pitch: number } | null {
  const row = stmtGetPlayerPos.get(username.toLowerCase()) as { x: number; y: number; z: number; yaw: number; pitch: number } | null;
  return row ?? null;
}

export function savePlayerPosition(username: string, x: number, y: number, z: number, yaw: number, pitch: number): void {
  stmtSavePlayerPos.run(username.toLowerCase(), x, y, z, yaw, pitch);
}

// --- Bans ---
const stmtAddBan = db.prepare('INSERT OR REPLACE INTO bans (username, reason, banned_at) VALUES (?, ?, ?)');
const stmtRemoveBan = db.prepare('DELETE FROM bans WHERE username = ?');
const stmtIsBanned = db.prepare('SELECT 1 FROM bans WHERE username = ?');
const stmtLoadBans = db.prepare('SELECT username, reason FROM bans');

export function addBan(username: string, reason: string): void {
  stmtAddBan.run(username.toLowerCase(), reason, Date.now());
}

export function removeBan(username: string): void {
  stmtRemoveBan.run(username.toLowerCase());
}

export function isBanned(username: string): boolean {
  return stmtIsBanned.get(username.toLowerCase()) != null;
}

export function loadBans(): Map<string, string> {
  const bans = new Map<string, string>();
  for (const row of stmtLoadBans.all() as { username: string; reason: string }[]) {
    bans.set(row.username, row.reason || '');
  }
  return bans;
}
