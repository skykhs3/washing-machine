export class Cycle {
  constructor(cfg) {
    this.stages = cfg.stages;
    this.idx = 0;
    this.t = 0;
    this.phaseCount = this.stages.reduce((m, s) => Math.max(m, s.phase + 1), 0);
  }

  get phase() {
    return this.stage.phase;
  }

  // Time left until the course ends (the idle "done" stage is not counted).
  get totalRemaining() {
    if (this.stage.id === 'done') return 0;
    let total = this.remaining;
    for (let i = this.idx + 1; i < this.stages.length; i++) {
      if (this.stages[i].id === 'done') break;
      total += this.stages[i].duration;
    }
    return total;
  }

  get stage() {
    return this.stages[this.idx];
  }

  get remaining() {
    return Math.max(0, this.stage.duration - this.t);
  }

  get progress() {
    return Math.min(1, this.t / this.stage.duration);
  }

  update(dt) {
    this.t += dt;
    while (this.t >= this.stage.duration) {
      this.t -= this.stage.duration;
      this.idx = (this.idx + 1) % this.stages.length;
    }
  }

  step(dir) {
    const n = this.stages.length;
    this.idx = (this.idx + dir + n) % n;
    this.t = 0;
  }

  targetRpm() {
    const s = this.stage;
    if (s.pattern) {
      let period = 0;
      for (const [, d] of s.pattern) period += d;
      let tt = this.t % period;
      for (const [dir, d] of s.pattern) {
        if (tt < d) return s.rpm * dir;
        tt -= d;
      }
      return 0;
    }
    if (s.profile) {
      let tt = this.t;
      for (const [rpm, d] of s.profile) {
        if (tt < d) return rpm;
        tt -= d;
      }
      return 0;
    }
    return s.rpm;
  }

  targetLevel() {
    return this.stage.level;
  }

  // Detergent concentration in the drum, not a foam amount.
  surfactant() {
    return this.stage.surfactant ?? 0;
  }

  accelFor(currentRpm, motorCfg) {
    if (this.stage.spin) {
      return Math.abs(this.targetRpm()) > Math.abs(currentRpm) ? motorCfg.accelSpinUp : motorCfg.accelSpinDown;
    }
    return motorCfg.accelWash;
  }
}
