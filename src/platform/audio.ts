/**
 * All sound is synthesised with the Web Audio API, so the game ships with
 * zero audio assets. Includes a small generative synthwave soundtrack.
 */

export type Sfx = 'eat' | 'golden' | 'power' | 'powerEnd' | 'portal' | 'die' | 'click' | 'win' | 'levelUp' | 'expire';

// A minor progression (Am - F - C - G) as MIDI roots, with chord tones.
const PROGRESSION = [
  { root: 45, tones: [57, 60, 64, 69, 72] },
  { root: 41, tones: [53, 57, 60, 65, 69] },
  { root: 48, tones: [55, 60, 64, 67, 72] },
  { root: 43, tones: [55, 59, 62, 67, 71] },
];
const STEP = 60 / 112 / 2; // eighth notes at 112 BPM
const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private sfxOn = true;
  private musicOn = true;
  private musicTimer: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  /** 0 = menu (calm), 1 = in-game (adds drums). */
  private intensity = 0;

  /** Must be called from a user gesture (browsers block autoplay). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const master = this.ctx.createGain();
      master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.5;
      this.sfxBus.connect(master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.22;
      this.musicBus.connect(master);
      this.noise = this.makeNoise();
      if (this.musicOn) this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  setIntensity(level: number): void {
    this.intensity = level;
  }

  /** Suspend everything (app in background). */
  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  play(sfx: Sfx, param = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxOn) return;
    const t = ctx.currentTime;
    switch (sfx) {
      case 'eat': {
        // Pitch climbs with the combo — a satisfying audio reward.
        const f = 520 * 2 ** ((Math.min(param, 8) - 1) * 2 / 12);
        this.tone('triangle', f, f * 1.5, t, 0.09, 0.5);
        this.tone('sine', f * 2, f * 2, t, 0.06, 0.15);
        break;
      }
      case 'golden':
        [0, 4, 7, 12].forEach((s, i) => this.tone('square', 660 * 2 ** (s / 12), null, t + i * 0.05, 0.08, 0.18));
        break;
      case 'power':
        this.tone('sawtooth', 220, 1320, t, 0.28, 0.2, 2400);
        this.tone('sine', 440, 1760, t, 0.28, 0.25);
        break;
      case 'powerEnd':
        this.tone('sine', 880, 330, t, 0.25, 0.2);
        break;
      case 'expire':
        this.tone('sine', 600, 300, t, 0.12, 0.12);
        break;
      case 'portal':
        this.noiseBurst(t, 0.35, 0.35, 300, 4000);
        this.tone('sine', 300, 900, t, 0.3, 0.2);
        break;
      case 'die':
        this.tone('sawtooth', 320, 50, t, 0.6, 0.45, 1600);
        this.noiseBurst(t, 0.4, 0.5, 2000, 200);
        break;
      case 'click':
        this.tone('sine', 1200, 900, t, 0.04, 0.15);
        break;
      case 'win':
      case 'levelUp':
        [0, 4, 7, 12, 16].forEach((s, i) => this.tone('triangle', 523 * 2 ** (s / 12), null, t + i * 0.08, 0.22, 0.3));
        break;
    }
  }

  // ---------------------------------------------------------------- synthesis helpers

  private tone(
    type: OscillatorType,
    from: number,
    to: number | null,
    at: number,
    dur: number,
    vol: number,
    lowpass?: number,
    bus: GainNode = this.sfxBus,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node: AudioNode = osc.connect(gain);
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      node = node.connect(f);
    }
    node.connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private noiseBurst(at: number, dur: number, vol: number, fFrom: number, fTo: number, bus: GainNode = this.sfxBus): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(fFrom, at);
    filter.frequency.exponentialRampToValueAtTime(fTo, at + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(gain).connect(bus);
    src.start(at);
    src.stop(at + dur);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------------------------------------------------------------- music

  private startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    // Look-ahead scheduler: robust against timer jitter.
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx!;
    while (this.nextStepTime < ctx.currentTime + 0.2) {
      this.playStep(this.step, this.nextStepTime);
      this.nextStepTime += STEP;
      this.step++;
    }
  }

  private playStep(step: number, at: number): void {
    const bar = Math.floor(step / 8) % PROGRESSION.length;
    const beat = step % 8;
    const chord = PROGRESSION[bar];
    const bus = this.musicBus;

    // Bass on every beat, pumping.
    if (beat % 2 === 0) this.tone('sawtooth', midi(chord.root), null, at, STEP * 1.8, 0.35, 380, bus);
    // Pad at the start of each bar.
    if (beat === 0) {
      for (const n of chord.tones.slice(0, 3)) this.tone('triangle', midi(n), null, at, STEP * 8, 0.05, 1200, bus);
    }
    // Arpeggio: deterministic pattern with a bit of variation per bar.
    const pattern = [0, 2, 1, 3, 4, 2, 3, 1];
    const note = chord.tones[(pattern[beat] + bar) % chord.tones.length];
    this.tone('square', midi(note + 12), null, at, STEP * 0.8, 0.07, 2600, bus);

    if (this.intensity > 0) {
      if (beat % 4 === 0) this.tone('sine', 150, 40, at, 0.18, 0.7, undefined, bus); // kick
      if (beat % 2 === 1) this.noiseBurst(at, 0.05, 0.12, 8000, 6000, bus); // hat
      if (beat === 4) this.noiseBurst(at, 0.16, 0.3, 1800, 900, bus); // snare
    }
  }
}

export const audio = new AudioEngine();
