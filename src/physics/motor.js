const RPM_TO_RAD = (Math.PI * 2) / 60;

export class Motor {
  constructor(cfg) {
    this.cfg = cfg;
    this.omega = 0;
    this.target = 0;
    this.accel = cfg.accelWash;
    this.maxRpm = cfg.maxRpm;
  }

  setTargetRpm(rpm, accel) {
    const lim = this.maxRpm;
    const clamped = Math.max(-lim, Math.min(lim, rpm));
    this.target = clamped * RPM_TO_RAD;
    this.accel = accel;
  }

  get rpm() {
    return this.omega / RPM_TO_RAD;
  }

  get targetRpm() {
    return this.target / RPM_TO_RAD;
  }

  update(dt) {
    const d = this.target - this.omega;
    const step = this.accel * dt;
    this.omega += d > step ? step : d < -step ? -step : d;
  }
}
