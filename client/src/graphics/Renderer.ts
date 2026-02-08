import * as THREE from 'three';
import { CHUNK_SIZE, RENDER_DISTANCE } from '../utils/constants';

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ambientLight: THREE.AmbientLight;
  sunLight: THREE.DirectionalLight;
  baseFov: number;
  targetFov: number;

  // Cached Color objects to avoid per-frame allocations
  private _dayColor: THREE.Color;
  private _sunsetColor: THREE.Color;
  private _nightColor: THREE.Color;
  private _skyColor: THREE.Color;
  private _sunColor: THREE.Color;
  private _sunsetLerpColor: THREE.Color;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x87CEEB);

    // Position canvas fixed to viewport origin — ensures it aligns
    // with position:fixed UI elements (crosshair) on mobile
    const canvas = this.renderer.domElement;
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';

    const vp = this._viewportSize();
    this.renderer.setSize(vp.w, vp.h);
    document.body.appendChild(canvas);

    this.scene = new THREE.Scene();

    // Fog to hide chunk boundaries
    const fogDistance = RENDER_DISTANCE * CHUNK_SIZE * 0.9;
    this.scene.fog = new THREE.Fog(0x87CEEB, fogDistance * 0.5, fogDistance);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      70,
      vp.w / vp.h,
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

    // Cached Color objects
    this._dayColor = new THREE.Color(0x87CEEB);
    this._sunsetColor = new THREE.Color(0xFF7744);
    this._nightColor = new THREE.Color(0x0a0a2e);
    this._skyColor = new THREE.Color();
    this._sunColor = new THREE.Color();
    this._sunsetLerpColor = new THREE.Color(0xFF8844);

    // Handle resize (desktop + mobile visual viewport)
    const onResize = () => {
      const vp = this._viewportSize();
      this.camera.aspect = vp.w / vp.h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(vp.w, vp.h);
    };
    window.addEventListener('resize', onResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
    }
  }

  private _viewportSize(): { w: number; h: number } {
    const vv = window.visualViewport;
    if (vv) return { w: vv.width, h: vv.height };
    return { w: window.innerWidth, h: window.innerHeight };
  }

  updateFov(sprinting: boolean, dt: number): void {
    this.targetFov = sprinting ? 80 : 70;
    const currentFov = this.camera.fov;
    const newFov = currentFov + (this.targetFov - currentFov) * Math.min(1, dt * 8);
    if (Math.abs(newFov - currentFov) > 0.01) {
      this.camera.fov = newFov;
      this.camera.updateProjectionMatrix();
    }
  }

  updateLighting(timeOfDay: number): void {
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
    let skyColor: THREE.Color;
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
      (this.scene.fog as THREE.Fog).color.copy(skyColor);
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

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
}
