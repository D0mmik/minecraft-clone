import type { ClientMessage, ServerMessage } from '../types';

type ServerMessageType = ServerMessage['type'];
type MessageHandler<T extends ServerMessageType> = (msg: Extract<ServerMessage, { type: T }>) => void;

export class NetworkClient {
  ws: WebSocket | null;
  id: string | null;
  private handlers: { [K in ServerMessageType]?: MessageHandler<K> };
  connected: boolean;
  onDisconnect: (() => void) | null;

  constructor() {
    this.ws = null;
    this.id = null;
    this.handlers = {};
    this.connected = false;
    this.onDisconnect = null;
  }

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      };

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        this.connected = false;
        if (this.onDisconnect) this.onDisconnect();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        let msg: ServerMessage;
        try { msg = JSON.parse(event.data as string); } catch { return; }
        const handler = this.handlers[msg.type] as MessageHandler<typeof msg.type> | undefined;
        if (handler) handler(msg as never);
      };
    });
  }

  on<T extends ServerMessageType>(type: T, handler: MessageHandler<T>): void {
    (this.handlers as Record<string, unknown>)[type] = handler;
  }

  send(data: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendJoin(username: string): void {
    this.send({ type: 'join', username });
  }

  sendPosition(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.send({ type: 'position', x, y, z, yaw, pitch });
  }

  sendBlockSet(x: number, y: number, z: number, blockType: number): void {
    this.send({ type: 'block_set', x, y, z, blockType });
  }

  sendChat(message: string): void {
    this.send({ type: 'chat', message });
  }

  sendAttack(targetId: string): void {
    this.send({ type: 'attack', targetId });
  }

  sendFallDamage(amount: number): void {
    this.send({ type: 'fall_damage', amount });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
