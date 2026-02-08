import * as THREE from 'three';
import { REACH_DISTANCE, IS_MOBILE } from '../utils/constants';
import { BlockType, isSolid, hotbarBlocks } from '../world/BlockType';
import { TouchControls } from '../ui/TouchControls';
import { loadBindings } from '../ui/Settings';
import type { KeyBindings } from '../ui/Settings';
import type { World } from '../world/World';
import type { Player } from './Player';
import type { ChatUI } from '../ui/ChatUI';
import type { RemotePlayerManager } from '../net/RemotePlayerManager';
import type { InputDir, RaycastHit } from '../types';

export class Controls {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  yaw: number;
  pitch: number;
  locked: boolean;

  // Cached objects to avoid per-frame allocations
  private _euler: THREE.Euler;
  private _rayDir: THREE.Vector3;
  private _inputDir: InputDir;

  // Key states
  keys: Record<string, boolean>;
  selectedSlot: number;

  // Multiplayer callbacks
  onBlockChange: ((x: number, y: number, z: number, blockType: number) => void) | null;
  onChatOpen: (() => void) | null;
  onAttackPlayer: ((targetId: string) => void) | null;
  chatUI: ChatUI | null;
  remotePlayers: RemotePlayerManager | null;

  // Mouse buttons
  leftClick: boolean;
  rightClick: boolean;
  leftClickCooldown: number;
  rightClickCooldown: number;

  // Mobile touch controls
  touchControls: TouchControls | null;

  // Key bindings
  private _bindings: KeyBindings;

  // Bound event handlers
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onPointerLockChange: () => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;

    // Cached objects to avoid per-frame allocations
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._rayDir = new THREE.Vector3(0, 0, -1);
    this._inputDir = { x: 0, z: 0 };

    // Key states
    this.keys = {};
    this.selectedSlot = 0;

    // Multiplayer callbacks
    this.onBlockChange = null;
    this.onChatOpen = null;
    this.onAttackPlayer = null;
    this.chatUI = null;
    this.remotePlayers = null;

    // Mouse buttons
    this.leftClick = false;
    this.rightClick = false;
    this.leftClickCooldown = 0;
    this.rightClickCooldown = 0;

    // Mobile touch controls
    this.touchControls = null;

    // Key bindings
    this._bindings = loadBindings();

    if (IS_MOBILE) {
      this.touchControls = new TouchControls();
      this.locked = true; // Always "locked" on mobile (no pointer lock)
    }

    // Bind events
    this.onMouseMove = this._onMouseMove.bind(this);
    this.onMouseDown = this._onMouseDown.bind(this);
    this.onMouseUp = this._onMouseUp.bind(this);
    this.onKeyDown = this._onKeyDown.bind(this);
    this.onKeyUp = this._onKeyUp.bind(this);
    this.onWheel = this._onWheel.bind(this);
    this.onPointerLockChange = this._onPointerLockChange.bind(this);

    if (!IS_MOBILE) {
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mousedown', this.onMouseDown);
      document.addEventListener('mouseup', this.onMouseUp);
      document.addEventListener('keydown', this.onKeyDown);
      document.addEventListener('keyup', this.onKeyUp);
      document.addEventListener('wheel', this.onWheel);
      document.addEventListener('pointerlockchange', this.onPointerLockChange);
    }
  }

  lock(): void {
    this.domElement.requestPointerLock();
  }

  private _onPointerLockChange(): void {
    this.locked = document.pointerLockElement === this.domElement;
    const overlay = document.getElementById('overlay')!;
    const crosshair = document.getElementById('crosshair')!;
    if (this.locked) {
      overlay.style.display = 'none';
      crosshair.style.display = 'block';
    } else {
      // Don't show pause overlay when chat is open
      if (this.chatUI && this.chatUI.isOpen) {
        crosshair.style.display = 'none';
      } else {
        overlay.style.display = 'flex';
        crosshair.style.display = 'none';
      }
    }
  }

  private _onMouseMove(e: MouseEvent): void {
    if (!this.locked || (this.chatUI && this.chatUI.isOpen)) return;
    const sensitivity = 0.002;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  private _onMouseDown(e: MouseEvent): void {
    if (!this.locked) return;
    if (e.button === 0) this.leftClick = true;
    if (e.button === 2) this.rightClick = true;
    e.preventDefault();
  }

  private _onMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.leftClick = false;
    if (e.button === 2) this.rightClick = false;
  }

  private _onKeyDown(e: KeyboardEvent): void {
    // Suppress game keys when chat is open
    if (this.chatUI && this.chatUI.isOpen) return;

    this.keys[e.code] = true;

    // T key opens chat
    if (e.code === 'KeyT' && this.locked) {
      if (this.onChatOpen) this.onChatOpen();
      return;
    }

    // Number keys for hotbar
    if (e.code >= 'Digit1' && e.code <= 'Digit9') {
      this.selectedSlot = parseInt(e.code.charAt(5)) - 1;
    }

    // Prevent default for game keys
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'F3', this._bindings.sprint, this._bindings.sneak].includes(e.code)) {
      e.preventDefault();
    }
  }

  private _onKeyUp(e: KeyboardEvent): void {
    this.keys[e.code] = false;
  }

  private _onWheel(e: WheelEvent): void {
    if (!this.locked) return;
    if (e.deltaY > 0) {
      this.selectedSlot = (this.selectedSlot + 1) % 9;
    } else {
      this.selectedSlot = (this.selectedSlot + 8) % 9;
    }
  }

  getInputDirection(): InputDir {
    if (this.touchControls) {
      const td = this.touchControls.getInputDirection();
      this._inputDir.x = td.x;
      this._inputDir.z = td.z;
      return this._inputDir;
    }

    const dir = this._inputDir;
    dir.x = 0; dir.z = 0;
    if (this.keys['KeyW']) dir.z += 1;
    if (this.keys['KeyS']) dir.z -= 1;
    if (this.keys['KeyA']) dir.x -= 1;
    if (this.keys['KeyD']) dir.x += 1;

    // Normalize diagonal movement
    const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    if (len > 0) {
      dir.x /= len;
      dir.z /= len;
    }
    return dir;
  }

  isJumping(): boolean {
    if (this.touchControls) return this.touchControls.isJumping;
    return !!this.keys['Space'];
  }

  isSprinting(): boolean {
    return !!this.keys[this._bindings.sprint];
  }

  isSneaking(): boolean {
    return !!this.keys[this._bindings.sneak];
  }

  reloadBindings(): void {
    this._bindings = loadBindings();
  }

  getSelectedBlock(): number {
    return hotbarBlocks[this.selectedSlot];
  }

  update(dt: number, world: World, player: Player): void {
    // Consume touch look deltas
    if (this.touchControls) {
      const { yaw, pitch } = this.touchControls.consumeYawPitch();
      this.yaw += yaw;
      this.pitch += pitch;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    }

    // Update camera rotation
    this._euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this._euler);

    // Update camera position
    const eye = player.getEyePosition();
    this.camera.position.copy(eye);

    // Handle block interaction cooldowns
    this.leftClickCooldown -= dt;
    this.rightClickCooldown -= dt;

    // Determine break/place input (mouse or touch)
    const wantBreak = this.touchControls ? this.touchControls.isBreaking : this.leftClick;
    const wantPlace = this.touchControls ? this.touchControls.isPlacing : this.rightClick;

    // Block breaking / PvP attack
    if (wantBreak && this.leftClickCooldown <= 0) {
      this.leftClickCooldown = 0.25;
      // Check PvP first
      const targetId = this.raycastPlayer(player);
      if (targetId) {
        if (this.onAttackPlayer) this.onAttackPlayer(targetId);
      } else {
        const hit = this.raycast(world, player);
        if (hit && hit.block !== BlockType.BEDROCK) {
          world.setBlock(hit.x, hit.y, hit.z, BlockType.AIR);
          if (this.onBlockChange) this.onBlockChange(hit.x, hit.y, hit.z, BlockType.AIR);
        }
      }
    }

    // Block placing
    if (wantPlace && this.rightClickCooldown <= 0) {
      this.rightClickCooldown = 0.25;
      const hit = this.raycast(world, player);
      if (hit) {
        const px = hit.x + hit.nx;
        const py = hit.y + hit.ny;
        const pz = hit.z + hit.nz;
        // Don't place inside player
        if (!this.wouldIntersectPlayer(px, py, pz, player)) {
          const blockType = this.getSelectedBlock();
          world.setBlock(px, py, pz, blockType);
          if (this.onBlockChange) this.onBlockChange(px, py, pz, blockType);
        }
      }
    }
  }

  private wouldIntersectPlayer(bx: number, by: number, bz: number, player: Player): boolean {
    const hw = player.halfWidth;
    const h = player.height;
    return (
      player.position.x + hw > bx &&
      player.position.x - hw < bx + 1 &&
      player.position.y + h > by &&
      player.position.y < by + 1 &&
      player.position.z + hw > bz &&
      player.position.z - hw < bz + 1
    );
  }

  // DDA voxel raycast
  private raycast(world: World, player: Player): RaycastHit | null {
    const eye = player.getEyePosition();
    const dir = this._rayDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);

    let x = Math.floor(eye.x);
    let y = Math.floor(eye.y);
    let z = Math.floor(eye.z);

    const stepX = dir.x >= 0 ? 1 : -1;
    const stepY = dir.y >= 0 ? 1 : -1;
    const stepZ = dir.z >= 0 ? 1 : -1;

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX = dir.x !== 0 ? ((dir.x > 0 ? x + 1 - eye.x : eye.x - x) * tDeltaX) : Infinity;
    let tMaxY = dir.y !== 0 ? ((dir.y > 0 ? y + 1 - eye.y : eye.y - y) * tDeltaY) : Infinity;
    let tMaxZ = dir.z !== 0 ? ((dir.z > 0 ? z + 1 - eye.z : eye.z - z) * tDeltaZ) : Infinity;

    let nx = 0, ny = 0, nz = 0;
    let t = 0;

    for (let i = 0; i < REACH_DISTANCE / 0.5; i++) {
      const block = world.getBlock(x, y, z);
      if (isSolid(block)) {
        return { x, y, z, block, nx, ny, nz };
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          t = tMaxX;
          x += stepX;
          tMaxX += tDeltaX;
          nx = -stepX; ny = 0; nz = 0;
        } else {
          t = tMaxZ;
          z += stepZ;
          tMaxZ += tDeltaZ;
          nx = 0; ny = 0; nz = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          t = tMaxY;
          y += stepY;
          tMaxY += tDeltaY;
          nx = 0; ny = -stepY; nz = 0;
        } else {
          t = tMaxZ;
          z += stepZ;
          tMaxZ += tDeltaZ;
          nx = 0; ny = 0; nz = -stepZ;
        }
      }

      if (t > REACH_DISTANCE) break;
    }

    return null;
  }

  // Raycast against remote player bounding boxes for PvP
  private raycastPlayer(player: Player): string | null {
    if (!this.remotePlayers) return null;
    const eye = player.getEyePosition();
    const dir = this._rayDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);

    let closestId: string | null = null;
    let closestT = REACH_DISTANCE;

    for (const [id, entry] of this.remotePlayers.players) {
      // Player AABB: 0.6 wide, 1.8 tall, centered at (x, y + 0.9, z)
      const hw = 0.3;
      const minX = entry.x - hw;
      const maxX = entry.x + hw;
      const minY = entry.y;
      const maxY = entry.y + 1.8;
      const minZ = entry.z - hw;
      const maxZ = entry.z + hw;

      // Ray-AABB intersection (slab method)
      let tmin = -Infinity;
      let tmax = Infinity;

      if (dir.x !== 0) {
        const t1 = (minX - eye.x) / dir.x;
        const t2 = (maxX - eye.x) / dir.x;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (eye.x < minX || eye.x > maxX) continue;

      if (dir.y !== 0) {
        const t1 = (minY - eye.y) / dir.y;
        const t2 = (maxY - eye.y) / dir.y;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (eye.y < minY || eye.y > maxY) continue;

      if (dir.z !== 0) {
        const t1 = (minZ - eye.z) / dir.z;
        const t2 = (maxZ - eye.z) / dir.z;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (eye.z < minZ || eye.z > maxZ) continue;

      if (tmax >= Math.max(0, tmin) && tmin < closestT) {
        closestT = tmin >= 0 ? tmin : 0;
        closestId = id;
      }
    }

    return closestId;
  }

  dispose(): void {
    if (this.touchControls) {
      this.touchControls.dispose();
    }
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }
}
