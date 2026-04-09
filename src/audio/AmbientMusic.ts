/**
 * Procedural ambient music for Space Explorers.
 *
 * Multiple "tracks" (chord presets) that can be cycled via nextTrack().
 * Each track has two moods running in parallel that slowly crossfade
 * over ~3 minutes: a deep meditative drone and a warm cosmic dream pad.
 * Sparkle bells fire on a jittered interval. Everything is generated
 * live with the Web Audio API; no audio assets are shipped.
 *
 * Reactivity:
 *   - Shift-boost opens a lowpass on the drone bus.
 *
 * Usage:
 *   const music = new AmbientMusic();
 *   music.start();                 // after user gesture
 *   music.update(dt, boost);       // every frame
 *   music.nextTrack();             // switch to next preset
 */

const TAU = Math.PI * 2;
const MOOD_PERIOD = 180; // seconds per full crossfade cycle
const MASTER_LEVEL = 0.55;
const FADE_IN = 4.0;

// MIDI note number → frequency
function note(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

// ---------------------------------------------------------------------------
// Track presets
// ---------------------------------------------------------------------------
//
// Each track describes the chord / filter settings for the drone + dream
// buses, plus a pentatonic bell scale and a shimmer note pair. The number
// of drone/dream/shimmer notes is FIXED so we can just retune the existing
// oscillators rather than rebuilding the audio graph each switch.

interface TrackPreset {
  name: string;
  droneNotes: [number, number, number]; // 2 triangles + 1 warm sine (octave up)
  dreamNotes: [number, number, number, number]; // Cmaj7-shaped sine chord
  bellScale: readonly number[];
  droneCutoff: number; // base lowpass cutoff for drone bus
  droneBoostCutoff: number; // cutoff during shift-boost
  dreamCutoff: number;
}

const TRACKS: readonly TrackPreset[] = [
  {
    // Cm / Cmaj7 — the current default. Calm, slightly bittersweet.
    name: 'Nebula',
    droneNotes: [36, 43, 48], // C2, G2, C3 (warm)
    dreamNotes: [48, 52, 55, 59], // C3, E3, G3, B3 (Cmaj7)
    bellScale: [72, 74, 76, 79, 81, 84],
    droneCutoff: 520,
    droneBoostCutoff: 1100,
    dreamCutoff: 1200,
  },
  {
    // F major — brighter, open, gentle.
    name: 'Drift',
    droneNotes: [41, 48, 53], // F2, C3, F3
    dreamNotes: [53, 57, 60, 64], // F3, A3, C4, E4 (Fmaj7)
    bellScale: [77, 81, 84, 86, 89, 93],
    droneCutoff: 560,
    droneBoostCutoff: 1200,
    dreamCutoff: 1300,
  },
  {
    // Dm — contemplative, deeper, more melancholy.
    name: 'Void',
    droneNotes: [38, 45, 50], // D2, A2, D3
    dreamNotes: [50, 53, 57, 60], // D3, F3, A3, C4 (Dm7)
    bellScale: [74, 77, 81, 84, 86, 89],
    droneCutoff: 420,
    droneBoostCutoff: 950,
    dreamCutoff: 1050,
  },
  {
    // A major — uplifting, warm, the "sunrise" mood.
    name: 'Aurora',
    droneNotes: [33, 40, 45], // A1, E2, A2
    dreamNotes: [57, 61, 64, 68], // A3, C#4, E4, G#4 (Amaj7)
    bellScale: [69, 73, 76, 80, 81, 85],
    droneCutoff: 600,
    droneBoostCutoff: 1350,
    dreamCutoff: 1400,
  },
];

// ---------------------------------------------------------------------------

export class AmbientMusic {
  private ctx: AudioContext;
  private masterGain!: GainNode;
  private reverb!: ConvolverNode;

  // Bus outputs (pre-mood-crossfade gain)
  private meditativeGain!: GainNode;
  private dreamGain!: GainNode;

  // Drone (meditative) bus internals
  private boostFilter!: BiquadFilterNode;

  // Dream bus internals (for bell scheduling)
  private bellBus!: GainNode;
  private dreamFilter!: BiquadFilterNode;

  // Retunable oscillator references (one slot per TrackPreset array entry)
  private droneOscs: OscillatorNode[] = [];
  private dreamOscs: OscillatorNode[] = [];

  // State
  private started = false;
  private _muted = false;
  private startedAt = 0;
  private bellTimer: number | null = null;
  private trackIndex = 0;
  private switching = false;

  constructor() {
    const Ctor =
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext ?? window.AudioContext;
    this.ctx = new Ctor();
    this.buildGraph();
  }

  // ---------------------------------------------------------------------
  // Graph construction
  // ---------------------------------------------------------------------

  private buildGraph() {
    const ctx = this.ctx;
    const preset = TRACKS[this.trackIndex];

    // Master + fade-in envelope.
    // A gentle highpass sits at the very end to strip any sub-sonic rumble.
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    const masterHP = ctx.createBiquadFilter();
    masterHP.type = 'highpass';
    masterHP.frequency.value = 60;
    masterHP.Q.value = 0.4;
    this.masterGain.connect(masterHP);
    masterHP.connect(ctx.destination);

    // Reverb — lightly used. The impulse response is filtered / shaped
    // pink-ish noise so it doesn't sound like TV static.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulseResponse(2.2, 3.5);

    // Wet is intentionally subtle. Dry dominates so the tone stays clean.
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    const dry = ctx.createGain();
    dry.gain.value = 1.0;
    this.reverb.connect(wet);
    wet.connect(this.masterGain);
    dry.connect(this.masterGain);

    // Sum point: everything feeds here, then splits to wet + dry.
    const sum = ctx.createGain();
    sum.gain.value = 0.85;
    sum.connect(dry);
    sum.connect(this.reverb);

    // ---- Meditative bus --------------------------------------------------
    this.meditativeGain = ctx.createGain();
    this.meditativeGain.gain.value = 0.5;
    this.meditativeGain.connect(sum);

    this.boostFilter = ctx.createBiquadFilter();
    this.boostFilter.type = 'lowpass';
    this.boostFilter.frequency.value = preset.droneCutoff;
    this.boostFilter.Q.value = 0.3;
    this.boostFilter.connect(this.meditativeGain);

    // 2 triangle drones + 1 warm sine an octave up. All retunable.
    const droneDetunes = [-6, 6, 0];
    const droneGains = [0.11, 0.11, 0.06];
    const droneTypes: OscillatorType[] = ['triangle', 'triangle', 'sine'];
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = droneTypes[i];
      osc.frequency.value = note(preset.droneNotes[i]);
      osc.detune.value = droneDetunes[i];

      const g = ctx.createGain();
      g.gain.value = droneGains[i];
      osc.connect(g);
      g.connect(this.boostFilter);
      osc.start();
      this.droneOscs.push(osc);
    }

    // Breathing LFO on bus gain so the drone softly swells.
    const breathLfo = ctx.createOscillator();
    breathLfo.frequency.value = 0.05;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.035;
    breathLfo.connect(breathGain);
    breathGain.connect(this.meditativeGain.gain);
    breathLfo.start();

    // ---- Dream bus -------------------------------------------------------
    this.dreamGain = ctx.createGain();
    this.dreamGain.gain.value = 0.5;
    this.dreamGain.connect(sum);

    this.dreamFilter = ctx.createBiquadFilter();
    this.dreamFilter.type = 'lowpass';
    this.dreamFilter.frequency.value = preset.dreamCutoff;
    this.dreamFilter.Q.value = 0.3;
    this.dreamFilter.connect(this.dreamGain);

    // Slow LFO on dream filter cutoff (added on top of the base cutoff).
    const dreamLfo = ctx.createOscillator();
    dreamLfo.frequency.value = 0.03;
    const dreamLfoGain = ctx.createGain();
    dreamLfoGain.gain.value = 300;
    dreamLfo.connect(dreamLfoGain);
    dreamLfoGain.connect(this.dreamFilter.frequency);
    dreamLfo.start();

    // 4 sines: chord tones. Retunable.
    const dreamDetunes = [-3, 3, -2, 2];
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note(preset.dreamNotes[i]);
      osc.detune.value = dreamDetunes[i];

      const g = ctx.createGain();
      g.gain.value = 0.055;
      osc.connect(g);
      g.connect(this.dreamFilter);
      osc.start();
      this.dreamOscs.push(osc);
    }

    // ---- Bell sparkle bus (routes into reverb + dry) --------------------
    this.bellBus = ctx.createGain();
    this.bellBus.gain.value = 0.28;
    this.bellBus.connect(this.reverb);
    this.bellBus.connect(sum);
  }

  /**
   * Build a synthetic impulse response that doesn't sound like TV static.
   *
   * Strategy:
   *  1. Generate noise, but integrate it (running sum with leak) to push
   *     energy into lower frequencies — this produces ~pink noise, which
   *     is warmer and less harsh than white.
   *  2. Short attack ramp (5ms) so the reverb onset isn't a harsh pop.
   *  3. Exponential decay with a steeper curve so the tail dies quickly
   *     and doesn't linger as hiss.
   *  4. Per-channel decorrelation for a stereo sense of space.
   */
  private makeImpulseResponse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * duration);
    const attackSamples = Math.floor(ctx.sampleRate * 0.005);
    const ir = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let c = 0; c < 2; c++) {
      const data = ir.getChannelData(c);
      let acc = 0;
      const leak = 0.985;
      for (let i = 0; i < length; i++) {
        acc = acc * leak + (Math.random() * 2 - 1) * 0.2;
        const t = i / length;
        const envelope = Math.pow(1 - t, decay);
        const attack = i < attackSamples ? i / attackSamples : 1;
        data[i] = acc * envelope * attack * 0.55;
      }
    }
    return ir;
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  start() {
    if (this.started) return;
    this.started = true;
    this.startedAt = this.ctx.currentTime;

    const resume = this.ctx.resume ? this.ctx.resume() : Promise.resolve();
    void resume.then(() => {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(0, now);
      this.masterGain.gain.linearRampToValueAtTime(
        this._muted ? 0 : MASTER_LEVEL,
        now + FADE_IN,
      );
      this.scheduleNextBell();
    });
  }

  toggleMute() {
    this._muted = !this._muted;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(
      this._muted ? 0 : MASTER_LEVEL,
      now,
      0.12,
    );
  }

  get muted(): boolean {
    return this._muted;
  }

  get trackName(): string {
    return TRACKS[this.trackIndex].name;
  }

  /**
   * Cycle to the next track preset. Dips the master gain briefly so
   * frequency changes don't cause audible glitches, then retunes the
   * drone / dream / shimmer oscillators and brings the level back up.
   * Returns the name of the new track.
   */
  nextTrack(): string {
    if (this.switching) return TRACKS[this.trackIndex].name;
    this.switching = true;

    this.trackIndex = (this.trackIndex + 1) % TRACKS.length;
    const preset = TRACKS[this.trackIndex];

    // If we haven't started yet, just update state and return.
    if (!this.started) {
      this.applyPreset(preset);
      this.switching = false;
      return preset.name;
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dipDur = 0.55;
    const restoreDur = 1.2;

    // Fade master to near-zero so the retune is inaudible.
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(0, now, 0.15);

    window.setTimeout(() => {
      this.applyPreset(preset);

      const t = this.ctx.currentTime;
      const target = this._muted ? 0 : MASTER_LEVEL;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
      this.masterGain.gain.linearRampToValueAtTime(target, t + restoreDur);
      this.switching = false;
    }, dipDur * 1000);

    return preset.name;
  }

  private applyPreset(preset: TrackPreset) {
    const t = this.ctx.currentTime;
    // Retune drone oscillators
    for (let i = 0; i < this.droneOscs.length && i < preset.droneNotes.length; i++) {
      this.droneOscs[i].frequency.setValueAtTime(note(preset.droneNotes[i]), t);
    }
    // Retune dream oscillators
    for (let i = 0; i < this.dreamOscs.length && i < preset.dreamNotes.length; i++) {
      this.dreamOscs[i].frequency.setValueAtTime(note(preset.dreamNotes[i]), t);
    }
    // Update filter bases
    this.boostFilter.frequency.setValueAtTime(preset.droneCutoff, t);
    this.dreamFilter.frequency.setValueAtTime(preset.dreamCutoff, t);
  }

  // ---------------------------------------------------------------------
  // Per-frame update: crossfade + reactivity
  // ---------------------------------------------------------------------

  update(_dt: number, boosting: boolean) {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const elapsed = now - this.startedAt;

    // Mood crossfade
    const phase = (elapsed / MOOD_PERIOD) * TAU;
    const medTarget = 0.5 + 0.5 * Math.cos(phase);
    const dreamTarget = 0.5 + 0.5 * Math.sin(phase);
    this.meditativeGain.gain.setTargetAtTime(medTarget, now, 0.25);
    this.dreamGain.gain.setTargetAtTime(dreamTarget, now, 0.25);

    // Boost filter — use this track's cutoffs
    const preset = TRACKS[this.trackIndex];
    const cutoff = boosting ? preset.droneBoostCutoff : preset.droneCutoff;
    this.boostFilter.frequency.setTargetAtTime(cutoff, now, 0.6);
  }

  // ---------------------------------------------------------------------
  // Sparkle bells
  // ---------------------------------------------------------------------

  private scheduleNextBell() {
    // Jittered interval: 8–15 seconds
    const next = 8000 + Math.random() * 7000;
    this.bellTimer = window.setTimeout(() => {
      this.playBell();
      this.scheduleNextBell();
    }, next);
  }

  private playBell() {
    if (!this.started || this._muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const scale = TRACKS[this.trackIndex].bellScale;
    const pitch = scale[Math.floor(Math.random() * scale.length)];

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = note(pitch);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.18, now + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0005, now + 2.4);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = note(pitch + 12);
    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0, now);
    env2.gain.linearRampToValueAtTime(0.08, now + 0.015);
    env2.gain.exponentialRampToValueAtTime(0.0005, now + 1.8);

    osc.connect(env);
    env.connect(this.bellBus);
    osc2.connect(env2);
    env2.connect(this.bellBus);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 2.6);
    osc2.stop(now + 2.0);
  }

  dispose() {
    if (this.bellTimer !== null) window.clearTimeout(this.bellTimer);
    void this.ctx.close();
  }
}
