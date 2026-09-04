export class Water {
  constructor(cfg) {
    this.cfg = cfg;
    this.level = 0;
    this.target = 0;
    this.tilt = 0;
    this.swirl = 0;
  }

  get active() {
    return this.level > 0.002;
  }

  // Surface height in drum units (y-down, drum radius 1).
  get surfaceY() {
    return 1 - 2 * this.level;
  }

  update(dt, omega, manual = false) {
    const c = this.cfg;
    const d = this.target - this.level;
    const rate = (d > 0
      ? (manual ? c.manualFillRate : c.fillRate)
      : (manual ? c.manualDrainRate : c.drainRate)) * dt;
    this.level += d > rate ? rate : d < -rate ? -rate : d;

    const tiltT = Math.max(-c.tiltMax, Math.min(c.tiltMax, c.tiltGain * omega));
    this.tilt += (tiltT - this.tilt) * (1 - Math.exp(-dt / c.tiltTau));
    const swirlT = c.swirlRatio * omega * Math.min(1, this.level / 0.15);
    this.swirl += (swirlT - this.swirl) * (1 - Math.exp(-dt / c.swirlTau));
  }
}
