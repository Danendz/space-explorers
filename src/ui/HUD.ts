import * as THREE from 'three';

export interface HUDCallbacks {
  onAudioToggle?: () => void;
  onNextTrack?: () => void;
  onToggleFullscreen?: () => void;
}

const STORAGE_KEY = 'space-explorers.instructions.closed';

export class HUD {
  private speedEl = document.getElementById('r-speed')!;
  private posEl = document.getElementById('r-pos')!;
  private audioIconEl = document.getElementById('audio-icon')!;
  private nextTrackEl = document.getElementById('track-next')!;
  private trackNameEl = document.getElementById('track-name')!;
  private trackToastEl = document.getElementById('track-toast')!;
  private instructionsEl = document.getElementById('instructions')!;
  private insCloseEl = document.getElementById('ins-close')!;
  private insReopenEl = document.getElementById('ins-reopen')!;
  private clickToStartEl = document.getElementById('click-to-start')!;
  private fullscreenBtn = document.getElementById('fullscreen-toggle')!;
  private toastTimer: number | null = null;
  private instructionsOpen = true;
  private touchMode = false;

  constructor(callbacks: HUDCallbacks = {}) {
    if (callbacks.onAudioToggle) {
      this.audioIconEl.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onAudioToggle?.();
      });
    }
    if (callbacks.onNextTrack) {
      this.nextTrackEl.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onNextTrack?.();
      });
    }
    if (callbacks.onToggleFullscreen) {
      this.fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onToggleFullscreen?.();
      });
    }

    // Instructions panel — open/close + localStorage persistence
    const storedClosed = this.readStoredClosed();
    this.setInstructionsOpen(!storedClosed, { persist: false });

    this.insCloseEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setInstructionsOpen(false);
    });
    this.insReopenEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setInstructionsOpen(true);
    });
  }

  private readStoredClosed(): boolean {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private writeStoredClosed(closed: boolean) {
    try {
      if (closed) window.localStorage.setItem(STORAGE_KEY, '1');
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore storage failures (e.g. Safari private mode) */
    }
  }

  update(speed: number, pos: THREE.Vector3) {
    this.speedEl.textContent = speed.toFixed(1);
    this.posEl.textContent = `${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}`;
  }

  setMuted(muted: boolean) {
    this.audioIconEl.classList.toggle('muted', muted);
  }

  setTrackName(name: string) {
    this.trackNameEl.textContent = name;
  }

  showTrackToast(name: string) {
    this.trackToastEl.textContent = name;
    this.trackToastEl.classList.add('visible');
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.trackToastEl.classList.remove('visible');
      this.toastTimer = null;
    }, 2000);
  }

  setInstructionsOpen(open: boolean, opts: { persist?: boolean } = {}) {
    if (this.touchMode) return; // no desktop instructions on mobile
    this.instructionsOpen = open;
    this.instructionsEl.classList.toggle('hidden', !open);
    this.insReopenEl.classList.toggle('hidden', open);
    if (opts.persist !== false) this.writeStoredClosed(!open);
  }

  toggleInstructions() {
    if (this.touchMode) return;
    this.setInstructionsOpen(!this.instructionsOpen);
  }

  setPointerLocked(locked: boolean) {
    if (this.touchMode) return;
    this.instructionsEl.classList.toggle('dimmed', locked);
    this.clickToStartEl.classList.toggle('hidden', locked);
  }

  setTouchMode(touch: boolean) {
    this.touchMode = touch;
    if (touch) {
      this.instructionsEl.classList.add('hidden');
      this.insReopenEl.classList.add('hidden');
      this.clickToStartEl.classList.add('hidden');
      document.getElementById('mobile-hud')?.classList.remove('hidden');
    }
  }

  setFullscreen(on: boolean) {
    document.body.classList.toggle('is-fullscreen', on);
  }
}
