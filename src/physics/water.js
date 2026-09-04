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

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

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

  // How far the surface runs across the drum. A head is a band along it, so
  // this is what limits how much foam the head can hold.
  get surfaceLength() {
    if (this.flat) {
      const h = this.levelY;
      return 2 * Math.sqrt(Math.max(0, 1 - h * h));
    }
    if (this.ringed) return 2 * Math.PI * this.rhoS;
    const c = (1 - this.rhoS * this.rhoS - this.yc * this.yc) / (2 * this.rhoS * this.yc);
    return 2 * this.rhoS * Math.acos(clamp(c, -1, 1));
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
    const d = w2 > 0 ? this.gravity / w2 : Infinity;
    if (d >= FLAT_D || this.level <= 0) {
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
    const air = Math.PI - capArea(this.levelY);
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

    const tiltT = Math.max(-c.tiltMax, Math.min(c.tiltMax, c.tiltGain * omega));
    this.tilt += (tiltT - this.tilt) * (1 - Math.exp(-dt / c.tiltTau));
    const swirlT = c.swirlRatio * omega * Math.min(1, this.level / 0.15);
    this.swirl += (swirlT - this.swirl) * (1 - Math.exp(-dt / c.swirlTau));
    this.setSurface(omega);
  }
}
