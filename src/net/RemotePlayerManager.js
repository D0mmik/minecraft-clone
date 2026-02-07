import { PlayerModel } from './PlayerModel.js';

export class RemotePlayerManager {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map(); // id -> { model, targetX, targetY, targetZ, targetYaw, prevX, prevZ, isMoving }
  }

  addPlayer(id, username, x, y, z, yaw) {
    if (this.players.has(id)) return;
    const model = new PlayerModel(username);
    model.setPosition(x, y, z);
    if (yaw !== undefined) model.setRotation(yaw);
    this.scene.add(model.group);
    this.players.set(id, {
      model,
      username,
      x, y, z,
      targetX: x, targetY: y, targetZ: z,
      targetYaw: yaw || 0,
      prevX: x, prevZ: z,
      isMoving: false,
    });
  }

  removePlayer(id) {
    const entry = this.players.get(id);
    if (!entry) return;
    this.scene.remove(entry.model.group);
    entry.model.dispose();
    this.players.delete(id);
  }

  updatePositions(playerDataArray) {
    for (const data of playerDataArray) {
      const entry = this.players.get(data.id);
      if (!entry) continue;
      entry.prevX = entry.targetX;
      entry.prevZ = entry.targetZ;
      entry.targetX = data.x;
      entry.targetY = data.y;
      entry.targetZ = data.z;
      entry.targetYaw = data.yaw;
      // Detect movement
      const dx = data.x - entry.prevX;
      const dz = data.z - entry.prevZ;
      entry.isMoving = (dx * dx + dz * dz) > 0.001;
    }
  }

  update(dt) {
    const lerpRate = Math.min(dt * 12, 1); // smooth interpolation
    for (const [, entry] of this.players) {
      // Interpolate position
      entry.x += (entry.targetX - entry.x) * lerpRate;
      entry.y += (entry.targetY - entry.y) * lerpRate;
      entry.z += (entry.targetZ - entry.z) * lerpRate;
      entry.model.setPosition(entry.x, entry.y, entry.z);

      // Interpolate yaw (handle wrapping)
      let yawDiff = entry.targetYaw - entry.model.group.rotation.y;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      entry.model.group.rotation.y += yawDiff * lerpRate;

      // Animate limbs
      entry.model.update(dt, entry.isMoving);
    }
  }

  get count() {
    return this.players.size;
  }
}
