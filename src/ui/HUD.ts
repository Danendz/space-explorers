import * as THREE from 'three';

export interface HUDCallbacks {
  onAudioToggle?: () => void;
  onNextTrack?: () => void;
}

export class HUD {
  private speedEl = document.getElementById('r-speed')!;
  private posEl = document.getElementById('r-pos')!;
  private audioIconEl = document.getElementById('audio-icon')!;
  private nextTrackEl = document.getElementById('track-next')!;
  private trackNameEl = document.getElementById('track-name')!;
  private trackToastEl = document.getElementById('track-toast')!;
  private toastTimer: number | null = null;

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
}
