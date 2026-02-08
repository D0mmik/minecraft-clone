import type { ServerWebSocket } from 'bun';
import { join, extname } from 'path';
import { loadBlockDiffs, saveBlockDiff, getWorldMeta, setWorldMeta, addBan, removeBan, isBanned, loadBans } from './db';
import type { ClientMessage, ServerMessage, ServerPlayerInfo, BlockDiff, AdminPlayerInfo } from '../shared/types';

const PORT = Number(process.env.PORT) || 3001;
const TICK_RATE = 10; // 10 Hz position broadcast
const DAY_LENGTH_MS = 600_000; // 10 minutes per full cycle
const TIME_SYNC_INTERVAL = 5_000; // broadcast time every 5s
const TIME_SAVE_INTERVAL = 30_000; // persist time every 30s
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin';
const serverStartTime = Date.now();

// --- Persistence ---
const blockDiffs = loadBlockDiffs();

// Seed: load or generate
let seed: number;
const savedSeed = getWorldMeta('seed');
if (savedSeed !== undefined) {
  seed = Number(savedSeed);
} else {
  seed = Math.floor(Math.random() * 2147483647);
  setWorldMeta('seed', String(seed));
}

// Time of day: load or default
let timeOfDay: number;
const savedTime = getWorldMeta('timeOfDay');
if (savedTime !== undefined) {
  timeOfDay = Number(savedTime);
} else {
  timeOfDay = 0.35;
  setWorldMeta('timeOfDay', String(timeOfDay));
}

console.log(`World seed: ${seed}, timeOfDay: ${timeOfDay.toFixed(3)}, block diffs: ${blockDiffs.size}`);

// --- Time tracking ---
let lastTimeUpdate = Date.now();

function advanceTime(): void {
  const now = Date.now();
  const elapsed = now - lastTimeUpdate;
  lastTimeUpdate = now;
  timeOfDay = (timeOfDay + elapsed / DAY_LENGTH_MS) % 1;
}

// --- Players ---
interface ServerPlayer {
  id: string;
  username: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  ws: ServerWebSocket<WSData>;
}

interface WSData {
  id: string;
  isAdmin: boolean;
}

const players = new Map<string, ServerPlayer>();
const adminSockets = new Set<ServerWebSocket<WSData>>();
let nextId = 1;

function send(ws: ServerWebSocket<WSData>, data: ServerMessage): void {
  ws.send(JSON.stringify(data));
}

function broadcast(data: ServerMessage, excludeId: string | null): void {
  const raw = JSON.stringify(data);
  for (const [pid, p] of players) {
    if (pid === excludeId) continue;
    p.ws.send(raw);
  }
}

function broadcastPlayerCount(): void {
  const msg: ServerMessage = { type: 'player_count', count: players.size };
  const raw = JSON.stringify(msg);
  for (const [, p] of players) {
    p.ws.send(raw);
  }
}

function buildAdminState(): ServerMessage {
  advanceTime();
  const adminPlayers: AdminPlayerInfo[] = [];
  for (const [, p] of players) {
    adminPlayers.push({ id: p.id, username: p.username, x: p.x, y: p.y, z: p.z });
  }
  const bans = loadBans();
  return {
    type: 'admin_state',
    players: adminPlayers,
    playerCount: players.size,
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    blockDiffsCount: blockDiffs.size,
    seed,
    timeOfDay,
    bans: Array.from(bans.keys()),
  };
}

function notifyAdmins(): void {
  if (adminSockets.size === 0) return;
  const msg = JSON.stringify(buildAdminState());
  for (const ws of adminSockets) {
    ws.send(msg);
  }
}

// --- MIME types ---
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const DIST_DIR = join(import.meta.dir, '..', 'client', 'dist');
const ADMIN_DIST_DIR = join(import.meta.dir, '..', 'admin', 'dist');

// --- Server ---
Bun.serve<WSData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade on /ws
    if (url.pathname === '/ws') {
      if (server.upgrade(req, { data: { id: String(nextId++), isAdmin: false } })) {
        return;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Admin static files
    if (url.pathname.startsWith('/admin')) {
      let filePath = url.pathname.replace(/^\/admin\/?/, '/');
      if (filePath === '/') filePath = '/index.html';
      const file = Bun.file(join(ADMIN_DIST_DIR, filePath));
      return file.exists().then((exists) => {
        if (exists) {
          const ext = extname(filePath);
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          return new Response(file, { headers: { 'Content-Type': contentType } });
        }
        // SPA fallback for admin
        const indexFile = Bun.file(join(ADMIN_DIST_DIR, 'index.html'));
        return new Response(indexFile, { headers: { 'Content-Type': 'text/html' } });
      });
    }

    // Static file serving (production)
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = Bun.file(join(DIST_DIR, filePath));
    return file.exists().then((exists) => {
      if (exists) {
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        return new Response(file, { headers: { 'Content-Type': contentType } });
      }
      // SPA fallback
      const indexFile = Bun.file(join(DIST_DIR, 'index.html'));
      return new Response(indexFile, { headers: { 'Content-Type': 'text/html' } });
    });
  },
  websocket: {
    open(_ws) {
      // Connection opened, player registers on 'join' message
    },
    message(ws, raw) {
      const id = ws.data.id;
      let msg: ClientMessage;
      try { msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }

      const player = players.get(id);

      switch (msg.type) {
        // --- Admin messages ---
        case 'admin_auth': {
          if (msg.key === ADMIN_KEY) {
            ws.data.isAdmin = true;
            adminSockets.add(ws);
            send(ws, { type: 'admin_auth_result', success: true });
            send(ws, buildAdminState());
            console.log(`[ADMIN] Admin connected (id=${id})`);
          } else {
            send(ws, { type: 'admin_auth_result', success: false });
          }
          break;
        }

        case 'admin_kick': {
          if (!ws.data.isAdmin) return;
          const target = msg.target.toLowerCase();
          for (const [pid, p] of players) {
            if (p.username.toLowerCase() === target) {
              send(p.ws, { type: 'kicked', reason: 'Kicked by admin' });
              p.ws.close();
              console.log(`[ADMIN] Kicked ${p.username}`);
              break;
            }
          }
          notifyAdmins();
          break;
        }

        case 'admin_ban': {
          if (!ws.data.isAdmin) return;
          const target = msg.target.toLowerCase();
          const reason = msg.reason || 'Banned by admin';
          addBan(target, reason);
          // Kick if online
          for (const [pid, p] of players) {
            if (p.username.toLowerCase() === target) {
              send(p.ws, { type: 'kicked', reason: `Banned: ${reason}` });
              p.ws.close();
              break;
            }
          }
          console.log(`[ADMIN] Banned ${target}: ${reason}`);
          notifyAdmins();
          break;
        }

        case 'admin_unban': {
          if (!ws.data.isAdmin) return;
          removeBan(msg.target);
          console.log(`[ADMIN] Unbanned ${msg.target}`);
          notifyAdmins();
          break;
        }

        case 'admin_chat': {
          if (!ws.data.isAdmin) return;
          const message = String(msg.message || '').slice(0, 200);
          if (!message) return;
          broadcast({ type: 'chat', username: '[Admin]', message }, null);
          notifyAdmins();
          break;
        }

        // --- Game messages ---
        case 'join': {
          const username = String(msg.username || 'Player').slice(0, 16);

          // Ban check
          if (isBanned(username.toLowerCase())) {
            send(ws, { type: 'kicked', reason: 'You are banned from this server' });
            ws.close();
            return;
          }

          const newPlayer: ServerPlayer = {
            id,
            username,
            x: 0, y: 80, z: 0,
            yaw: 0, pitch: 0,
            ws,
          };
          players.set(id, newPlayer);

          // Send init to joining player
          const otherPlayers: ServerPlayerInfo[] = [];
          for (const [pid, p] of players) {
            if (pid === id) continue;
            otherPlayers.push({ id: pid, username: p.username, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
          }

          advanceTime();

          const initDiffs: BlockDiff[] = [];
          for (const [key, blockType] of blockDiffs) {
            const [x, y, z] = key.split(',').map(Number);
            initDiffs.push({ x, y, z, blockType });
          }

          const initMsg: ServerMessage = {
            type: 'init',
            id,
            players: otherPlayers,
            blockDiffs: initDiffs,
            seed,
            timeOfDay,
          };
          send(ws, initMsg);

          // Broadcast join to others
          broadcast({ type: 'player_join', id, username: newPlayer.username, x: newPlayer.x, y: newPlayer.y, z: newPlayer.z }, id);
          broadcastPlayerCount();
          notifyAdmins();
          console.log(`[+] ${newPlayer.username} joined (id=${id}), ${players.size} online`);
          break;
        }

        case 'position': {
          if (!player) return;
          player.x = msg.x;
          player.y = msg.y;
          player.z = msg.z;
          player.yaw = msg.yaw;
          player.pitch = msg.pitch;
          break;
        }

        case 'block_set': {
          if (!player) return;
          const { x, y, z, blockType } = msg;
          const key = `${x},${y},${z}`;
          blockDiffs.set(key, blockType);
          saveBlockDiff(x, y, z, blockType);
          broadcast({ type: 'block_set', x, y, z, blockType }, id);
          break;
        }

        case 'chat': {
          if (!player) return;
          const message = String(msg.message || '').slice(0, 200);
          if (!message) return;
          broadcast({ type: 'chat', username: player.username, message }, null);
          notifyAdmins();
          break;
        }
      }
    },
    close(ws) {
      const id = ws.data.id;

      // Clean up admin socket
      if (ws.data.isAdmin) {
        adminSockets.delete(ws);
        console.log(`[ADMIN] Admin disconnected (id=${id})`);
      }

      const player = players.get(id);
      if (player) {
        players.delete(id);
        broadcast({ type: 'player_leave', id }, null);
        broadcastPlayerCount();
        notifyAdmins();
        console.log(`[-] ${player.username} left (id=${id}), ${players.size} online`);
      }
    },
  },
});

// 10 Hz position broadcast
setInterval(() => {
  if (players.size < 2) return;
  const arr = [];
  for (const [, p] of players) {
    arr.push({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
  }
  const msg = JSON.stringify({ type: 'players_update', players: arr });
  for (const [, p] of players) {
    p.ws.send(msg);
  }
}, 1000 / TICK_RATE);

// Time sync broadcast every 5s
setInterval(() => {
  if (players.size === 0) return;
  advanceTime();
  broadcast({ type: 'time_sync', timeOfDay }, null);
}, TIME_SYNC_INTERVAL);

// Persist time every 30s
setInterval(() => {
  advanceTime();
  setWorldMeta('timeOfDay', String(timeOfDay));
}, TIME_SAVE_INTERVAL);

// Periodic admin state refresh (every 3s)
setInterval(() => {
  notifyAdmins();
}, 3_000);

console.log(`Server running on port ${PORT}`);
