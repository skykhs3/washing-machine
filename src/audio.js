// Procedural sound: everything is synthesised from oscillators and a noise
// buffer, driven by the physics state each frame.
//
// Levels are calibrated against the A-weighted balance of a real front loader:
// broadband structure-borne rumble carries the spin, bubble-band water noise
// carries fill and wash, the pump carries the drain, and the motor sits behind
// all of them. Every pitch is proportional to speed with no constant offset,
// so timbre brightens with rpm instead of merely transposing.

const NOISE_SECONDS = 4;
const TAU = Math.PI * 2;

// The drum tops out at 200 rpm, an 11 g extraction, far gentler than a real
// machine's 1200 rpm. Pitches follow a warped speed anchored so the tumble
// stays at its true rate and the spin sounds like a real extraction. Levels
// use the unwarped drum speed instead, or the warp would be counted twice.
const TUMBLE_RPM = 45;
const SPIN_TOP_RPM = 200;
const SPIN_WARP = 2.2;
const SPIN_REF_RPM = 1200;

// Belt-driven motor: shaft rate times stator slot count.
const WHINE_HZ_PER_RPM = 3.6;

// Minnaert resonance, f = 3.28/a, puts the bubbles that water entrains
// (roughly 0.5 to 5 mm across) in this band, which is where its energy sits.
// Without the upper limit white noise leaves most of its energy above 8 kHz
// and reads as digital hiss rather than water.
const BUBBLE_LO = 320;
const BUBBLE_HI = 4200;
const BUBBLE_PEAK = 1500;

// Cabinet panel modes. The rumble sits on the lowest one; laundry impacts ring
// the pair as fixed decaying sinusoids.
const CABINET_HZ = 125;
const RUMBLE_TOP = 1800;
const PANEL_MODES = [104, 179];

// Air column above the water shortens as the tub fills, so the Helmholtz
// resonance climbs. A real vessel sweeps three octaves.
const FILL_RES_LO = 150;
const FILL_RES_HI = 1200;

// Drain pump: 6 vanes at about 2800 rpm. What makes a pump identifiable is
// not the blade rate but the motor whine a couple of harmonics above its slot
// passing frequency (24 slots at 2800 rpm is about 1120 Hz), over broadband
// turbulence from the volute and the corrugated hose.
const PUMP_BLADE_HZ = 280;
const PUMP_WHINE_HZ = 2100;

// Suspension. A tub on soft springs sits at 3 to 5 Hz, so a spin ramps up
// through its resonance, shakes hardest there, then quietens as it goes
// supercritical and the tub starts to self-centre. RES_MECH is that speed as a
// fraction of the top drum speed: 0.45 is 90 rpm here, which audioRpm maps to
// 207 rpm, or 3.4 Hz. ZETA is the damping of the friction dampers.
const RES_MECH = 0.45;
const ZETA = 0.18;

// A garment falling the full drum diameter lands at 12.5 drum units/s.
const IMPACT_REF = 12.5;

// A drum reversal drops several garments in the same frame. They have to sound
// together rather than being thinned to one hit, so voices are merged by the
// incoherent-sum rule below and only a pathological burst is capped.
const IMPACT_VOICES = 6;
const IMPACT_WINDOW = 0.1;

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.6;
    this.recentImpacts = [];
    this.lifterPhase = 0;
    this.sloshPhase = 0;
    this.fillWander = 0;
    this.gurgleTimer = 0;
    this.wasFilling = null;
    this.wasDraining = null;
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

  // Warped drum speed the tonal sources track. TUMBLE_RPM maps to itself and
  // SPIN_TOP_RPM to SPIN_REF_RPM, so wash keeps its real cadence while the
  // spin reaches the pitch of a real extraction.
  static audioRpm(rpm) {
    const r = Math.abs(rpm);
    return TUMBLE_RPM * (r / TUMBLE_RPM) ** SPIN_WARP;
  }

  filter(type, freq, q = 0.7, gain = 0) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (gain) f.gain.value = gain;
    return f;
  }

  // One looping noise source, phase-offset so the beds are decorrelated
  // instead of being filtered copies of the same signal.
  noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.start(this.ctx.currentTime, Math.random() * NOISE_SECONDS);
    return src;
  }

  // Chains a source through the given filters into its own gain, muted.
  bed(src, filters) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    let node = src;
    for (const f of filters) {
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.bus);
    return { g, filters };
  }

  // Sine LFO into an AudioParam, for amplitude modulation locked to a
  // mechanical rate. Depth is set per frame alongside the carrier level.
  lfo(param) {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = 1;
    const depth = this.ctx.createGain();
    depth.gain.value = 0;
    osc.connect(depth);
    depth.connect(param);
    osc.start();
    return { osc, depth };
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

    // Everything the machine makes on its own runs through this bus, so a
    // pause can mute all of it with one gain. Sounds that answer a tap stay on
    // the master, or the door grip and the console would go dead while paused.
    this.bus = c.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.master);

    const len = c.sampleRate * NOISE_SECONDS;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    // Structure-borne spin noise: broadband, resting on the lowest cabinet
    // mode, amplitude modulated once per drum revolution by the load
    // imbalance. This is what a spinning machine actually sounds like, so it
    // has to be the loudest bed at speed.
    this.rumble = this.bed(this.noiseSource(), [
      this.filter('lowpass', RUMBLE_TOP, 0.7),
      this.filter('peaking', CABINET_HZ, 1.8, 9),
      this.filter('highpass', 34, 0.7),
    ]);
    this.rumbleAm = this.lfo(this.rumble.g.gain);

    // Water in the drum: bubble band, pulsed as the lifters scoop it.
    this.slosh = this.bed(this.noiseSource(), [
      this.filter('highpass', BUBBLE_LO, 0.7),
      this.filter('lowpass', BUBBLE_HI, 0.7),
      this.filter('peaking', BUBBLE_PEAK, 1.0, 8),
    ]);

    // Inlet water. The peaking filter is the Helmholtz resonance and nothing
    // above it attenuates its sweep, so the pitch rise is audible throughout.
    this.fill = this.bed(this.noiseSource(), [
      this.filter('highpass', 180, 0.7),
      this.filter('lowpass', 4800, 0.7),
      this.filter('peaking', FILL_RES_LO, 5, 14),
    ]);
    this.fillRes = this.fill.filters[2];
    // The jet hits bare drum at first and water later, so its bright rattle
    // fades as the tub fills.
    this.fillJet = this.bed(this.noiseSource(), [
      this.filter('bandpass', 2200, 0.8),
    ]);

    // Drain pump. The blade rate is a throb behind the sound, not the sound
    // itself: a narrow band on it reads as a low hum, where a real pump is a
    // high whirr. So the blade filter is left wide and quiet and the turbulence
    // in the volute and the corrugated hose, which is where the energy of a
    // real one sits, carries it.
    this.drain = this.bed(this.noiseSource(), [
      this.filter('bandpass', PUMP_BLADE_HZ, 1.4),
      this.filter('peaking', PUMP_BLADE_HZ * 2, 4, 6),
    ]);
    this.drainFlow = this.bed(this.noiseSource(), [
      this.filter('highpass', 700, 0.7),
      this.filter('lowpass', 5200, 0.7),
      this.filter('peaking', 1900, 0.9, 6),
    ]);
    this.pumpWhine = c.createGain();
    this.pumpWhine.gain.value = 0;
    this.pumpBand = this.filter('bandpass', PUMP_WHINE_HZ, 0.9);
    this.pumpWhine.connect(this.pumpBand);
    this.pumpBand.connect(this.bus);
    this.pumpOscs = [];
    for (const mult of [4, 6]) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = PUMP_BLADE_HZ * mult;
      const g = c.createGain();
      g.gain.value = mult === 4 ? 0.6 : 0.4;
      osc.connect(g);
      g.connect(this.pumpWhine);
      osc.start();
      this.pumpOscs.push({ osc, mult });
    }

    // Water thrown out of the load through the drum perforations during spin.
    this.spray = this.bed(this.noiseSource(), [
      this.filter('highpass', 1400, 0.7),
      this.filter('lowpass', 6500, 0.7),
    ]);

    // Air dragged round by the drum and sheared off the lifters. An edge
    // dipole radiates as the cube of speed, so this is nothing at a tumble and
    // the brightest thing in the machine at full extraction, which is what
    // makes a real spin sound fast rather than merely loud.
    this.air = this.bed(this.noiseSource(), [
      this.filter('highpass', 700, 0.7),
      this.filter('lowpass', 7500, 0.7),
    ]);

    // Motor. Two partials whose pitch is strictly proportional to speed, with
    // sidebands from shaft eccentricity, so it reads as a machine rather than
    // a transposed synth tone.
    this.whineOsc = c.createOscillator();
    this.whineOsc.type = 'sine';
    this.whineOsc.frequency.value = 200;
    this.whineOsc2 = c.createOscillator();
    this.whineOsc2.type = 'triangle';
    this.whineOsc2.frequency.value = 100;
    const whineMix = c.createGain();
    whineMix.gain.value = 0.7;
    this.whineOsc.connect(whineMix);
    this.whineOsc2.connect(whineMix);
    this.whine = this.bed(whineMix, [this.filter('lowpass', 6000, 0.7)]);
    this.whineAm = this.lfo(this.whine.g.gain);
    this.whineOsc.start();
    this.whineOsc2.start();
  }

  // s: { rpm, level, target, waterActive, swirl, agitation, load, wetness,
  //      lifters, paused }
  update(dt, s) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    const t = c.currentTime;
    const set = (param, value, tc = 0.12) => param.setTargetAtTime(value, t, tc);

    const filling = s.target > s.level + 0.005;
    const draining = s.target < s.level - 0.005;
    if (this.wasFilling === null) {
      this.wasFilling = filling;
      this.wasDraining = draining;
    }

    if (s.paused) {
      // The AM depths feed the bed gain AudioParams directly, and a param's
      // value is its own plus everything connected to it, so zeroing the beds
      // would leave the LFOs still swinging them. Muting the bus covers every
      // bed at once, including any added later.
      set(this.bus.gain, 0, 0.02);
      set(this.rumbleAm.depth.gain, 0, 0.02);
      set(this.whineAm.depth.gain, 0, 0.02);
      // A stage can still be skipped while paused, so take on whatever the
      // water did; otherwise resuming would fire a valve or pump one-shot for
      // a transition that already happened.
      this.wasFilling = filling;
      this.wasDraining = draining;
      // Bed levels are left where they are rather than pulled to zero, so
      // resuming is immediate instead of fading back in.
      return;
    }
    set(this.bus.gain, 1, 0.05);

    const r = Math.abs(s.rpm);
    const ar = AudioEngine.audioRpm(s.rpm);
    const pitch = ar / SPIN_REF_RPM;
    const mech = r / SPIN_TOP_RPM;
    const rotHz = r / 60;
    const loadK = 0.4 + 0.6 * Math.min(1, s.load / 10);

    // Imbalance force grows with the square of speed, but what reaches the
    // cabinet is that force times the suspension transmissibility, which peaks
    // where the drum rate meets the suspension resonance and falls away above
    // it. So a spin-up swells as it passes through the resonance near 90 rpm,
    // settles once it is running supercritical, and climbs again with speed,
    // which is the shape a real extraction has.
    const ratio = mech / RES_MECH;
    const zr = 2 * ZETA * ratio;
    const trans = Math.sqrt((1 + zr * zr) / ((1 - ratio * ratio) ** 2 + zr * zr));
    const rumbleLevel = Math.min(1.1, loadK * mech * mech * (0.443 + 1.273 * trans));
    set(this.rumble.g.gain, rumbleLevel);
    // Above resonance the tub centres itself on its own axis, so the once per
    // revolution modulation collapses even as the level rises again. It has to
    // go nearly all the way: the drum tops out at 200 rpm, so this runs at
    // 3.3 Hz where a real extraction runs at 20 Hz, and modulation that slow is
    // heard as separate swells, like waves, rather than as the roughness a real
    // machine has. What survives is the slow lurch of the resonance passage,
    // which is the part you really do hear.
    const amFade = 1 - 0.85 * smoothstep(0.45, 0.85, mech);
    set(this.rumbleAm.depth.gain, rumbleLevel * 0.4 * amFade * Math.min(1, s.load / 6));
    set(this.rumbleAm.osc.frequency, Math.max(0.05, rotHz), 0.2);
    // Dull through the resonance, bright at the top: bearing and air noise
    // reach further up the spectrum the faster the drum turns.
    set(this.rumble.filters[0].frequency, RUMBLE_TOP * (0.55 + 0.45 * mech), 0.3);
    set(this.rumble.filters[1].frequency, CABINET_HZ * (1 + 0.1 * mech), 0.3);

    // Motor: proportional pitch, brightening with speed, sidebands at the
    // shaft rate. Nearly inaudible at tumble speeds, as a real one is.
    const whineHz = Math.max(30, ar * WHINE_HZ_PER_RPM);
    set(this.whineOsc.frequency, whineHz, 0.2);
    set(this.whineOsc2.frequency, whineHz * 0.5, 0.2);
    const whineLevel = 0.05 * Math.max(0, pitch) ** 0.7;
    set(this.whine.g.gain, r > 0.5 ? whineLevel : 0, 0.2);
    set(this.whineAm.depth.gain, whineLevel * 0.3);
    set(this.whineAm.osc.frequency, Math.max(0.05, rotHz), 0.2);

    // Water. The lifters scoop once per lifter per revolution, which is the
    // rhythm you hear from a front loader, over the slower rocking of the
    // water body itself.
    const lifters = s.lifters || 3;
    const lifterHz = rotHz * lifters;
    // Wrapped so sin() keeps its precision over an unbounded session.
    this.lifterPhase = (this.lifterPhase + dt * lifterHz * TAU) % TAU;
    this.sloshPhase = (this.sloshPhase + dt * (0.99 + 0.25 * Math.min(2, Math.abs(s.swirl))) * TAU) % TAU;
    const scoop = (0.5 + 0.5 * Math.sin(this.lifterPhase)) ** 3;
    const rock = 0.5 + 0.5 * Math.sin(this.sloshPhase);
    const scoopDepth = 0.75 * Math.min(1, r / 18);
    const motion = Math.min(1, Math.abs(s.swirl) / 2.5 + s.agitation / 3);
    const sloshBase = s.waterActive ? 0.005 + 0.039 * motion : 0;
    set(
      this.slosh.g.gain,
      sloshBase * (1 - scoopDepth + scoopDepth * scoop) * (0.75 + 0.25 * rock),
      0.05,
    );
    set(this.slosh.filters[2].frequency, BUBBLE_PEAK * (0.8 + 0.5 * motion), 0.15);

    if (filling !== this.wasFilling) {
      if (filling) this.valveOpen();
      else this.valveClose();
      this.wasFilling = filling;
    }
    if (draining !== this.wasDraining) {
      if (draining) this.pumpStart();
      else this.pumpStop();
      this.wasDraining = draining;
    }

    // Fill: the resonance climbs across three octaves as the air column above
    // the water shortens, with a slow wander so a three minute fill is not one
    // unbroken tone.
    const fillFrac = Math.min(1, s.level / 0.35);
    this.fillWander += (Math.random() - 0.5) * dt * 1.2;
    this.fillWander = Math.max(-1, Math.min(1, this.fillWander * (1 - dt * 0.5)));
    set(this.fillRes.frequency, FILL_RES_LO * (FILL_RES_HI / FILL_RES_LO) ** fillFrac, 0.3);
    set(this.fill.g.gain, filling ? 0.122 * (1 + 0.12 * this.fillWander) : 0, 0.2);
    set(this.fillJet.g.gain, filling ? 0.075 * (1 - 0.65 * fillFrac) : 0, 0.25);

    // Drain: the pump loads up as the tub empties and starts pulling air, so
    // it gets louder and rougher rather than fading out. The flow noise and the
    // motor whine lead, and the blade throb sits under them at about a fifth of
    // the level it used to, which is where a real pump puts it.
    const empty = 1 - Math.min(1, s.level / 0.12);
    set(this.drain.g.gain, draining ? 0.22 * (1.05 + 0.35 * empty) : 0, 0.2);
    set(this.drainFlow.g.gain, draining ? 0.12 * (1 + 0.6 * empty) : 0, 0.2);
    set(this.pumpWhine.gain, draining ? 0.08 * (1.1 + 0.55 * empty) : 0, 0.2);
    for (const p of this.pumpOscs) {
      set(p.osc.frequency, PUMP_BLADE_HZ * p.mult * (1 + 0.04 * empty), 0.2);
    }
    if (draining && empty > 0.35) {
      this.gurgleTimer -= dt;
      if (this.gurgleTimer <= 0) {
        this.gurgle(empty);
        this.gurgleTimer = 0.05 + Math.random() * 0.22;
      }
    } else {
      this.gurgleTimer = 0;
    }

    // Spin extraction: water leaving a wet load through the drum holes.
    const wetness = s.wetness ?? 0;
    const extracting = s.waterActive ? 0 : Math.max(0, Math.min(1, (mech - 0.25) / 0.75));
    set(this.spray.g.gain, 0.17 * extracting * wetness * loadK, 0.3);
    // Droplets leave faster as the drum speeds up, so the spray brightens.
    set(this.spray.filters[0].frequency, 1000 + 900 * mech, 0.3);

    set(this.air.g.gain, 0.085 * mech ** 2.5 * (0.7 + 0.3 * loadK), 0.25);
    set(this.air.filters[1].frequency, 2500 + 5000 * mech, 0.3);
  }

  // Incoherent sources add in power, so n simultaneous hits are each quieter
  // by 1/sqrt(n) and the group lands at the level of one. Returns 0 once the
  // window is saturated, which bounds node churn without thinning normal play.
  impactCrowd(t) {
    const recent = this.recentImpacts;
    while (recent.length && t - recent[0] > IMPACT_WINDOW) recent.shift();
    if (recent.length >= IMPACT_VOICES) return 0;
    recent.push(t);
    return 1 / Math.sqrt(recent.length);
  }

  // A damped sinusoid is what a resonant mode actually radiates. Fixed
  // frequency with a little scatter per hit, never a downward glide.
  mode(freq, amp, decay, t, type = 'sine', out = this.bus) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * (0.94 + Math.random() * 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  burst(t, { type = 'bandpass', freq, q = 1, amp, decay, sweepTo = 0, grain = 0.35 }, out = this.bus) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.filter(type, freq, q);
    if (sweepTo) {
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, Math.random() * (NOISE_SECONDS - grain), grain);
  }

  // A bubble rings at the Minnaert frequency and glides up as it shrinks. This
  // is what separates air breaking into the pump from a plain noise burst.
  bubble(t, freq, amp, out = this.bus) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'sine';
    const decay = 0.02 + Math.random() * 0.05;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  impact(strength, wet, splash) {
    // Laundry going under the surface is left silent. The foam still takes the
    // air it entrains; only the sound is dropped.
    if (splash) return;
    if (!this.ctx || !this.master || !this.enabled) return;
    const c = this.ctx;
    const crowd = this.impactCrowd(c.currentTime);
    if (!crowd) return;
    // Scatter hits that arrive in the same frame so they do not phase-align.
    const t = c.currentTime + Math.random() * 0.012;
    const k = Math.min(1, strength / IMPACT_REF);
    const amp = (0.16 + 0.5 * k) * crowd;

    // Wet cloth is heavier and much more damped: darker slap, shorter ring.
    const slapHz = 1300 - 600 * wet;
    const ring = (0.26 - 0.12 * wet) * (0.7 + 0.5 * k);
    this.burst(t, {
      freq: slapHz,
      q: 0.6,
      amp: amp * (0.8 + 0.3 * wet),
      decay: 0.05 + 0.05 * k - 0.02 * wet,
      sweepTo: slapHz * 0.35,
    });
    for (let i = 0; i < PANEL_MODES.length; i++) {
      this.mode(PANEL_MODES[i], amp * (i ? 0.35 : 0.6), ring * (i ? 0.7 : 1), t);
    }
  }

  // Inlet solenoid pulling in: a hard, tiny click, no body behind it.
  valveOpen() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.burst(t, { freq: 1900, q: 0.9, amp: 0.16, decay: 0.02, grain: 0.06 });
    this.mode(420, 0.06, 0.03, t, 'triangle');
  }

  // Closing an inlet valve stops the column of water dead, and the pipe
  // knocks. The thunk is the recognisable half.
  valveClose() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.burst(t, { freq: 1600, q: 0.9, amp: 0.14, decay: 0.018, grain: 0.06 });
    this.mode(72, 0.3, 0.16, t);
    this.mode(148, 0.12, 0.09, t);
  }

  // Pump impeller spinning up, so the whine glides in from below.
  pumpStart() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime;
    this.mode(190, 0.12, 0.07, t, 'triangle');
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(PUMP_BLADE_HZ * 1.2, t);
    osc.frequency.exponentialRampToValueAtTime(PUMP_BLADE_HZ * 4, t + 0.3);
    const f = this.filter('bandpass', PUMP_BLADE_HZ * 3, 1.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(f);
    f.connect(g);
    g.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  pumpStop() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(PUMP_BLADE_HZ * 4, t);
    osc.frequency.exponentialRampToValueAtTime(PUMP_BLADE_HZ * 1.1, t + 0.4);
    const f = this.filter('bandpass', PUMP_BLADE_HZ * 3, 1.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(f);
    f.connect(g);
    g.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.44);
    this.mode(160, 0.1, 0.09, t, 'triangle');
  }

  // Air breaking into the pump once the tub is nearly empty. Irregular by
  // design: a periodic warble reads as an effect, not as plumbing.
  gurgle(intensity) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const amp = 0.1 + 0.22 * intensity * Math.random();
    this.burst(t, {
      freq: 220 + Math.random() * 320,
      q: 2.5,
      amp,
      decay: 0.05 + Math.random() * 0.1,
      grain: 0.2,
    });
    // Cavities collapsing against the impeller are impulsive and reach well
    // above the flow noise, which is what makes the end of a drain read as a
    // pump struggling rather than as water sloshing.
    this.burst(t, { type: 'highpass', freq: 3200, amp: amp * 0.45, decay: 0.03, grain: 0.1 });
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.bubble(t + Math.random() * 0.06, 400 + Math.random() * 1100, amp * 0.35);
    }
  }

  // Door interlock engaging at the start of a course: a solid solenoid clack
  // through the cabinet.
  doorLock() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.burst(t, { freq: 2200, q: 1.0, amp: 0.3, decay: 0.025, grain: 0.08 });
    this.mode(PANEL_MODES[0], 0.16, 0.12, t);
    this.mode(310, 0.1, 0.05, t, 'triangle');
  }

  // Door latch: a hard, very short broadband tick over the ring of the plastic
  // body it is mounted in.
  latch() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.burst(t, { freq: 2600, q: 1.1, amp: 0.34, decay: 0.022, grain: 0.08 }, this.master);
    this.mode(305, 0.16, 0.05, t, 'triangle', this.master);
    this.mode(PANEL_MODES[1], 0.08, 0.07, t, 'sine', this.master);
  }

  // Membrane key on the console: short and soft, two partials under a lowpass.
  keyBeep() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    g.connect(this.master);
    const f = this.filter('lowpass', 3200);
    f.connect(g);
    for (const [freq, level] of [[2093, 1], [3136, 0.35]]) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const og = c.createGain();
      og.gain.value = level;
      osc.connect(og);
      og.connect(f);
      osc.start(t);
      osc.stop(t + 0.1);
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
      const f = this.filter('lowpass', 2600);
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
