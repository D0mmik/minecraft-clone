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
  headBobTime: number;
  headBobAmount: number;
  halfWidth: number;
  height: number;

  // Cached vector to avoid per-frame allocations
  _eyePos: THREE.Vector3;

  constructor(world: World) {
    this.world = world;
    this.position = new THREE.Vector3(0, 80, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = false;
    this.sprinting = false;
    this.headBobTime = 0;
    this.headBobAmount = 0;

    // Half-widths for AABB collision
    this.halfWidth = PLAYER_WIDTH / 2;
    this.height = PLAYER_HEIGHT;

    // Cached vector to avoid per-frame allocations
    this._eyePos = new THREE.Vector3();
  }

  update(dt: number, inputDir: InputDir, yaw: number, jumping: boolean, sprinting: boolean): void {
    this.sprinting = sprinting;

    // Apply gravity
    this.velocity.y -= GRAVITY * dt;

    // Movement from input
    const speed = PLAYER_SPEED * (sprinting ? SPRINT_MULTIPLIER : 1);
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

    // Apply velocity with collision detection
    this.moveWithCollision(dt);

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

  private moveWithCollision(dt: number): void {
    // Move each axis separately for proper collision response
    const dx = this.velocity.x * dt;
    const dy = this.velocity.y * dt;
    const dz = this.velocity.z * dt;

    // Move X
    this.position.x += dx;
    if (this.checkCollision()) {
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
    }
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

  getEyePosition(): THREE.Vector3 {
    return this._eyePos.set(
      this.position.x,
      this.position.y + PLAYER_EYE_HEIGHT + this.headBobAmount,
      this.position.z
    );
  }
}
