export class Water {
  constructor(cfg) {
    this.cfg = cfg;
    this.level = 0;
    this.target = 0;
    this.tilt = 0;
    this.swirl = 0;
    // How disturbed the free surface is, 0 flat to 1 choppy.
    this.ripple = 0;
  }

  // A body dropping through the surface throws up a ring of waves.
  splash(strength) {
    this.ripple = Math.min(1, this.ripple + strength * this.cfg.splashRipple);
  }

  get active() {
    return this.level > 0.002;
  }

  // Surface height in drum units (y-down, drum radius 1).
  get surfaceY() {
    return 1 - 2 * this.level;
  }

  update(dt, omega, agitation = 0) {
    const c = this.cfg;
    const d = this.target - this.level;
    const rate = (d > 0 ? c.fillRate : c.drainRate) * dt;
    this.level += d > rate ? rate : d < -rate ? -rate : d;
    // Only something moving the water ripples it: the drum dragging it round,
    // the fill jet, the pump pulling the level down, and laundry moving
    // through it. Left alone it settles flat. Waves build faster than they
    // die away.
    const flow = d > 0 ? c.fillRipple : d < 0 ? c.drainRipple : 0;
    const drive = Math.min(1, Math.max(Math.abs(this.swirl) / c.swirlRippleRef, agitation / c.agitationRippleRef, flow));
    const rippleTau = drive > this.ripple ? c.rippleRise : c.rippleDecay;
    this.ripple += (drive - this.ripple) * (1 - Math.exp(-dt / rippleTau));

    const tiltT = Math.max(-c.tiltMax, Math.min(c.tiltMax, c.tiltGain * omega));
    this.tilt += (tiltT - this.tilt) * (1 - Math.exp(-dt / c.tiltTau));
    const swirlT = c.swirlRatio * omega * Math.min(1, this.level / 0.15);
    this.swirl += (swirlT - this.swirl) * (1 - Math.exp(-dt / c.swirlTau));
  }
}
