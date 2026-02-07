import { WebSocketServer } from 'ws';

const PORT = 3001;
const TICK_RATE = 10; // 10 Hz position broadcast

const wss = new WebSocketServer({ port: PORT });

const players = new Map();   // id -> { id, username, x, y, z, yaw, pitch, ws }
const blockDiffs = new Map(); // "x,y,z" -> blockType

let nextId = 1;

wss.on('connection', (ws) => {
  const id = String(nextId++);
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join': {
        player = {
          id,
          username: String(msg.username || 'Player').slice(0, 16),
          x: 0, y: 80, z: 0,
          yaw: 0, pitch: 0,
          ws,
        };
        players.set(id, player);

        // Send init to joining player
        const otherPlayers = [];
        for (const [pid, p] of players) {
          if (pid === id) continue;
          otherPlayers.push({ id: pid, username: p.username, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
        }
        send(ws, {
          type: 'init',
          id,
          players: otherPlayers,
          blockDiffs: [...blockDiffs.entries()].map(([key, blockType]) => {
            const [x, y, z] = key.split(',').map(Number);
            return { x, y, z, blockType };
          }),
        });

        // Broadcast join to others
        broadcast({ type: 'player_join', id, username: player.username, x: player.x, y: player.y, z: player.z }, id);
        console.log(`[+] ${player.username} joined (id=${id}), ${players.size} online`);
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
        if (blockType === 0) {
          blockDiffs.set(key, blockType);
        } else {
          blockDiffs.set(key, blockType);
        }
        // Broadcast to all OTHER players
        broadcast({ type: 'block_set', x, y, z, blockType }, id);
        break;
      }

      case 'chat': {
        if (!player) return;
        const message = String(msg.message || '').slice(0, 200);
        if (!message) return;
        // Broadcast to ALL including sender
        broadcast({ type: 'chat', username: player.username, message }, null);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (player) {
      players.delete(id);
      broadcast({ type: 'player_leave', id }, null);
      console.log(`[-] ${player.username} left (id=${id}), ${players.size} online`);
    }
  });

  ws.on('error', () => {
    // Handled by close event
  });
});

function send(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data, excludeId) {
  const raw = JSON.stringify(data);
  for (const [pid, p] of players) {
    if (pid === excludeId) continue;
    if (p.ws.readyState === 1) {
      p.ws.send(raw);
    }
  }
}

// 10 Hz position broadcast
setInterval(() => {
  if (players.size < 2) return;
  const arr = [];
  for (const [, p] of players) {
    arr.push({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
  }
  const msg = JSON.stringify({ type: 'players_update', players: arr });
  for (const [, p] of players) {
    if (p.ws.readyState === 1) {
      p.ws.send(msg);
    }
  }
}, 1000 / TICK_RATE);

console.log(`Multiplayer server running on ws://localhost:${PORT}`);
