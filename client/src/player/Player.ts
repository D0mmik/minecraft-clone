import * as THREE from 'three';
import {
  GRAVITY, JUMP_FORCE, PLAYER_SPEED, SPRINT_MULTIPLIER,
  PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_EYE_HEIGHT
} from '../utils/constants';
import { isSolid } from '../world/BlockType';
import type { World } from '../world/World';
import type { InputDir } from '../types';

export class Player {
  world: World;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  onGround: boolean;
  sprinting: boolean;
  sneaking: boolean;
  headBobTime: number;
  headBobAmount: number;
  halfWidth: number;
  height: number;

  // Health
  health: number;
  maxHealth: number;
  isDead: boolean;
  onDamage: ((amount: number) => void) | null;
  onDeath: (() => void) | null;

  // Fall tracking
  private _fallStartY: number;
  private _wasFalling: boolean;

  // Cached vector to avoid per-frame allocations
  _eyePos: THREE.Vector3;

  constructor(world: World) {
    this.world = world;
    this.position = new THREE.Vector3(0, 80, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = false;
    this.sprinting = false;
    this.sneaking = false;
    this.headBobTime = 0;
    this.headBobAmount = 0;

    // Half-widths for AABB collision
    this.halfWidth = PLAYER_WIDTH / 2;
    this.height = PLAYER_HEIGHT;

    // Health
    this.health = 20;
    this.maxHealth = 20;
    this.isDead = false;
    this.onDamage = null;
    this.onDeath = null;

    // Fall tracking
    this._fallStartY = 0;
    this._wasFalling = false;

    // Cached vector to avoid per-frame allocations
    this._eyePos = new THREE.Vector3();
  }

  update(dt: number, inputDir: InputDir, yaw: number, jumping: boolean, sprinting: boolean, sneaking: boolean = false): void {
    if (this.isDead) return;

    this.sprinting = sneaking ? false : sprinting;
    this.sneaking = sneaking;

    // Apply gravity
    this.velocity.y -= GRAVITY * dt;

    // Movement from input
    const speed = PLAYER_SPEED * (sneaking ? 0.3 : sprinting ? SPRINT_MULTIPLIER : 1);
    const moveX = inputDir.x * speed;
    const moveZ = inputDir.z * speed;

    // Rotate movement direction by yaw
    // Camera forward = (-sin(yaw), 0, -cos(yaw)), right = (cos(yaw), 0, -sin(yaw))
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    this.velocity.x = -moveZ * sinYaw + moveX * cosYaw;
    this.velocity.z = -moveZ * cosYaw - moveX * sinYaw;

    // Jump
    if (jumping && this.onGround) {
      this.velocity.y = JUMP_FORCE;
      this.onGround = false;
    }

    // Track fall start
    const wasOnGround = this.onGround;

    // Apply velocity with collision detection
    this.moveWithCollision(dt, sneaking);

    // Fall damage detection
    if (!wasOnGround && !this._wasFalling && this.velocity.y < 0) {
      // Started falling
      this._fallStartY = this.position.y;
      this._wasFalling = true;
    }
    if (this._wasFalling && this.onGround) {
      // Landed
      const fallDist = this._fallStartY - this.position.y;
      if (fallDist > 3) {
        const damage = Math.floor(fallDist - 3);
        if (damage > 0 && this.onDamage) {
          this.onDamage(damage);
        }
      }
      this._wasFalling = false;
    }
    if (this.onGround) {
      this._fallStartY = this.position.y;
    }

    // Head bob
    if (this.onGround && (Math.abs(inputDir.x) > 0.1 || Math.abs(inputDir.z) > 0.1)) {
      const bobSpeed = sprinting ? 14 : 10;
      this.headBobTime += dt * bobSpeed;
      this.headBobAmount = Math.sin(this.headBobTime) * 0.05;
    } else {
      this.headBobAmount *= 0.9;
      if (Math.abs(this.headBobAmount) < 0.001) this.headBobAmount = 0;
    }
  }

  private moveWithCollision(dt: number, sneaking: boolean = false): void {
    // Move each axis separately for proper collision response
    const dx = this.velocity.x * dt;
    const dy = this.velocity.y * dt;
    const dz = this.velocity.z * dt;

    // Move X
    this.position.x += dx;
    if (this.checkCollision()) {
      this.position.x -= dx;
      this.velocity.x = 0;
    } else if (sneaking && this.onGround && !this.hasGroundBelow()) {
      this.position.x -= dx;
      this.velocity.x = 0;
    }

    // Move Y
    this.position.y += dy;
    if (this.checkCollision()) {
      this.position.y -= dy;
      if (this.velocity.y < 0) {
        this.onGround = true;
      }
      this.velocity.y = 0;
    } else {
      this.onGround = false;
    }

    // Move Z
    this.position.z += dz;
    if (this.checkCollision()) {
      this.position.z -= dz;
      this.velocity.z = 0;
    } else if (sneaking && this.onGround && !this.hasGroundBelow()) {
      this.position.z -= dz;
      this.velocity.z = 0;
    }
  }

  /** Check if there's any solid block under the player's footprint */
  private hasGroundBelow(): boolean {
    const checkY = Math.floor(this.position.y - 0.05);
    const minX = Math.floor(this.position.x - this.halfWidth + 0.001);
    const maxX = Math.floor(this.position.x + this.halfWidth - 0.001);
    const minZ = Math.floor(this.position.z - this.halfWidth + 0.001);
    const maxZ = Math.floor(this.position.z + this.halfWidth - 0.001);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (isSolid(this.world.getBlock(bx, checkY, bz))) return true;
      }
    }
    return false;
  }

  private checkCollision(): boolean {
    const minX = Math.floor(this.position.x - this.halfWidth);
    const maxX = Math.floor(this.position.x + this.halfWidth);
    const minY = Math.floor(this.position.y);
    const maxY = Math.floor(this.position.y + this.height);
    const minZ = Math.floor(this.position.z - this.halfWidth);
    const maxZ = Math.floor(this.position.z + this.halfWidth);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          const block = this.world.getBlock(bx, by, bz);
          if (isSolid(block)) {
            // AABB overlap check
            if (this.position.x + this.halfWidth > bx &&
                this.position.x - this.halfWidth < bx + 1 &&
                this.position.y + this.height > by &&
                this.position.y < by + 1 &&
                this.position.z + this.halfWidth > bz &&
                this.position.z - this.halfWidth < bz + 1) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  takeDamage(amount: number): void {
    if (this.isDead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.isDead = true;
      if (this.onDeath) this.onDeath();
    }
  }

  respawn(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.isDead = false;
    this._wasFalling = false;
    this._fallStartY = y;
  }

  getEyePosition(): THREE.Vector3 {
    const eyeY = this.sneaking ? PLAYER_EYE_HEIGHT - 0.08 : PLAYER_EYE_HEIGHT;
    return this._eyePos.set(
      this.position.x,
      this.position.y + eyeY + this.headBobAmount,
      this.position.z
    );
  }
}
