import { Renderer } from './graphics/Renderer';
import { Sky } from './graphics/Sky';
import { World } from './world/World';
import { Player } from './player/Player';
import { Controls } from './player/Controls';
import { HUD } from './ui/HUD';
import { NetworkClient } from './net/NetworkClient';
import { RemotePlayerManager } from './net/RemotePlayerManager';
import { ChatUI } from './ui/ChatUI';
import { UsernameModal } from './ui/UsernameModal';
import type { BlockDiff } from './types';

class Game {
  private renderer!: Renderer;
  private world!: World;
  private sky!: Sky;
  private player!: Player;
  private controls!: Controls;
  private hud!: HUD;
  private chatUI!: ChatUI;
  private remotePlayers!: RemotePlayerManager;
  private network!: NetworkClient;
  private lastTime!: number;
  private _positionTimer!: number;
  private _connected!: boolean;
  private _disconnectOverlay: HTMLDivElement | null = null;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // Show username modal first
    const modal = new UsernameModal();
    const { username } = await modal.show();

    // Setup renderer, sky, UI (no World yet — need seed from server)
    this.renderer = new Renderer();
    this.sky = new Sky(this.renderer.scene);
    this.chatUI = new ChatUI();
    this.remotePlayers = new RemotePlayerManager(this.renderer.scene);
    this.network = new NetworkClient();

    // Try to connect and get init data from server
    let seed = 12345;
    let initTimeOfDay = 0.35;
    let initBlockDiffs: BlockDiff[] = [];
    this._positionTimer = 0;
    this._connected = false;
    this._disconnectOverlay = null;

    try {
      const wsUrl = this._buildWsUrl();
      await this.network.connect(wsUrl);
      this._connected = true;

      // Wait for init message with seed, timeOfDay, blockDiffs
      const initData = await this._awaitInit(username);
      seed = initData.seed;
      initTimeOfDay = initData.timeOfDay;
      initBlockDiffs = initData.blockDiffs;

      // Add existing players
      for (const p of initData.players) {
        this.remotePlayers.addPlayer(p.id, p.username, p.x, p.y, p.z, p.yaw);
      }
    } catch {
      // Offline mode — just play single player
      this.chatUI.addSystemMessage('Server not found — playing offline');
    }

    // Now create World with the server's seed
    this.world = new World(this.renderer.scene, seed);
    this.hud = new HUD(this.world.atlasCanvas);

    // Store block diffs — applied per-chunk as chunks load
    this.world.applyBlockDiffs(initBlockDiffs);

    // Set server time
    this.sky.timeOfDay = initTimeOfDay;

    // Create player and controls (depend on World)
    this.player = new Player(this.world);
    this.controls = new Controls(this.renderer.camera, this.renderer.domElement);

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
    const overlay = document.getElementById('overlay')!;
    overlay.addEventListener('click', () => {
      if (!this.chatUI.isOpen) {
        this.controls.lock();
      }
    });

    // Prevent right-click context menu
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // Setup remaining network handlers (non-init)
    if (this._connected) {
      this._setupLiveHandlers();
    }

    this.network.onDisconnect = () => {
      if (this._connected) {
        this._connected = false;
        this.showDisconnect();
      }
    };

    // Wire block change callback
    this.controls.onBlockChange = (x: number, y: number, z: number, blockType: number) => {
      if (this._connected) {
        this.network.sendBlockSet(x, y, z, blockType);
      }
    };

    // Wire chat open
    this.controls.onChatOpen = () => {
      this.chatUI.open();
    };

    // Wire chat send
    this.chatUI.onSend = (message: string) => {
      if (this._connected) {
        this.network.sendChat(message);
      }
    };

    // Start loop
    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  private _buildWsUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  private _awaitInit(username: string): Promise<{
    id: string;
    players: { id: string; username: string; x: number; y: number; z: number; yaw: number }[];
    blockDiffs: BlockDiff[];
    seed: number;
    timeOfDay: number;
  }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Init timeout')), 10_000);

      this.network.on('init', (msg) => {
        clearTimeout(timeout);
        this.network.id = msg.id;
        resolve({
          id: msg.id,
          players: msg.players,
          blockDiffs: msg.blockDiffs,
          seed: msg.seed,
          timeOfDay: msg.timeOfDay,
        });
      });

      this.network.sendJoin(username);
    });
  }

  private _setupLiveHandlers(): void {
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

    this.network.on('time_sync', (msg) => {
      this.sky.timeOfDay = msg.timeOfDay;
    });

    this.network.on('player_count', (_msg) => {
      // Player count is tracked via remotePlayers.count in HUD
      // This message is available for future use
    });

    this.network.on('kicked', (msg) => {
      this._connected = false;
      this.network.disconnect();
      this.chatUI.addSystemMessage(`Kicked: ${msg.reason}`);
      this.showKicked(msg.reason);
    });
  }

  private showKicked(reason: string): void {
    if (this._disconnectOverlay) return;
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:200;font-family:Courier New,monospace;color:#fff;';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:24px;color:#ff6b6b;margin-bottom:12px;';
    title.textContent = 'Disconnected';
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:16px;color:#ccc;';
    msg.textContent = reason;
    div.appendChild(title);
    div.appendChild(msg);
    document.body.appendChild(div);
    this._disconnectOverlay = div;
  }

  private showDisconnect(): void {
    if (this._disconnectOverlay) return;
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(180,0,0,0.8);color:#fff;padding:8px 16px;font-family:Courier New,monospace;font-size:14px;z-index:150;';
    div.textContent = 'Disconnected from server';
    document.body.appendChild(div);
    this._disconnectOverlay = div;
  }

  private animate(currentTime: number): void {
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
