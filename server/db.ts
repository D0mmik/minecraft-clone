import { Database } from 'bun:sqlite';
import { join } from 'path';

const dataDir = process.env.DATA_DIR || '.';
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
