const SEGMENTS = 12;
const HALF_SPAN = 1.3;

export class WaterLayer {
  constructor(pal) {
    this.rgb = pal.water;
  }

  waveAt(x, ys, time, amp, swirl) {
    const ph = time * 2.4 + swirl * 0.6;
    return ys + amp * Math.sin(5.5 * x + ph) + amp * 0.45 * Math.sin(11 * x - 1.7 * ph);
  }

  surfacePath(ctx, water, time, closed) {
    const ys = water.surfaceY;
    const amp = 0.026 * water.ripple;
    const step = (2 * HALF_SPAN) / SEGMENTS;
    let x0 = -HALF_SPAN;
    let y0 = this.waveAt(x0, ys, time, amp, water.swirl);
    let x1 = x0 + step;
    let y1 = this.waveAt(x1, ys, time, amp, water.swirl);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo((x0 + x1) / 2, (y0 + y1) / 2);
    for (let i = 1; i < SEGMENTS; i++) {
      const x2 = x1 + step;
      const y2 = this.waveAt(x2, ys, time, amp, water.swirl);
      ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      x1 = x2;
      y1 = y2;
    }
    ctx.lineTo(x1, y1);
    if (closed) {
      ctx.lineTo(HALF_SPAN, 1.6);
      ctx.lineTo(-HALF_SPAN, 1.6);
      ctx.closePath();
    }
  }

  drawBack(ctx, water, time, foamIntensity = 0) {
    if (!water.active) return;
    const ys = water.surfaceY;
    ctx.save();
    ctx.rotate(water.tilt);
    this.surfacePath(ctx, water, time, true);
    const g = ctx.createLinearGradient(0, ys, 0, 1);
    g.addColorStop(0, `rgba(${this.rgb},0.34)`);
    g.addColorStop(1, `rgba(${this.rgb},0.58)`);
    ctx.fillStyle = g;
    ctx.fill();

    this.surfacePath(ctx, water, time, false);
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
    this.surfacePath(ctx, water, time, true);
    ctx.fillStyle = `rgba(${this.rgb},0.17)`;
    ctx.fill();
    ctx.restore();
  }
}
