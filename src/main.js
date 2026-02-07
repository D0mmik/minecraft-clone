import { Renderer } from './graphics/Renderer.js';
import { Sky } from './graphics/Sky.js';
import { World } from './world/World.js';
import { Player } from './player/Player.js';
import { Controls } from './player/Controls.js';
import { HUD } from './ui/HUD.js';
import { NetworkClient } from './net/NetworkClient.js';
import { RemotePlayerManager } from './net/RemotePlayerManager.js';
import { ChatUI } from './ui/ChatUI.js';
import { UsernameModal } from './ui/UsernameModal.js';

class Game {
  constructor() {
    this.init();
  }

  async init() {
    // Show username modal first
    const modal = new UsernameModal();
    const { username, server } = await modal.show();

    // Setup game
    this.renderer = new Renderer();
    this.world = new World(this.renderer.scene);
    this.sky = new Sky(this.renderer.scene);
    this.player = new Player(this.world);
    this.controls = new Controls(this.renderer.camera, this.renderer.domElement);
    this.hud = new HUD(this.world.atlasCanvas);
    this.chatUI = new ChatUI();
    this.remotePlayers = new RemotePlayerManager(this.renderer.scene);
    this.network = new NetworkClient();

    // Wire chat to controls and give chat the canvas for re-locking pointer
    this.controls.chatUI = this.chatUI;
    this.chatUI.domElement = this.renderer.domElement;

    // Set spawn position
    const spawnX = 0;
    const spawnZ = 0;
    this.world.loadChunk(0, 0);
    const spawnY = this.world.getSpawnHeight(spawnX, spawnZ);
    this.player.position.set(spawnX, spawnY, spawnZ);

    // Click overlay to lock pointer
    const overlay = document.getElementById('overlay');
    overlay.addEventListener('click', () => {
      if (!this.chatUI.isOpen) {
        this.controls.lock();
      }
    });

    // Prevent right-click context menu
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // Connect to server
    this._positionTimer = 0;
    this._connected = false;
    this._disconnectOverlay = null;

    try {
      const wsUrl = this._buildWsUrl(server);
      await this.network.connect(wsUrl);
      this._connected = true;
      this.setupNetworkHandlers();
      this.network.sendJoin(username);
    } catch {
      // Offline mode — just play single player
      this.chatUI.addSystemMessage('Server not found — playing offline');
    }

    this.network.onDisconnect = () => {
      if (this._connected) {
        this._connected = false;
        this.showDisconnect();
      }
    };

    // Wire block change callback
    this.controls.onBlockChange = (x, y, z, blockType) => {
      if (this._connected) {
        this.network.sendBlockSet(x, y, z, blockType);
      }
    };

    // Wire chat open
    this.controls.onChatOpen = () => {
      this.chatUI.open();
    };

    // Wire chat send
    this.chatUI.onSend = (message) => {
      if (this._connected) {
        this.network.sendChat(message);
      }
    };

    // Start loop
    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  _buildWsUrl(server) {
    if (!server) {
      return `ws://${location.hostname || 'localhost'}:3001`;
    }
    // Already a full URL
    if (server.startsWith('ws://') || server.startsWith('wss://')) {
      return server;
    }
    // Tunnel domains (ngrok, trycloudflare, localtunnel, etc.) need wss
    const isIpOrLocalhost = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(server);
    const protocol = isIpOrLocalhost ? 'ws' : 'wss';
    return `${protocol}://${server}`;
  }

  setupNetworkHandlers() {
    this.network.on('init', (msg) => {
      this.network.id = msg.id;

      // Add existing players
      for (const p of msg.players) {
        this.remotePlayers.addPlayer(p.id, p.username, p.x, p.y, p.z, p.yaw);
      }

      // Apply block diffs for late joiner
      for (const diff of msg.blockDiffs) {
        this.world.setBlock(diff.x, diff.y, diff.z, diff.blockType);
      }
      if (msg.blockDiffs.length > 0) {
        this.world.flushDirtyChunks();
      }
    });

    this.network.on('player_join', (msg) => {
      this.remotePlayers.addPlayer(msg.id, msg.username, msg.x, msg.y, msg.z, 0);
      this.chatUI.addSystemMessage(`${msg.username} joined the game`);
    });

    this.network.on('player_leave', (msg) => {
      const entry = this.remotePlayers.players.get(msg.id);
      const name = entry ? entry.username : 'Player';
      this.remotePlayers.removePlayer(msg.id);
      this.chatUI.addSystemMessage(`${name} left the game`);
    });

    this.network.on('players_update', (msg) => {
      // Filter out self
      const others = msg.players.filter(p => p.id !== this.network.id);
      this.remotePlayers.updatePositions(others);
    });

    this.network.on('block_set', (msg) => {
      this.world.setBlock(msg.x, msg.y, msg.z, msg.blockType);
      this.world.flushDirtyChunks();
    });

    this.network.on('chat', (msg) => {
      this.chatUI.addChatMessage(msg.username, msg.message);
    });
  }

  showDisconnect() {
    if (this._disconnectOverlay) return;
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(180,0,0,0.8);color:#fff;padding:8px 16px;font-family:Courier New,monospace;font-size:14px;z-index:150;';
    div.textContent = 'Disconnected from server';
    document.body.appendChild(div);
    this._disconnectOverlay = div;
  }

  animate(currentTime) {
    requestAnimationFrame(this.animate);

    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    if (this.controls.locked && !(this.chatUI && this.chatUI.isOpen)) {
      // Get input
      const inputDir = this.controls.getInputDirection();
      const jumping = this.controls.isJumping();
      const sprinting = this.controls.isSprinting();

      // Update player physics
      this.player.update(dt, inputDir, this.controls.yaw, jumping, sprinting);

      // Update controls (camera + block interaction)
      this.controls.update(dt, this.world, this.player);

      // Flush batched dirty chunk rebuilds
      this.world.flushDirtyChunks();

      // Update world (chunk loading/unloading)
      this.world.update(this.player.position);

      // Update sky and day/night cycle
      const timeOfDay = this.sky.update(dt, this.player.position);
      this.renderer.updateLighting(timeOfDay);

      // Sprint FOV
      this.renderer.updateFov(sprinting && (Math.abs(inputDir.x) > 0 || Math.abs(inputDir.z) > 0), dt);
    } else if (this.controls.locked) {
      // Chat is open but still render camera position
      this.controls.update(dt, this.world, this.player);
      const timeOfDay = this.sky.update(dt, this.player.position);
      this.renderer.updateLighting(timeOfDay);
    }

    // Send position at 10 Hz
    if (this._connected) {
      this._positionTimer += dt;
      if (this._positionTimer >= 0.1) {
        this._positionTimer -= 0.1;
        const p = this.player.position;
        this.network.sendPosition(p.x, p.y, p.z, this.controls.yaw, this.controls.pitch);
      }
    }

    // Update remote player interpolation + animation
    this.remotePlayers.update(dt);

    // Update HUD
    this.hud.update(dt, this.player, this.world, this.controls, this.remotePlayers);

    // Render
    this.renderer.render();
  }
}

// Start
new Game();
