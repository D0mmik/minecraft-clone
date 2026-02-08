import { hotbarBlocks, blockNames } from '../world/BlockType';
import { ATLAS_GRID } from '../world/TextureAtlas';
import { IS_MOBILE } from '../utils/constants';
import type { Player } from '../player/Player';
import type { World } from '../world/World';
import type { Controls } from '../player/Controls';
import type { RemotePlayerManager } from '../net/RemotePlayerManager';

export class HUD {
  atlasCanvas: HTMLCanvasElement;
  debugVisible: boolean;
  fps: number;
  frameCount: number;
  fpsTimer: number;

  hotbarEl: HTMLElement;
  debugEl: HTMLElement;
  playerCountEl: HTMLElement;
  selectedSlot: number;
  slotElements: HTMLElement[];
  debugLines: HTMLElement[];
  onSlotSelect: ((slot: number) => void) | null;

  constructor(atlasCanvas: HTMLCanvasElement) {
    this.atlasCanvas = atlasCanvas;
    this.debugVisible = false;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsTimer = 0;

    this.hotbarEl = document.getElementById('hotbar')!;
    this.debugEl = document.getElementById('debug')!;
    this.selectedSlot = 0;
    this.slotElements = [];
    this.debugLines = [];
    this.onSlotSelect = null;

    // Always-visible player count
    this.playerCountEl = document.createElement('div');
    this.playerCountEl.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.5);color:#fff;padding:4px 10px;font-family:Courier New,monospace;font-size:13px;z-index:100;pointer-events:none;';
    document.body.appendChild(this.playerCountEl);

    this.setupHotbar();
    this.setupDebugOverlay();
    this.setupDebugToggle();
  }

  private setupHotbar(): void {
    this.hotbarEl.innerHTML = '';
    this.slotElements = [];

    // Block texture index mapping for hotbar display (using 'side' face)
    const blockTextureIndices = [0, 2, 3, 9, 14, 7, 4, 8, 16];

    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot' + (i === 0 ? ' selected' : '');
      slot.style.position = 'relative';

      // Number indicator
      const num = document.createElement('div');
      num.className = 'hotbar-number';
      num.textContent = (i + 1).toString();
      slot.appendChild(num);

      // Mini texture preview from atlas
      const miniCanvas = document.createElement('canvas');
      miniCanvas.width = 16;
      miniCanvas.height = 16;
      const ctx = miniCanvas.getContext('2d')!;

      if (this.atlasCanvas) {
        const texIdx = blockTextureIndices[i];
        const col = texIdx % ATLAS_GRID;
        const row = Math.floor(texIdx / ATLAS_GRID);
        ctx.drawImage(
          this.atlasCanvas,
          col * 16, row * 16, 16, 16,
          0, 0, 16, 16
        );
      }

      slot.appendChild(miniCanvas);
      this.hotbarEl.appendChild(slot);
      this.slotElements.push(slot);

      // Make slots tappable on mobile
      if (IS_MOBILE) {
        slot.style.pointerEvents = 'auto';
        const slotIdx = i;
        slot.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.onSlotSelect) this.onSlotSelect(slotIdx);
        }, { passive: false });
      }
    }

    // Enable pointer events on hotbar container for mobile and raise above touch controls
    if (IS_MOBILE) {
      this.hotbarEl.style.pointerEvents = 'auto';
      this.hotbarEl.style.zIndex = '60';
    }
  }

  private setupDebugOverlay(): void {
    this.debugEl.innerHTML = '';
    this.debugLines = [];
    for (let i = 0; i < 7; i++) {
      const div = document.createElement('div');
      this.debugEl.appendChild(div);
      this.debugLines.push(div);
    }
  }

  private setupDebugToggle(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.debugVisible = !this.debugVisible;
        this.debugEl.style.display = this.debugVisible ? 'block' : 'none';
      }
    });
  }

  update(dt: number, player: Player, world: World, controls: Controls, remotePlayers: RemotePlayerManager | null): void {
    // FPS counter
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer -= 1;
    }

    // Update hotbar selection
    if (this.selectedSlot !== controls.selectedSlot) {
      this.slotElements[this.selectedSlot].classList.remove('selected');
      this.selectedSlot = controls.selectedSlot;
      this.slotElements[this.selectedSlot].classList.add('selected');
    }

    // Update player count
    const onlineCount = remotePlayers ? remotePlayers.count + 1 : 1;
    this.playerCountEl.textContent = `${onlineCount} online`;

    // Update debug info
    if (this.debugVisible) {
      const pos = player.position;
      const cx = Math.floor(pos.x / 16);
      const cz = Math.floor(pos.z / 16);

      const yaw = ((controls.yaw * 180 / Math.PI) % 360 + 360) % 360;
      let facing = 'North';
      if (yaw >= 45 && yaw < 135) facing = 'West';
      else if (yaw >= 135 && yaw < 225) facing = 'South';
      else if (yaw >= 225 && yaw < 315) facing = 'East';

      this.debugLines[0].textContent = `FPS: ${this.fps}`;
      this.debugLines[1].textContent = `XYZ: ${pos.x.toFixed(1)} / ${pos.y.toFixed(1)} / ${pos.z.toFixed(1)}`;
      this.debugLines[2].textContent = `Chunk: ${cx}, ${cz}`;
      this.debugLines[3].textContent = `Facing: ${facing} (${yaw.toFixed(0)}\u00B0)`;
      this.debugLines[4].textContent = `Chunks loaded: ${world.loadedChunkCount}`;
      this.debugLines[5].textContent = `Block: ${blockNames[hotbarBlocks[this.selectedSlot]] || 'Unknown'}`;
      this.debugLines[6].textContent = remotePlayers ? `Players: ${remotePlayers.count + 1}` : '';
    }
  }
}
