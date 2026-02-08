import { useState, useEffect, useRef, useCallback } from 'react';
import type { ClientMessage, ServerMessage, AdminPlayerInfo } from '../../shared/types';

export interface AdminState {
  players: AdminPlayerInfo[];
  playerCount: number;
  uptime: number;
  blockDiffsCount: number;
  seed: number;
  timeOfDay: number;
  bans: string[];
}

export function useAdminSocket() {
  const [connected, setConnected] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [state, setState] = useState<AdminState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (!key) return;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'admin_auth', key } satisfies ClientMessage));
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case 'admin_auth_result':
          setAuthed(msg.success);
          break;
        case 'admin_state':
          setState({
            players: msg.players,
            playerCount: msg.playerCount,
            uptime: msg.uptime,
            blockDiffsCount: msg.blockDiffsCount,
            seed: msg.seed,
            timeOfDay: msg.timeOfDay,
            bans: msg.bans,
          });
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setAuthed(false);
    };

    return () => { ws.close(); };
  }, []);

  const sendMsg = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const kick = useCallback((target: string) => {
    sendMsg({ type: 'admin_kick', target });
  }, [sendMsg]);

  const ban = useCallback((target: string, reason?: string) => {
    sendMsg({ type: 'admin_ban', target, reason });
  }, [sendMsg]);

  const unban = useCallback((target: string) => {
    sendMsg({ type: 'admin_unban', target });
  }, [sendMsg]);

  const sendChat = useCallback((message: string) => {
    sendMsg({ type: 'admin_chat', message });
  }, [sendMsg]);

  return { connected, authed, state, kick, ban, unban, sendChat };
}
