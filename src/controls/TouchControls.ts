import type { FlyControls } from './FlyControls';

/**
 * Touch-input layer for mobile.
 *
 * - Left virtual joystick → translate axis on FlyControls
 * - Any other pointer drag → look delta on FlyControls
 * - Three buttons on the right edge: up / down / boost
 * - First pointerdown anywhere triggers the "first touch" callback
 *   (dismisses tap-to-explore, starts music, enters fullscreen, etc.)
 *
 * Uses Pointer Events so it works with touch + pen + mouse uniformly.
 */
export class TouchControls {
  private joystickEl = document.getElementById('joystick')!;
  private joystickNub = document.getElementById('joystick-nub')!;
  private lookZoneEl = document.getElementById('look-zone')!;
  private btnUp = document.getElementById('btn-up')!;
  private btnDown = document.getElementById('btn-down')!;
  private btnBoost = document.getElementById('btn-boost')!;

  private joystickPointerId: number | null = null;
  private joystickCenterX = 0;
  private joystickCenterY = 0;
  private joystickRadius = 50;

  private lookPointerId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  // Combined state reflected to FlyControls.setMoveAxis
  private axisX = 0; // strafe (-1..1)
  private axisY = 0; // vertical (-1..1)  — up/down buttons
  private axisZ = 0; // forward (-1..1)

  private firstTouchFired = false;

  constructor(
    private controls: FlyControls,
    private onFirstTouch: () => void,
  ) {
    this.wireJoystick();
    this.wireLookZone();
    this.wireMovementButtons();
    this.wireFirstTouch();
  }

  // ---------------------------------------------------------------------
  // Joystick
  // ---------------------------------------------------------------------

  private wireJoystick() {
    this.joystickEl.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.joystickPointerId !== null) return;
      e.preventDefault();
      const rect = this.joystickEl.getBoundingClientRect();
      this.joystickCenterX = rect.left + rect.width / 2;
      this.joystickCenterY = rect.top + rect.height / 2;
      this.joystickRadius = Math.min(rect.width, rect.height) / 2 - 8;
      this.joystickPointerId = e.pointerId;
      this.joystickEl.setPointerCapture(e.pointerId);
      this.updateJoystickFromEvent(e);
    });

    this.joystickEl.addEventListener('pointermove', (e: PointerEvent) => {
      if (e.pointerId !== this.joystickPointerId) return;
      e.preventDefault();
      this.updateJoystickFromEvent(e);
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.joystickPointerId = null;
      this.axisX = 0;
      this.axisZ = 0;
      this.pushMoveAxis();
      this.joystickNub.style.transform = 'translate(0px, 0px)';
    };
    this.joystickEl.addEventListener('pointerup', release);
    this.joystickEl.addEventListener('pointercancel', release);
    this.joystickEl.addEventListener('pointerleave', release);
  }

  private updateJoystickFromEvent(e: PointerEvent) {
    const dx = e.clientX - this.joystickCenterX;
    const dy = e.clientY - this.joystickCenterY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, this.joystickRadius);
    const angle = Math.atan2(dy, dx);
    const nubX = Math.cos(angle) * clampedDist;
    const nubY = Math.sin(angle) * clampedDist;
    this.joystickNub.style.transform = `translate(${nubX}px, ${nubY}px)`;

    // Normalized -1..1
    this.axisX = nubX / this.joystickRadius;
    // Screen y-axis is flipped relative to forward intent (up on screen = forward).
    this.axisZ = -nubY / this.joystickRadius;
    this.pushMoveAxis();
  }

  private pushMoveAxis() {
    this.controls.setMoveAxis(this.axisX, this.axisY, this.axisZ);
  }

  // ---------------------------------------------------------------------
  // Look zone (swipe anywhere in the transparent overlay)
  // ---------------------------------------------------------------------

  private wireLookZone() {
    this.lookZoneEl.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.lookPointerId !== null) return;
      // Only handle events whose target is the look-zone itself.
      if (e.target !== this.lookZoneEl) return;
      e.preventDefault();
      this.lookPointerId = e.pointerId;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
      this.lookZoneEl.setPointerCapture(e.pointerId);
    });

    this.lookZoneEl.addEventListener('pointermove', (e: PointerEvent) => {
      if (e.pointerId !== this.lookPointerId) return;
      e.preventDefault();
      const dx = e.clientX - this.lookLastX;
      const dy = e.clientY - this.lookLastY;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
      this.controls.addLookDelta(dx, dy);
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.lookPointerId) return;
      this.lookPointerId = null;
    };
    this.lookZoneEl.addEventListener('pointerup', release);
    this.lookZoneEl.addEventListener('pointercancel', release);
    this.lookZoneEl.addEventListener('pointerleave', release);
  }

  // ---------------------------------------------------------------------
  // Up / Down / Boost buttons
  // ---------------------------------------------------------------------

  private wireMovementButtons() {
    this.bindHoldButton(
      this.btnUp,
      () => {
        this.axisY = 1;
        this.pushMoveAxis();
      },
      () => {
        if (this.axisY === 1) {
          this.axisY = 0;
          this.pushMoveAxis();
        }
      },
    );
    this.bindHoldButton(
      this.btnDown,
      () => {
        this.axisY = -1;
        this.pushMoveAxis();
      },
      () => {
        if (this.axisY === -1) {
          this.axisY = 0;
          this.pushMoveAxis();
        }
      },
    );
    this.bindHoldButton(
      this.btnBoost,
      () => this.controls.setBoostOverride(true),
      () => this.controls.setBoostOverride(false),
    );
  }

  private bindHoldButton(
    el: HTMLElement,
    onDown: () => void,
    onUp: () => void,
  ) {
    const handleDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('active');
      el.setPointerCapture(e.pointerId);
      onDown();
    };
    const handleUp = (e: PointerEvent) => {
      if (!el.classList.contains('active')) return;
      el.classList.remove('active');
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured, no-op */
      }
      onUp();
    };
    el.addEventListener('pointerdown', handleDown);
    el.addEventListener('pointerup', handleUp);
    el.addEventListener('pointercancel', handleUp);
    el.addEventListener('pointerleave', handleUp);
  }

  // ---------------------------------------------------------------------
  // First touch
  // ---------------------------------------------------------------------

  private wireFirstTouch() {
    const handler = () => {
      if (this.firstTouchFired) return;
      this.firstTouchFired = true;
      this.onFirstTouch();
      document.removeEventListener('pointerdown', handler, true);
    };
    // Capture phase so we see the gesture regardless of which element
    // was the actual target.
    document.addEventListener('pointerdown', handler, true);
  }
}
