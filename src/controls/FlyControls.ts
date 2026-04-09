import * as THREE from 'three';
import {
  BASE_FLY_SPEED,
  BOOST_MULT,
  MAX_FLY_SPEED,
  MIN_FLY_SPEED,
} from '../config';

export interface FlyControlsOptions {
  mode?: 'desktop' | 'touch';
}

/**
 * First-person fly controls.
 *
 * Desktop mode:
 *   - WASD / Space / Ctrl for translation
 *   - Pointer-lock + mouse for yaw/pitch
 *   - Shift for boost, scroll wheel for cruise speed
 *
 * Touch mode:
 *   - Skips all keyboard / mouse / wheel / pointer-lock listeners.
 *   - Public methods setMoveAxis / setBoostOverride / addLookDelta /
 *     adjustBaseSpeed are the external-input channel — TouchControls
 *     calls them from pointer events.
 *
 * Both modes share the same velocity smoothing + position integration
 * in update().
 */
export class FlyControls {
  private keys = new Set<string>();
  private locked = false;
  private yaw = 0;
  private pitch = 0;
  private baseSpeed = BASE_FLY_SPEED;
  private velocity = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  // External input (written by TouchControls in touch mode).
  private mode: 'desktop' | 'touch';
  private externalMove = new THREE.Vector3(0, 0, 0); // x=strafe, y=vertical, z=forward
  private externalBoost = false;
  private pendingYaw = 0;
  private pendingPitch = 0;

  currentSpeed = 0;

  /** Keyboard boost state only — touch uses externalBoost. */
  get isBoosting(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  /** Effective boost from either input source — use for audio reactivity. */
  get effectiveBoost(): boolean {
    return this.isBoosting || this.externalBoost;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  constructor(
    private camera: THREE.PerspectiveCamera,
    domElement: HTMLCanvasElement,
    options: FlyControlsOptions = {},
  ) {
    this.mode = options.mode ?? 'desktop';

    // Initialize yaw/pitch from current camera orientation.
    this.euler.setFromQuaternion(camera.quaternion);
    this.yaw = this.euler.y;
    this.pitch = this.euler.x;

    if (this.mode === 'touch') {
      // Touch mode: no lock, no keyboard/mouse/wheel listeners.
      // TouchControls drives everything via the external-input methods.
      this.locked = true;
      return;
    }

    domElement.addEventListener('click', () => {
      if (!this.locked) domElement.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === domElement;
    });
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.locked) return;
        const factor = Math.exp(-e.deltaY * 0.001);
        this.adjustBaseSpeed(factor);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.locked) return;
    const sensitivity = 0.0022;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit);
  }

  // ---------------------------------------------------------------------
  // External input channel (touch)
  // ---------------------------------------------------------------------

  /**
   * Set the normalized translate axis (-1..1 each).
   * x = strafe (right positive), y = vertical (up positive),
   * z = forward (forward positive).
   */
  setMoveAxis(x: number, y: number, z: number) {
    this.externalMove.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1),
      THREE.MathUtils.clamp(z, -1, 1),
    );
  }

  setBoostOverride(on: boolean) {
    this.externalBoost = on;
  }

  /**
   * Accumulate a raw pixel look delta (same semantics as mouse movement).
   * Consumed during next update().
   */
  addLookDelta(dx: number, dy: number) {
    this.pendingYaw -= dx;
    this.pendingPitch -= dy;
  }

  /** Multiply base cruise speed by `factor` (clamped). */
  adjustBaseSpeed(factor: number) {
    this.baseSpeed = THREE.MathUtils.clamp(
      this.baseSpeed * factor,
      MIN_FLY_SPEED,
      MAX_FLY_SPEED,
    );
  }

  // ---------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------

  update(dt: number) {
    // Apply any pending external look delta (touch swipe).
    if (this.pendingYaw !== 0 || this.pendingPitch !== 0) {
      const sensitivity = 0.0022;
      this.yaw += this.pendingYaw * sensitivity;
      this.pitch += this.pendingPitch * sensitivity;
      const limit = Math.PI / 2 - 0.01;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit);
      this.pendingYaw = 0;
      this.pendingPitch = 0;
    }

    // Apply orientation (YXZ order = yaw then pitch, no roll).
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);

    // Build movement direction in camera space.
    this.camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, this.up).normalize();

    const dir = new THREE.Vector3();
    if (this.mode === 'touch') {
      // Touch: use external analog axis.
      dir
        .addScaledVector(this.right, this.externalMove.x)
        .addScaledVector(this.up, this.externalMove.y)
        .addScaledVector(this.forward, this.externalMove.z);
    } else {
      // Desktop: digital keyboard state.
      if (this.keys.has('KeyW')) dir.add(this.forward);
      if (this.keys.has('KeyS')) dir.sub(this.forward);
      if (this.keys.has('KeyD')) dir.add(this.right);
      if (this.keys.has('KeyA')) dir.sub(this.right);
      if (this.keys.has('Space')) dir.add(this.up);
      if (this.keys.has('ControlLeft') || this.keys.has('ControlRight'))
        dir.sub(this.up);
    }

    if (dir.lengthSq() > 1) dir.normalize();

    const boosting = this.effectiveBoost;
    const targetSpeed = this.baseSpeed * (boosting ? BOOST_MULT : 1);

    // Smooth velocity toward target (snappy but not instant).
    const targetVel = dir.multiplyScalar(targetSpeed);
    const damp = 1 - Math.exp(-dt * 8);
    this.velocity.lerp(targetVel, damp);

    this.camera.position.addScaledVector(this.velocity, dt);
    this.currentSpeed = this.velocity.length();
  }
}
