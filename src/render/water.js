const TWO_PI = Math.PI * 2;
const SEGMENTS = 14;
const RING_SEGMENTS = 48;
const HALF_SPAN = 1.3;
// The drum clips at radius 1. The arc itself ends on the wall, so its two end
// points are pushed out to here and the fill closes round the back at the same
// radius, which keeps the seam outside the clip.
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

  // A wave cannot stand taller than the water is deep, so on a thin film - the
  // ring the water closes into at speed - the ripple comes down with it rather
  // than doubling the film's drawn thickness.
  waveAmp(water) {
    const amp = 0.008 + 0.018 * Math.min(1, Math.abs(water.swirl) / 2.5);
    return Math.min(amp, 0.3 * water.waterDepth);
  }

  // Half the angle, about the equipotential centre, that the surface subtends
  // inside the drum. Pi once the water has closed into a ring and the arc no
  // longer reaches the wall at all.
  wallSpan(water) {
    const { yc, rhoS } = water;
    const c = (1 - rhoS * rhoS - yc * yc) / (2 * rhoS * yc);
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
    const span = ringed ? Math.PI : this.wallSpan(water);
    // The spline runs through the midpoints between samples, which sit a
    // sagitta inside the true circle. On a thin ring that bias is a good
    // fraction of the film, so the radius is pushed back out by it.
    const comp = ringed ? 1 / Math.cos(span / n) : 1;
    const at = (i) => {
      // The ends of an open arc land on the wall, so the ripple is tapered out
      // there rather than left to lift them off it, and they are then pushed
      // out past the clip so the fill has something to close against.
      const u = i / n;
      const th = -span + u * 2 * span;
      const taper = ringed ? 1 : Math.sin(Math.PI * u);
      const rho = (rhoS + this.ripple(rhoS * th, time, amp, swirl) * taper) * comp;
      let x = rho * Math.sin(th);
      let y = yc + rho * Math.cos(th);
      if (!ringed && (i === 0 || i === n)) {
        const r = Math.sqrt(x * x + y * y) || 1e-6;
        x *= OUTER / r;
        y *= OUTER / r;
      }
      return [x, y];
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
    // The arc runs left to right along the surface, so the fill comes back
    // round the far side of the drum. Sweeping towards increasing angle from
    // the right end always passes through the bottom, which is the side the
    // water is on: the equipotential centre sits above the drum centre.
    const span = this.wallSpan(water);
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
