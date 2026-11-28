import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';

function resolveSoundMaterial(matOrId) {
  if (typeof matOrId === 'string') return matOrId;
  if (typeof matOrId === 'number' && matOrId > 0) {
    if (matOrId === BLOCK_IDS.GLASS || matOrId === BLOCK_IDS.ICE) return 'glass';
    if (matOrId === BLOCK_IDS.WATER) return 'water';
    if (matOrId === BLOCK_IDS.SAND || matOrId === BLOCK_IDS.GRAVEL) return 'sand';
    if (matOrId === BLOCK_IDS.GRASS || matOrId === BLOCK_IDS.DIRT || matOrId === BLOCK_IDS.LEAVES || matOrId === BLOCK_IDS.FARMLAND) return 'grass';
    const def = BlockRegistry.get(matOrId);
    if (def?.tool === 'axe') return 'wood';
  }
  return 'stone';
}

/**
 * 100% offline procedural WebAudio synthesizer for Minecraft Classic Web Edition.
 * Requires zero external audio assets and degrades cleanly in headless environments.
 */
export class SoundManager {
  constructor(initialAudio = {}) {
    this.ctx = null;
    this.masterGain = null;
    this.volumes = {
      master: Number.isFinite(initialAudio.master) ? initialAudio.master : 80,
      music: Number.isFinite(initialAudio.music) ? initialAudio.music : 45,
      blocks: Number.isFinite(initialAudio.blocks) ? initialAudio.blocks : 85,
      hostile: Number.isFinite(initialAudio.hostile) ? initialAudio.hostile : 85,
      ui: Number.isFinite(initialAudio.ui) ? initialAudio.ui : 80,
    };
    this._noiseBuffer = null;
    this._lastStepAt = 0;
    this._musicTimer = 4 + Math.random() * 6;
    this._ambientIndex = 0;
  }

  setVolumes(audio = {}) {
    for (const key of ['master', 'music', 'blocks', 'hostile', 'ui']) {
      if (Number.isFinite(audio[key])) {
        this.volumes[key] = Math.max(0, Math.min(100, Math.round(audio[key])));
      }
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volumes.master / 100, this.ctx.currentTime, 0.02);
    }
  }

  setChannelVolume(channel, value) {
    if (!['master', 'music', 'blocks', 'hostile', 'ui'].includes(channel)) return;
    this.setVolumes({ [channel]: value });
  }

  _ensureCtx() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }
    const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AudioCtx) return null;
    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volumes.master / 100;
      this.masterGain.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      this.ctx = null;
      return null;
    }
  }

  unlock() {
    this._ensureCtx();
  }

  _gain(category) {
    const cat = this.volumes[category] ?? 80;
    return Math.max(0, Math.min(1, (this.volumes.master / 100) * (cat / 100)));
  }

  _getNoiseBuffer(ctx) {
    if (this._noiseBuffer) return this._noiseBuffer;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
    this._noiseBuffer = buf;
    return buf;
  }

  _tone(freqStart, freqEnd, duration, type, category, gainScale = 0.16, delay = 0) {
    const g = this._gain(category) * gainScale;
    if (g <= 0.002) return;
    const ctx = this._ensureCtx();
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(g, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  _noise(duration, filterType, freq, q, category, gainScale = 0.16, delay = 0) {
    const g = this._gain(category) * gainScale;
    if (g <= 0.002) return;
    const ctx = this._ensureCtx();
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, now);
    filter.Q.setValueAtTime(q, now);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(g, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterGain);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  playClick() {
    this._tone(680, 480, 0.045, 'triangle', 'ui', 0.12);
  }

  playUiClick() {
    this.playClick();
  }

  playPickup() {
    this._tone(580, 960, 0.08, 'sine', 'ui', 0.11);
  }

  playXpOrb() {
    this._tone(740 + Math.random() * 240, 1280, 0.075, 'sine', 'ui', 0.1);
  }

  playLevelUp() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this._tone(f, f * 1.01, 0.18, 'triangle', 'ui', 0.11, idx * 0.075);
    });
  }

  playSplash() {
    this._noise(0.18, 'bandpass', 720, 1.4, 'blocks', 0.18);
  }

  playBlockBreak(materialOrId = 'stone') {
    const material = resolveSoundMaterial(materialOrId);
    if (material === 'glass') {
      this._noise(0.14, 'highpass', 2600, 1.2, 'blocks', 0.2);
      this._tone(1850, 920, 0.09, 'triangle', 'blocks', 0.1);
    } else if (material === 'wood') {
      this._tone(210, 115, 0.075, 'triangle', 'blocks', 0.16);
      this._noise(0.07, 'bandpass', 650, 1.6, 'blocks', 0.14);
    } else if (material === 'grass' || material === 'sand') {
      this._noise(0.11, 'bandpass', material === 'sand' ? 1400 : 880, 1.0, 'blocks', 0.17);
    } else {
      this._tone(165, 85, 0.07, 'square', 'blocks', 0.09);
      this._noise(0.09, 'lowpass', 1100, 1.2, 'blocks', 0.16);
    }
  }

  playBlockPlace(materialOrId = 'stone') {
    const material = resolveSoundMaterial(materialOrId);
    if (material === 'wood') {
      this._tone(250, 170, 0.055, 'triangle', 'blocks', 0.14);
    } else if (material === 'grass' || material === 'sand') {
      this._noise(0.075, 'bandpass', 760, 1.1, 'blocks', 0.12);
    } else {
      this._tone(210, 130, 0.05, 'triangle', 'blocks', 0.13);
    }
  }

  playFootstep(materialOrId = 'grass') {
    const material = resolveSoundMaterial(materialOrId);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this._lastStepAt < 260) return;
    this._lastStepAt = now;
    if (material === 'water') {
      this._noise(0.08, 'bandpass', 580, 1.5, 'blocks', 0.08);
    } else if (material === 'stone') {
      this._tone(145, 90, 0.04, 'triangle', 'blocks', 0.055);
    } else {
      this._noise(0.055, 'lowpass', 620, 1.0, 'blocks', 0.065);
    }
  }

  playStep(materialOrId = 'grass') {
    this.playFootstep(materialOrId);
  }

  playHit() {
    this._noise(0.06, 'bandpass', 1200, 1.4, 'hostile', 0.13);
    this._tone(240, 110, 0.06, 'triangle', 'hostile', 0.12);
  }

  playHurt(heavy = false) {
    this._tone(heavy ? 150 : 195, 78, heavy ? 0.14 : 0.09, 'sawtooth', 'hostile', heavy ? 0.18 : 0.14);
  }

  playEat() {
    this._noise(0.075, 'bandpass', 920 + Math.random() * 240, 1.5, 'blocks', 0.12);
  }

  playBurp() {
    this._tone(180, 120, 0.18, 'sawtooth', 'blocks', 0.11);
  }

  playBowShoot() {
    this.playMobSound('bow_shoot');
  }

  playExplosion() {
    this._noise(0.55, 'lowpass', 420, 0.8, 'hostile', 0.36);
    this._tone(95, 28, 0.42, 'sawtooth', 'hostile', 0.24);
  }

  playMobSound(kind) {
    if (kind === 'creeper_fuse') {
      this._noise(0.45, 'highpass', 1800, 2.2, 'hostile', 0.14);
    } else if (kind === 'enderman_scream') {
      this._tone(420, 185, 0.32, 'sawtooth', 'hostile', 0.14);
    } else if (kind === 'enderman_tp') {
      this._tone(640, 220, 0.14, 'sine', 'hostile', 0.11);
    } else if (kind === 'bow_shoot') {
      this._tone(420, 190, 0.09, 'triangle', 'hostile', 0.12);
      this._noise(0.08, 'highpass', 1700, 1.8, 'hostile', 0.08);
    } else if (kind === 'player_hurt' || kind === 'mob_hurt') {
      this._tone(195, 95, 0.09, 'sawtooth', 'hostile', 0.14);
    }
  }

  updateMusic(dt) {
    if (this._gain('music') <= 0.005) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;

    this._musicTimer = 18 + Math.random() * 10;
    const chords = [
      [261.63, 329.63, 392.0], // C major
      [220.0, 261.63, 329.63],  // A minor
      [174.61, 220.0, 261.63],  // F major
      [196.0, 246.94, 293.66],  // G major
    ];
    const chord = chords[this._ambientIndex % chords.length];
    this._ambientIndex++;
    for (let i = 0; i < chord.length; i++) {
      this._tone(chord[i], chord[i] * 0.996, 2.8, 'sine', 'music', 0.045, i * 0.35);
    }
  }
}
