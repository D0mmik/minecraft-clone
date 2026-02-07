import * as THREE from 'three';

const SKIN = 0xc8956c;
const SHIRT = 0x3a9494;
const PANTS = 0x2b2b6e;

export class PlayerModel {
  constructor(username) {
    this.group = new THREE.Group();

    const skinMat = new THREE.MeshLambertMaterial({ color: SKIN });
    const shirtMat = new THREE.MeshLambertMaterial({ color: SHIRT });
    const pantsMat = new THREE.MeshLambertMaterial({ color: PANTS });

    // Head: 0.45 x 0.45 x 0.45, center at y=1.575
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), skinMat);
    head.position.y = 1.575;
    this.group.add(head);

    // Body: 0.45 x 0.675 x 0.225, center at y=1.0125
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.675, 0.225), shirtMat);
    body.position.y = 1.0125;
    this.group.add(body);

    // Left arm pivot at shoulder (y=1.35)
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.3375, 1.35, 0);
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.675, 0.225), skinMat);
    leftArm.position.y = -0.3375; // hang down from pivot
    this.leftArmPivot.add(leftArm);
    this.group.add(this.leftArmPivot);

    // Right arm pivot at shoulder (y=1.35)
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.3375, 1.35, 0);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.675, 0.225), skinMat);
    rightArm.position.y = -0.3375;
    this.rightArmPivot.add(rightArm);
    this.group.add(this.rightArmPivot);

    // Left leg pivot at hip (y=0.675)
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.1125, 0.675, 0);
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.675, 0.225), pantsMat);
    leftLeg.position.y = -0.3375;
    this.leftLegPivot.add(leftLeg);
    this.group.add(this.leftLegPivot);

    // Right leg pivot at hip (y=0.675)
    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.1125, 0.675, 0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.675, 0.225), pantsMat);
    rightLeg.position.y = -0.3375;
    this.rightLegPivot.add(rightLeg);
    this.group.add(this.rightLegPivot);

    // Name sprite above head
    this.nameSprite = this._createNameSprite(username);
    this.nameSprite.position.y = 2.0;
    this.group.add(this.nameSprite);

    this._walkPhase = 0;
    this._swingAmount = 0;
  }

  _createNameSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 32px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 256, 64);
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, 0, 256, 64);
    ctx.globalAlpha = 1;
    // Background
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(128 - tw / 2 - 8, 8, tw + 16, 44);
    // Text
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2, 0.5, 1);
    return sprite;
  }

  update(dt, isMoving) {
    // Walking animation
    if (isMoving) {
      this._walkPhase += dt * 8;
      this._swingAmount += (0.6 - this._swingAmount) * Math.min(dt * 10, 1);
    } else {
      this._swingAmount *= Math.max(1 - dt * 6, 0);
      if (this._swingAmount < 0.01) {
        this._swingAmount = 0;
        this._walkPhase = 0;
      }
    }

    const swing = Math.sin(this._walkPhase) * this._swingAmount;
    this.leftArmPivot.rotation.x = swing;
    this.rightArmPivot.rotation.x = -swing;
    this.leftLegPivot.rotation.x = -swing;
    this.rightLegPivot.rotation.x = swing;
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  setRotation(yaw) {
    this.group.rotation.y = yaw;
  }

  dispose() {
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  }
}
