import * as THREE from 'three';
import { CHUNK_SIZE, RENDER_DISTANCE } from '../utils/constants.js';

export class Renderer {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x87CEEB);
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    // Fog to hide chunk boundaries
    const fogDistance = RENDER_DISTANCE * CHUNK_SIZE * 0.9;
    this.scene.fog = new THREE.Fog(0x87CEEB, fogDistance * 0.5, fogDistance);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      RENDER_DISTANCE * CHUNK_SIZE * 1.5
    );

    this.baseFov = 70;
    this.targetFov = 70;

    // Lighting
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.position.set(50, 100, 30);
    this.scene.add(this.sunLight);

    // Cached Color objects to avoid per-frame allocations
    this._dayColor = new THREE.Color(0x87CEEB);
    this._sunsetColor = new THREE.Color(0xFF7744);
    this._nightColor = new THREE.Color(0x0a0a2e);
    this._skyColor = new THREE.Color();
    this._sunColor = new THREE.Color();
    this._sunsetLerpColor = new THREE.Color(0xFF8844);

    // Handle resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  updateFov(sprinting, dt) {
    this.targetFov = sprinting ? 80 : 70;
    const currentFov = this.camera.fov;
    const newFov = currentFov + (this.targetFov - currentFov) * Math.min(1, dt * 8);
    if (Math.abs(newFov - currentFov) > 0.01) {
      this.camera.fov = newFov;
      this.camera.updateProjectionMatrix();
    }
  }

  updateLighting(timeOfDay) {
    // timeOfDay: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    const sunAngle = timeOfDay * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);

    this.sunLight.position.set(sunX * 100, sunY * 100, 30);

    // Daylight intensity
    const dayFactor = Math.max(0, sunY);
    const sunIntensity = 0.3 + dayFactor * 0.7;
    this.sunLight.intensity = sunIntensity;

    const ambientIntensity = 0.15 + dayFactor * 0.45;
    this.ambientLight.intensity = ambientIntensity;

    // Sky color transitions (using cached Color objects)
    let skyColor;
    if (sunY > 0.1) {
      skyColor = this._skyColor.copy(this._dayColor);
    } else if (sunY > -0.1) {
      // Sunrise/sunset
      const t = (sunY + 0.1) / 0.2;
      skyColor = this._skyColor.copy(this._nightColor).lerp(this._sunsetColor, t);
      if (t > 0.5) skyColor.lerp(this._dayColor, (t - 0.5) * 2);
    } else {
      skyColor = this._skyColor.copy(this._nightColor);
    }

    this.renderer.setClearColor(skyColor);
    if (this.scene.fog) {
      this.scene.fog.color.copy(skyColor);
    }

    // Sun light color
    if (sunY > 0) {
      this._sunColor.set(0xffffff);
      if (sunY < 0.2) {
        this._sunColor.lerp(this._sunsetLerpColor.set(0xFF8844), 1 - sunY / 0.2);
      }
      this.sunLight.color.copy(this._sunColor);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  get domElement() {
    return this.renderer.domElement;
  }
}
