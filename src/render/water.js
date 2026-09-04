const TWO_PI = Math.PI * 2;
const SEGMENTS = 14;
const RING_SEGMENTS = 30;
const HALF_SPAN = 1.3;
// The drum clips at radius 1, so the fill is traced out to here and the wall
// crops it. Stopping on the wall itself leaves a hairline seam.
const OUTER = 1.3;

export class WaterLayer {
  constructor(pal) {
    this.rgb = pal.water;
  }

  // Wave offset along the local vertical, against distance measured across the
  // surface. Positive is deeper, which is down on a level surface and outward
  // from the equipotential centre on a curved one.
  ripple(s, time, amp, swirl) {
    const ph = time * 2.4 + swirl * 0.6;
    return amp * Math.sin(5.5 * s + ph) + amp * 0.45 * Math.sin(11 * s - 1.7 * ph);
  }

  waveAmp(water) {
    return 0.008 + 0.018 * Math.min(1, Math.abs(water.swirl) / 2.5);
  }

  // Angle about the equipotential centre at which the surface crosses a circle
  // of radius R about the drum centre, or pi if it never does, which is the
  // case once the water has closed into a ring.
  spanFor(water, R) {
    const { yc, rhoS } = water;
    const c = (R * R - rhoS * rhoS - yc * yc) / (2 * rhoS * yc);
    if (c >= 1) return 0;
    if (c <= -1) return Math.PI;
    return Math.acos(c);
  }

  // Lays the surface into the current path: a level line while the drum is
  // slow, an arc about the equipotential centre once it is not.
  trace(ctx, water, time) {
    const amp = this.waveAmp(water);
    const swirl = water.swirl;
    ctx.beginPath();
    if (water.flat) {
      const ys = water.levelY;
      const step = (2 * HALF_SPAN) / SEGMENTS;
      const at = (i) => {
        const x = -HALF_SPAN + i * step;
        return [x, ys + this.ripple(x, time, amp, swirl)];
      };
      this.smooth(ctx, at, SEGMENTS);
      return;
    }
    const { yc, rhoS, ringed } = water;
    const n = ringed ? RING_SEGMENTS : SEGMENTS;
    const span = ringed ? Math.PI : this.spanFor(water, OUTER);
    const at = (i) => {
      // The ends of an open arc are cropped by the wall, so the ripple is
      // tapered out there rather than left to lift them off it.
      const u = i / n;
      const th = -span + u * 2 * span;
      const taper = ringed ? 1 : Math.sin(Math.PI * u);
      const rho = rhoS + this.ripple(rhoS * th, time, amp, swirl) * taper;
      return [rho * Math.sin(th), yc + rho * Math.cos(th)];
    };
    this.smooth(ctx, at, n);
    if (ringed) ctx.closePath();
  }

  // Quadratic through the sample midpoints, so the surface reads as a curve
  // rather than a fan of straight segments.
  smooth(ctx, at, n) {
    let [x0, y0] = at(0);
    let [x1, y1] = at(1);
    ctx.moveTo(x0, y0);
    ctx.lineTo((x0 + x1) / 2, (y0 + y1) / 2);
    for (let i = 1; i < n; i++) {
      const [x2, y2] = at(i + 1);
      ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      x1 = x2;
      y1 = y2;
    }
    ctx.lineTo(x1, y1);
  }

  // The water itself. An open surface closes round the bottom of the drum; a
  // ring is the drum with the surface punched out of it, which is what
  // even-odd is for.
  regionPath(ctx, water, time) {
    this.trace(ctx, water, time);
    if (water.ringed) {
      ctx.moveTo(OUTER, 0);
      ctx.arc(0, 0, OUTER, 0, TWO_PI);
      return 'evenodd';
    }
    if (water.flat) {
      ctx.lineTo(HALF_SPAN, 1.6);
      ctx.lineTo(-HALF_SPAN, 1.6);
      ctx.closePath();
      return 'nonzero';
    }
    // The arc runs left to right, so it comes back the long way under the drum.
    const span = this.spanFor(water, OUTER);
    const ex = water.rhoS * Math.sin(span);
    const ey = water.yc + water.rhoS * Math.cos(span);
    ctx.arc(0, 0, OUTER, Math.atan2(ey, ex), Math.atan2(ey, -ex));
    ctx.closePath();
    return 'nonzero';
  }

  // Kept for the foam, which strokes the surface to wet the base of its head.
  surfacePath(ctx, water, time) {
    this.trace(ctx, water, time);
  }

  fillStyleFor(ctx, water) {
    if (water.flat) {
      const g = ctx.createLinearGradient(0, water.levelY, 0, 1);
      g.addColorStop(0, `rgba(${this.rgb},0.34)`);
      g.addColorStop(1, `rgba(${this.rgb},0.58)`);
      return g;
    }
    // Concentric with the equipotentials, so the water darkens with depth the
    // same way it does on a level surface.
    const g = ctx.createRadialGradient(0, water.yc, water.rhoS, 0, water.yc, -water.yc + 1);
    g.addColorStop(0, `rgba(${this.rgb},0.34)`);
    g.addColorStop(1, `rgba(${this.rgb},0.58)`);
    return g;
  }

  drawBack(ctx, water, time, foamIntensity = 0) {
    if (!water.active) return;
    ctx.save();
    ctx.rotate(water.tilt);
    const rule = this.regionPath(ctx, water, time);
    ctx.fillStyle = this.fillStyleFor(ctx, water);
    ctx.fill(rule);

    this.trace(ctx, water, time);
    ctx.lineWidth = 0.014 + 0.02 * foamIntensity;
    ctx.strokeStyle = `rgba(255,255,255,${(0.22 + 0.3 * foamIntensity).toFixed(3)})`;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  drawFront(ctx, water, time) {
    if (!water.active) return;
    ctx.save();
    ctx.rotate(water.tilt);
    const rule = this.regionPath(ctx, water, time);
    ctx.fillStyle = `rgba(${this.rgb},0.17)`;
    ctx.fill(rule);
    ctx.restore();
  }
}
