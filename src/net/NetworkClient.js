export class NetworkClient {
  constructor() {
    this.ws = null;
    this.id = null;
    this.handlers = {};
    this.connected = false;
    this.onDisconnect = null;
  }

  connect(url) {
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

      this.ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        const handler = this.handlers[msg.type];
        if (handler) handler(msg);
      };
    });
  }

  on(type, handler) {
    this.handlers[type] = handler;
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendJoin(username) {
    this.send({ type: 'join', username });
  }

  sendPosition(x, y, z, yaw, pitch) {
    this.send({ type: 'position', x, y, z, yaw, pitch });
  }

  sendBlockSet(x, y, z, blockType) {
    this.send({ type: 'block_set', x, y, z, blockType });
  }

  sendChat(message) {
    this.send({ type: 'chat', message });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
