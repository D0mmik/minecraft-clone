/** Mobile touch controls: virtual joystick, camera look, action buttons */
export class TouchControls {
  // DOM elements
  private _container: HTMLDivElement;
  private _joystickOuter: HTMLDivElement;
  private _joystickInner: HTMLDivElement;
  private _jumpBtn: HTMLDivElement;
  private _breakBtn: HTMLDivElement;
  private _placeBtn: HTMLDivElement;

  // Joystick state
  private _joystickTouchId: number | null = null;
  private _joystickCenterX = 0;
  private _joystickCenterY = 0;
  private _joyX = 0;
  private _joyZ = 0;

  // Camera look state
  private _lookTouchId: number | null = null;
  private _lookLastX = 0;
  private _lookLastY = 0;
  private _yawDelta = 0;
  private _pitchDelta = 0;

  // Button states
  isJumping = false;
  isBreaking = false;
  isPlacing = false;

  // Slot select callback
  onSlotSelect: ((slot: number) => void) | null = null;

  constructor() {
    this._container = document.createElement('div');
    this._container.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;';
    document.body.appendChild(this._container);

    // Camera look area — append FIRST so buttons paint on top
    const lookArea = document.createElement('div');
    lookArea.style.cssText = 'position:fixed;top:0;right:0;width:50%;height:100%;pointer-events:auto;';
    this._container.appendChild(lookArea);

    // Left joystick
    this._joystickOuter = this._createCircle(120, 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.3)');
    this._joystickOuter.style.cssText += 'position:fixed;bottom:30px;left:30px;pointer-events:auto;';
    this._container.appendChild(this._joystickOuter);

    this._joystickInner = this._createCircle(50, 'rgba(255,255,255,0.5)', 'none');
    this._joystickInner.style.cssText += 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);';
    this._joystickOuter.appendChild(this._joystickInner);

    // Jump button (bottom-right)
    this._jumpBtn = this._createCircle(60, 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.4)');
    this._jumpBtn.style.cssText += 'position:fixed;bottom:30px;right:30px;pointer-events:auto;';
    this._jumpBtn.innerHTML = '<span style="color:#fff;font-size:20px;font-family:Courier New,monospace;">&#x25B2;</span>';
    this._jumpBtn.style.display = 'flex';
    this._jumpBtn.style.justifyContent = 'center';
    this._jumpBtn.style.alignItems = 'center';
    this._container.appendChild(this._jumpBtn);

    // Break button (right side, mid)
    this._breakBtn = this._createRect(55, 55, 'rgba(255,80,80,0.3)', 'rgba(255,80,80,0.5)');
    this._breakBtn.style.cssText += 'position:fixed;right:20px;top:50%;transform:translateY(-50%) translateY(35px);pointer-events:auto;';
    this._breakBtn.innerHTML = '<span style="color:#fff;font-size:11px;font-family:Courier New,monospace;">Break</span>';
    this._breakBtn.style.display = 'flex';
    this._breakBtn.style.justifyContent = 'center';
    this._breakBtn.style.alignItems = 'center';
    this._container.appendChild(this._breakBtn);

    // Place button (right side, above break)
    this._placeBtn = this._createRect(55, 55, 'rgba(80,150,255,0.3)', 'rgba(80,150,255,0.5)');
    this._placeBtn.style.cssText += 'position:fixed;right:20px;top:50%;transform:translateY(-50%) translateY(-35px);pointer-events:auto;';
    this._placeBtn.innerHTML = '<span style="color:#fff;font-size:11px;font-family:Courier New,monospace;">Place</span>';
    this._placeBtn.style.display = 'flex';
    this._placeBtn.style.justifyContent = 'center';
    this._placeBtn.style.alignItems = 'center';
    this._container.appendChild(this._placeBtn);

    // Event listeners
    this._joystickOuter.addEventListener('touchstart', this._onJoyStart, { passive: false });
    this._joystickOuter.addEventListener('touchmove', this._onJoyMove, { passive: false });
    this._joystickOuter.addEventListener('touchend', this._onJoyEnd, { passive: false });
    this._joystickOuter.addEventListener('touchcancel', this._onJoyEnd, { passive: false });

    lookArea.addEventListener('touchstart', this._onLookStart, { passive: false });
    lookArea.addEventListener('touchmove', this._onLookMove, { passive: false });
    lookArea.addEventListener('touchend', this._onLookEnd, { passive: false });
    lookArea.addEventListener('touchcancel', this._onLookEnd, { passive: false });

    this._jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.isJumping = true; }, { passive: false });
    this._jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.isJumping = false; }, { passive: false });
    this._jumpBtn.addEventListener('touchcancel', () => { this.isJumping = false; });

    this._breakBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.isBreaking = true; }, { passive: false });
    this._breakBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.isBreaking = false; }, { passive: false });
    this._breakBtn.addEventListener('touchcancel', () => { this.isBreaking = false; });

    this._placeBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.isPlacing = true; }, { passive: false });
    this._placeBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.isPlacing = false; }, { passive: false });
    this._placeBtn.addEventListener('touchcancel', () => { this.isPlacing = false; });
  }

  private _createCircle(size: number, bg: string, border: string): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid ${border};`;
    return el;
  }

  private _createRect(w: number, h: number, bg: string, border: string): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `width:${w}px;height:${h}px;border-radius:8px;background:${bg};border:2px solid ${border};`;
    return el;
  }

  // --- Joystick handlers ---
  private _onJoyStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (this._joystickTouchId !== null) return;
    const t = e.changedTouches[0];
    this._joystickTouchId = t.identifier;
    const rect = this._joystickOuter.getBoundingClientRect();
    this._joystickCenterX = rect.left + rect.width / 2;
    this._joystickCenterY = rect.top + rect.height / 2;
  };

  private _onJoyMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== this._joystickTouchId) continue;
      const dx = t.clientX - this._joystickCenterX;
      const dy = t.clientY - this._joystickCenterY;
      const maxDist = 45;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clampedDist = Math.min(dist, maxDist);
      const angle = Math.atan2(dy, dx);
      const cx = Math.cos(angle) * clampedDist;
      const cy = Math.sin(angle) * clampedDist;

      // Move inner thumb
      this._joystickInner.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;

      // Normalized input: x = left/right, z = forward/back (up = forward = positive z)
      this._joyX = cx / maxDist;
      this._joyZ = -cy / maxDist; // Invert Y so pushing up = forward
    }
  };

  private _onJoyEnd = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this._joystickTouchId) {
        this._joystickTouchId = null;
        this._joyX = 0;
        this._joyZ = 0;
        this._joystickInner.style.transform = 'translate(-50%, -50%)';
      }
    }
  };

  // --- Camera look handlers ---
  private _onLookStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (this._lookTouchId !== null) return;
    const t = e.changedTouches[0];
    this._lookTouchId = t.identifier;
    this._lookLastX = t.clientX;
    this._lookLastY = t.clientY;
  };

  private _onLookMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== this._lookTouchId) continue;
      const dx = t.clientX - this._lookLastX;
      const dy = t.clientY - this._lookLastY;
      this._lookLastX = t.clientX;
      this._lookLastY = t.clientY;

      const sensitivity = 0.004;
      this._yawDelta -= dx * sensitivity;
      this._pitchDelta -= dy * sensitivity;
    }
  };

  private _onLookEnd = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this._lookTouchId) {
        this._lookTouchId = null;
      }
    }
  };

  /** Get normalized input direction from joystick */
  getInputDirection(): { x: number; z: number } {
    const x = this._joyX;
    const z = this._joyZ;
    const len = Math.sqrt(x * x + z * z);
    if (len > 1) {
      return { x: x / len, z: z / len };
    }
    return { x, z };
  }

  /** Consume accumulated yaw/pitch deltas, resetting to 0 */
  consumeYawPitch(): { yaw: number; pitch: number } {
    const yaw = this._yawDelta;
    const pitch = this._pitchDelta;
    this._yawDelta = 0;
    this._pitchDelta = 0;
    return { yaw, pitch };
  }

  dispose(): void {
    this._container.remove();
  }
}
