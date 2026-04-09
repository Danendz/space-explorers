import * as THREE from 'three';
import {
  BASE_FLY_SPEED,
  BOOST_MULT,
  MAX_FLY_SPEED,
  MIN_FLY_SPEED,
} from '../config';

/**
 * First-person fly controls with pointer lock.
 * - WASD / Space / Ctrl for translation
 * - Mouse for yaw + pitch (no roll)
 * - Shift for boost
 * - Scroll wheel adjusts base cruise speed
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
  private hintEl = document.getElementById('hint');

  currentSpeed = 0;

  get isBoosting(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  get isLocked(): boolean {
    return this.locked;
  }

  constructor(
    private camera: THREE.PerspectiveCamera,
    domElement: HTMLCanvasElement,
  ) {
    // Initialize yaw/pitch from current camera orientation.
    this.euler.setFromQuaternion(camera.quaternion);
    this.yaw = this.euler.y;
    this.pitch = this.euler.x;

    domElement.addEventListener('click', () => {
      if (!this.locked) domElement.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === domElement;
      if (this.hintEl) this.hintEl.classList.toggle('hidden', this.locked);
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
        this.baseSpeed = THREE.MathUtils.clamp(
          this.baseSpeed * factor,
          MIN_FLY_SPEED,
          MAX_FLY_SPEED,
        );
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

  update(dt: number) {
    // Apply orientation (YXZ order = yaw then pitch, no roll).
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);

    // Build movement direction in camera space.
    this.camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, this.up).normalize();

    const dir = new THREE.Vector3();
    if (this.keys.has('KeyW')) dir.add(this.forward);
    if (this.keys.has('KeyS')) dir.sub(this.forward);
    if (this.keys.has('KeyD')) dir.add(this.right);
    if (this.keys.has('KeyA')) dir.sub(this.right);
    if (this.keys.has('Space')) dir.add(this.up);
    if (this.keys.has('ControlLeft') || this.keys.has('ControlRight'))
      dir.sub(this.up);

    if (dir.lengthSq() > 0) dir.normalize();

    const boost =
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? BOOST_MULT : 1;
    const targetSpeed = this.baseSpeed * boost;

    // Smooth velocity toward target (snappy but not instant).
    const targetVel = dir.multiplyScalar(targetSpeed);
    const damp = 1 - Math.exp(-dt * 8);
    this.velocity.lerp(targetVel, damp);

    this.camera.position.addScaledVector(this.velocity, dt);
    this.currentSpeed = this.velocity.length();
  }
}
