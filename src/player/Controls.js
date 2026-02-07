import * as THREE from 'three';
import { REACH_DISTANCE } from '../utils/constants.js';
import { BlockType, isSolid, hotbarBlocks } from '../world/BlockType.js';

export class Controls {
  constructor(camera, domElement) {
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
    this.onBlockChange = null; // (x, y, z, blockType) => void
    this.onChatOpen = null;    // () => void
    this.chatUI = null;        // set externally to suppress input when chat open

    // Mouse buttons
    this.leftClick = false;
    this.rightClick = false;
    this.leftClickCooldown = 0;
    this.rightClickCooldown = 0;

    // Bind events
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onPointerLockChange = this.onPointerLockChange.bind(this);

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('wheel', this.onWheel);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  lock() {
    this.domElement.requestPointerLock();
  }

  onPointerLockChange() {
    this.locked = document.pointerLockElement === this.domElement;
    const overlay = document.getElementById('overlay');
    const crosshair = document.getElementById('crosshair');
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

  onMouseMove(e) {
    if (!this.locked || (this.chatUI && this.chatUI.isOpen)) return;
    const sensitivity = 0.002;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  onMouseDown(e) {
    if (!this.locked) return;
    if (e.button === 0) this.leftClick = true;
    if (e.button === 2) this.rightClick = true;
    e.preventDefault();
  }

  onMouseUp(e) {
    if (e.button === 0) this.leftClick = false;
    if (e.button === 2) this.rightClick = false;
  }

  onKeyDown(e) {
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
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'F3'].includes(e.code)) {
      e.preventDefault();
    }
  }

  onKeyUp(e) {
    this.keys[e.code] = false;
  }

  onWheel(e) {
    if (!this.locked) return;
    if (e.deltaY > 0) {
      this.selectedSlot = (this.selectedSlot + 1) % 9;
    } else {
      this.selectedSlot = (this.selectedSlot + 8) % 9;
    }
  }

  getInputDirection() {
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

  isJumping() {
    return !!this.keys['Space'];
  }

  isSprinting() {
    return !!this.keys['ShiftLeft'];
  }

  getSelectedBlock() {
    return hotbarBlocks[this.selectedSlot];
  }

  update(dt, world, player) {
    // Update camera rotation
    this._euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this._euler);

    // Update camera position
    const eye = player.getEyePosition();
    this.camera.position.copy(eye);

    // Handle block interaction cooldowns
    this.leftClickCooldown -= dt;
    this.rightClickCooldown -= dt;

    // Block breaking
    if (this.leftClick && this.leftClickCooldown <= 0) {
      this.leftClickCooldown = 0.25;
      const hit = this.raycast(world, player);
      if (hit && hit.block !== BlockType.BEDROCK) {
        world.setBlock(hit.x, hit.y, hit.z, BlockType.AIR);
        if (this.onBlockChange) this.onBlockChange(hit.x, hit.y, hit.z, BlockType.AIR);
      }
    }

    // Block placing
    if (this.rightClick && this.rightClickCooldown <= 0) {
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

  wouldIntersectPlayer(bx, by, bz, player) {
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
  raycast(world, player) {
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

  dispose() {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }
}
