// Procedural sound: everything is synthesised from oscillators and a noise
// buffer, driven by the physics state each frame.

const NOISE_SECONDS = 2;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.6;
    this.lastImpact = 0;
    this.sloshPhase = 0;
    this.onStateChange = null;
  }

  get supported() {
    return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
  }

  get active() {
    return Boolean(this.ctx) && this.ctx.state === 'running';
  }

  // True while the output is still blocked and a user gesture would help.
  get needsGesture() {
    if (!this.supported) return false;
    return !this.ctx || this.ctx.state !== 'running';
  }

  get sessionSupported() {
    return typeof navigator !== 'undefined' && 'audioSession' in navigator;
  }

  // iOS puts Web Audio in the "ambient" session category by default, which the
  // hardware mute switch silences. "playback" ignores the switch, the way an
  // <audio> element does. Safari and iOS Safari 16.4+ only, so feature detect.
  claimPlayback() {
    if (!this.sessionSupported) return;
    try {
      navigator.audioSession.type = 'playback';
    } catch {
      // not settable here: nothing to do
    }
  }

  // Safe to call without a user gesture: the context is then created suspended
  // and the gesture listeners resume it.
  unlock() {
    if (!this.supported) return;
    this.claimPlayback();
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.ctx.onstatechange = () => {
        if (this.onStateChange) this.onStateChange();
      };
      this.build();
      this.applyMaster();
      this.claimPlayback();
    }
    // iOS reports "interrupted" after a screen lock, a call or a tab switch,
    // and can need more than one attempt to come back, so retry every gesture
    // rather than only when the state is exactly "suspended".
    if (this.ctx.state !== 'running') this.tryResume();
  }

  tryResume() {
    const p = this.ctx.resume();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (!this.ctx || this.ctx.state === 'running') return;
    this.claimPlayback();
    this.tryResume();
  }

  setEnabled(v) {
    this.enabled = v;
    this.applyMaster();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyMaster();
  }

  applyMaster() {
    if (!this.master) return;
    const target = this.enabled ? this.volume ** 1.6 : 0;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  diagnostics() {
    return {
      state: this.ctx ? this.ctx.state : 'none',
      session: this.sessionSupported ? navigator.audioSession.type : 'unsupported',
      master: this.master ? this.master.gain.value : 0,
    };
  }

  build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(c.destination);

    const len = c.sampleRate * NOISE_SECONDS;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    const noise = c.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    noise.start();

    const chain = (src, filterType, freq, q) => {
      const f = c.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      return { f, g };
    };

    this.motorOsc = c.createOscillator();
    this.motorOsc.type = 'sawtooth';
    this.motorOsc.frequency.value = 50;
    this.motorOsc2 = c.createOscillator();
    this.motorOsc2.type = 'triangle';
    this.motorOsc2.frequency.value = 100;
    const motorMix = c.createGain();
    motorMix.gain.value = 0.6;
    this.motorOsc.connect(motorMix);
    this.motorOsc2.connect(motorMix);
    this.motor = chain(motorMix, 'lowpass', 180, 1.2);
    this.motorOsc.start();
    this.motorOsc2.start();

    this.whineOsc = c.createOscillator();
    this.whineOsc.type = 'sine';
    this.whineOsc.frequency.value = 400;
    this.whine = chain(this.whineOsc, 'bandpass', 1200, 2);
    this.whineOsc.start();

    this.rumble = chain(noise, 'lowpass', 110, 0.7);
    this.slosh = chain(noise, 'bandpass', 500, 0.9);
    this.drain = chain(noise, 'bandpass', 260, 3);

    // A filling tub is a Helmholtz resonator: the air column above the water
    // shortens as the level rises, so the resonance climbs. Rushing noise plus
    // a peak swept by the water level.
    const fillHp = c.createBiquadFilter();
    fillHp.type = 'highpass';
    fillHp.frequency.value = 900;
    fillHp.Q.value = 0.7;
    const fillPeak = c.createBiquadFilter();
    fillPeak.type = 'peaking';
    fillPeak.frequency.value = 400;
    fillPeak.Q.value = 4;
    fillPeak.gain.value = 12;
    const fillGain = c.createGain();
    fillGain.gain.value = 0;
    noise.connect(fillHp);
    fillHp.connect(fillPeak);
    fillPeak.connect(fillGain);
    fillGain.connect(this.master);
    this.fill = { f: fillHp, peak: fillPeak, g: fillGain };

    this.drainLfo = c.createOscillator();
    this.drainLfo.frequency.value = 5.5;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 120;
    this.drainLfo.connect(lfoGain);
    lfoGain.connect(this.drain.f.frequency);
    this.drainLfo.start();
  }

  // s: { rpm, level, target, waterActive, swirl, agitation, load, paused }
  update(dt, s) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    const t = c.currentTime;
    const set = (param, value, tc = 0.12) => param.setTargetAtTime(value, t, tc);
    if (s.paused) {
      set(this.motor.g.gain, 0);
      set(this.whine.g.gain, 0);
      set(this.rumble.g.gain, 0);
      set(this.slosh.g.gain, 0);
      set(this.fill.g.gain, 0);
      set(this.drain.g.gain, 0);
      return;
    }
    const r = Math.abs(s.rpm);
    const spinning = r > 1;
    const loadK = 0.4 + 0.6 * Math.min(1, s.load / 10);

    set(this.motorOsc.frequency, 32 + r * 0.7, 0.2);
    set(this.motorOsc2.frequency, 64 + r * 1.4, 0.2);
    set(this.motor.f.frequency, 110 + r * 2.2, 0.2);
    set(this.motor.g.gain, spinning ? 0.1 + 0.26 * Math.min(1, r / 180) : 0);

    set(this.whineOsc.frequency, 180 + r * 9, 0.2);
    set(this.whine.f.frequency, 180 + r * 9, 0.2);
    set(this.whine.g.gain, r > 70 ? 0.07 * Math.min(1, (r - 70) / 120) : 0, 0.3);

    set(this.rumble.g.gain, spinning ? 0.34 * Math.min(1, r / 60) * loadK : 0);

    this.sloshPhase += dt * (1.2 + Math.abs(s.swirl) * 0.8);
    const sloshMod = 0.5 + 0.5 * Math.sin(this.sloshPhase);
    const motion = Math.min(1, Math.abs(s.swirl) / 2.5 + s.agitation / 3);
    set(this.slosh.f.frequency, 350 + 300 * sloshMod + 200 * motion, 0.15);
    set(this.slosh.g.gain, s.waterActive ? (0.05 + 0.3 * motion) * (0.6 + 0.4 * sloshMod) : 0);

    const filling = s.target > s.level + 0.005;
    const draining = s.target < s.level - 0.005;
    set(this.fill.peak.frequency, 300 + 900 * Math.min(1, s.level / 0.35), 0.3);
    set(this.fill.g.gain, filling ? 0.2 : 0, 0.25);
    set(this.drain.g.gain, draining ? 0.24 * Math.min(1, s.level / 0.1 + 0.2) : 0, 0.25);
  }

  impact(strength, wet, splash) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime;
    if (t - this.lastImpact < 0.07) return;
    this.lastImpact = t;
    const k = Math.min(1, strength / 8);
    const amp = (0.16 + 0.38 * k) * (0.7 + 0.5 * wet);

    const grain = 0.5;
    const offset = Math.random() * (NOISE_SECONDS - grain);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = c.createBiquadFilter();
    const g = c.createGain();
    if (splash) {
      f.type = 'bandpass';
      f.frequency.value = 900 + 800 * Math.random();
      f.Q.value = 0.8;
      g.gain.setValueAtTime(amp * 0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22 + 0.15 * k);
    } else {
      f.type = 'lowpass';
      f.frequency.setValueAtTime(700 + 600 * k, t);
      f.frequency.exponentialRampToValueAtTime(120, t + 0.12);
      f.Q.value = 0.9;
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14 + 0.1 * k);
    }
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, offset, grain);

    if (!splash) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90 + 40 * k, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      const og = c.createGain();
      og.gain.setValueAtTime(amp * 0.9, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(og);
      og.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.22);
    }
  }

  beep(count = 1, freq = 1046, spacing = 0.18) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const c = this.ctx;
    for (let i = 0; i < count; i++) {
      const t = c.currentTime + i * spacing;
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2600;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.setValueAtTime(0.12, t + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      osc.connect(f);
      f.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }
}
