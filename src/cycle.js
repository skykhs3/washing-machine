export class Cycle {
  constructor(cfg, timeToLevel) {
    this.stages = cfg.stages;
    this.idx = 0;
    this.t = 0;
    this.phaseCount = this.stages.reduce((m, s) => Math.max(m, s.phase + 1), 0);
    this.timeToLevel = timeToLevel;
    // Nominal transfer time for each stage: how long the inlet or the pump
    // needs to take the drum from what the stage before leaves behind to this
    // stage's level. Zero for every stage that holds its level, which is why
    // nothing here needs a flag for "this one moves water". Capped at the
    // stage's own length, so a course tuned with a stage shorter than its own
    // transfer cannot let the program run ahead of the plumbing.
    this.xfer = this.stages.map((s, i) => Math.min(s.duration, timeToLevel(this.levelBefore(i), s.level)));
  }

  levelBefore(i) {
    const n = this.stages.length;
    return this.stages[(i - 1 + n) % n].level;
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

  update(dt, level) {
    this.t += dt;
    // A fill is over when the water is there, not when the clock says so, so a
    // stage that moves water reads its elapsed time off what is left to move:
    // the nominal transfer less the time the water still needs. A drum filled
    // by hand in MANUAL reaches the fill stage already at level and starts at
    // the far end of the transfer, with only the stage's own few seconds left
    // to wait out, the same few a fill that ran its course ends on. The clock
    // is never wound back, so this can only shorten a wait, and it cannot
    // outrun the water: what is left is always those seconds plus the time the
    // water needs, whichever way it has to move. A stage running at its own
    // pace sits exactly on this, so a course nobody has touched keeps its own
    // timings. A level that is not a number leaves the comparison false and the
    // clock standing.
    const at = this.xfer[this.idx] - this.timeToLevel(level, this.stage.level);
    if (at > this.t) this.t = at;
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

  // The level the stage before this one leaves behind, which is what the drum
  // holds as this stage starts.
  entryLevel() {
    return this.levelBefore(this.idx);
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
