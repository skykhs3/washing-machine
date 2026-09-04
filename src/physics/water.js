// A free surface settles on an equipotential of the field it sits in. In a
// horizontal-axis drum that field is gravity plus the centrifugal term, so with
// y down and the drum radius 1 the potential is
//
//   phi = -g y - w^2 (x^2 + y^2) / 2
//
// whose level sets rearrange to x^2 + (y + g/w^2)^2 = const: circles about
// (0, -g/w^2), the one point where the two fields cancel. The surface is a
// circular arc, then, not a plane and not the paraboloid a vertical axis would
// give. Standing still that centre runs off above the drum and the arc flattens
// into a level line; at speed it closes on the drum axis and the water becomes
// a ring with a hole down the middle.
//
// Water takes the far side of the arc, rho >= rhoS, because the potential falls
// as rho grows. Spinning up neither creates nor destroys water, so rhoS is
// solved from the area the level covers standing still instead of being carried
// around as a height.

// Centre distance past which the arc sags less than 0.01 of the drum radius
// across its whole span. Beyond it the level line is the surface, which also
// keeps the two-circle area out of the range where g/w^2 overflows.
const FLAT_D = 50;

// Froude numbers between which the water goes from falling off the top of the
// drum to being carried all the way round with it. Below the first, gravity
// still wins at the top and there is nothing to average; above the second the
// water turns with the wall.
const FR_CARRY_LO = 1;
const FR_CARRY_HI = 3;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Area of the unit disk below the level line y = h.
function capArea(h) {
  if (h <= -1) return Math.PI;
  if (h >= 1) return 0;
  return Math.acos(h) - h * Math.sqrt(1 - h * h);
}

// Area the unit disk at the origin shares with a disk of radius r centred d
// away. Rises monotonically with r, which is what lets rhoS be bisected.
function lensArea(d, r) {
  if (r <= 0) return 0;
  if (d + r <= 1) return Math.PI * r * r;
  if (d + 1 <= r) return Math.PI;
  if (d >= 1 + r) return 0;
  const a = (d * d + 1 - r * r) / (2 * d);
  const b = (d * d + r * r - 1) / (2 * d * r);
  const tri = (-d + r + 1) * (d + r - 1) * (d - r + 1) * (d + r + 1);
  return Math.acos(clamp(a, -1, 1)) + r * r * Math.acos(clamp(b, -1, 1)) - 0.5 * Math.sqrt(Math.max(0, tri));
}

export class Water {
  constructor(cfg, gravity) {
    this.cfg = cfg;
    this.gravity = gravity;
    this.level = 0;
    this.target = 0;
    this.tilt = 0;
    this.swirl = 0;
    // Surface geometry, resolved by setSurface.
    this.flat = true;
    this.yc = 0;
    this.rhoS = 0;
    // How much of the water the wall has taken up and is carrying round, 0 to 1.
    this.carried = 0;
    this.solvedLevel = -1;
    this.solvedOmega = NaN;
    this.setSurface(0);
  }

  get active() {
    return this.level > 0.002;
  }

  // The surface standing still: the height the level fills to with the drum
  // stopped, and the reference the curved surface conserves area against.
  get levelY() {
    return 1 - 2 * this.level;
  }

  // How deep the air pocket runs from the surface, measured along the local
  // vertical. Flat, that is the gap between the surface and the top of the
  // drum; curved, it is the room left inside the arc.
  get airDepth() {
    if (this.flat) return this.levelY + 1;
    return Math.max(0, this.rhoS - Math.max(0, -this.yc - 1));
  }

  // Half the angle, about the equipotential centre, that the surface subtends
  // inside the drum. Rays outside it miss the water altogether, which matters
  // once the centre sits outside the drum and only a narrow cone reaches in.
  get surfaceSpan() {
    if (this.flat || this.ringed) return Math.PI;
    const c = (1 - this.rhoS * this.rhoS - this.yc * this.yc) / (2 * this.rhoS * this.yc);
    return c >= 1 ? 0 : c <= -1 ? Math.PI : Math.acos(c);
  }

  // How far the surface runs across the drum. A head is a band along it, so
  // this is what limits how much foam the head can hold.
  get surfaceLength() {
    if (this.flat) {
      const h = this.levelY;
      return 2 * Math.sqrt(Math.max(0, 1 - h * h));
    }
    return 2 * this.rhoS * this.surfaceSpan;
  }

  // How deep the water runs the other way, from the surface out to the
  // furthest point of the drum from the equipotential centre.
  get waterDepth() {
    if (this.flat) return 1 - this.levelY;
    return Math.max(0, -this.yc + 1 - this.rhoS);
  }

  // Signed distance from the surface along the local vertical: positive under
  // water, negative in the air above it.
  depthAt(x, y) {
    if (this.flat) return y - this.levelY;
    const dy = y - this.yc;
    return Math.sqrt(x * x + dy * dy) - this.rhoS;
  }

  // Factor that slides (x, y - yc) along the local vertical until it sits
  // `depth` under the surface. Curved only; flat callers set y directly.
  depthScale(x, y, depth) {
    const rho = Math.hypot(x, y - this.yc);
    return (this.rhoS + depth) / (rho || 1e-6);
  }

  // True once the arc closes into a full circle inside the drum, so the water
  // is a ring rather than a pool with a surface running wall to wall.
  get ringed() {
    return !this.flat && -this.yc + this.rhoS <= 1;
  }

  setSurface(omega) {
    const w2 = omega * omega;
    this.carried = smoothstep(FR_CARRY_LO, FR_CARRY_HI, w2 / this.gravity);
    if (this.level <= 0) {
      this.flat = true;
      this.yc = -Infinity;
      this.rhoS = Infinity;
      return;
    }
    const water = capArea(this.levelY);
    // The drum axis is horizontal, so once the wall carries the water round,
    // gravity in the drum's own frame turns once per revolution. A film held on
    // by the centrifugal field then varies in thickness by only h/Fr about its
    // mean, which is the same picture as an equipotential centre sitting h
    // times as far off the axis instead of the full g/w^2. Without this a film
    // at speed pools into a crescent and leaves the top of the wall dry, where
    // a real one wraps the whole of it.
    const depth = 1 - Math.sqrt(Math.max(0, 1 - water / Math.PI));
    const keep = 1 - (1 - depth) * this.carried;
    const d = w2 > 0 ? (this.gravity / w2) * keep : Infinity;
    if (d >= FLAT_D) {
      this.flat = true;
      this.yc = -d;
      this.rhoS = Infinity;
      return;
    }
    if (this.level === this.solvedLevel && omega === this.solvedOmega) return;
    this.solvedLevel = this.level;
    this.solvedOmega = omega;
    this.flat = false;
    this.yc = -d;
    const air = Math.PI - water;
    let lo = Math.max(0, d - 1);
    let hi = d + 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) * 0.5;
      if (lensArea(d, mid) < air) lo = mid;
      else hi = mid;
    }
    this.rhoS = (lo + hi) * 0.5;
  }

  update(dt, omega, manual = false) {
    const c = this.cfg;
    const d = this.target - this.level;
    const rate = (d > 0
      ? (manual ? c.manualFillRate : c.fillRate)
      : (manual ? c.manualDrainRate : c.drainRate)) * dt;
    this.level += d > rate ? rate : d < -rate ? -rate : d;
    this.setSurface(omega);

    // Water carried round with the wall does not slosh against it, and a
    // surface closing on the drum axis has no direction left to tilt, so the
    // lag that leans a level surface fades out with the same factor.
    const lean = 1 - this.carried;
    const tiltT = Math.max(-c.tiltMax, Math.min(c.tiltMax, c.tiltGain * omega)) * lean;
    this.tilt += (tiltT - this.tilt) * (1 - Math.exp(-dt / c.tiltTau));
    const swirlT = c.swirlRatio * omega * Math.min(1, this.level / 0.15);
    this.swirl += (swirlT - this.swirl) * (1 - Math.exp(-dt / c.swirlTau));
  }
}
