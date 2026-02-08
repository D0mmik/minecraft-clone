import * as THREE from 'three';
import { DAY_LENGTH } from '../utils/constants';

export class Sky {
  scene: THREE.Scene;
  timeOfDay: number;
  dayLength: number;
  sun: THREE.Mesh;
  moon: THREE.Mesh;
  stars!: THREE.Points;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.timeOfDay = 0.35; // Start at morning
    this.dayLength = DAY_LENGTH;

    // Stars
    this.createStars();

    // Sun mesh
    const sunGeo = new THREE.SphereGeometry(5, 8, 8);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xFFFF88 });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    scene.add(this.sun);

    // Moon mesh
    const moonGeo = new THREE.SphereGeometry(4, 8, 8);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xDDDDFF });
    this.moon = new THREE.Mesh(moonGeo, moonMat);
    scene.add(this.moon);
  }

  private createStars(): void {
    const starCount = 500;
    const positions = new Float32Array(starCount * 3);
    const rng = this.createRNG(999);

    for (let i = 0; i < starCount; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = rng() * Math.PI;
      const r = 400;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }

    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const starsMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      sizeAttenuation: false,
      transparent: true,
    });
    this.stars = new THREE.Points(starsGeo, starsMat);
    this.scene.add(this.stars);
  }

  private createRNG(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  update(dt: number, playerPosition: THREE.Vector3): number {
    this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1;

    const sunAngle = this.timeOfDay * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.sin(sunAngle);

    // Position sun and moon relative to player
    const cx = playerPosition.x;
    const cz = playerPosition.z;

    this.sun.position.set(
      cx + Math.cos(sunAngle) * 300,
      Math.sin(sunAngle) * 300,
      cz + 50
    );

    this.moon.position.set(
      cx - Math.cos(sunAngle) * 300,
      -Math.sin(sunAngle) * 300,
      cz + 50
    );

    // Stars visibility
    const nightFactor = Math.max(0, -sunY);
    (this.stars.material as THREE.PointsMaterial).opacity = nightFactor;

    // Center stars on player
    this.stars.position.set(cx, 0, cz);

    return this.timeOfDay;
  }
}
