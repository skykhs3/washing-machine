const TWO_PI = Math.PI * 2;
const COUNT = 3;

export class LifterLayer {
  constructor(pal) {
    this.pal = pal;
    this.path = new Path2D();
    const p = this.path;
    p.moveTo(1.02, -0.08);
    p.lineTo(0.905, -0.052);
    p.quadraticCurveTo(0.842, -0.052, 0.842, 0);
    p.quadraticCurveTo(0.842, 0.052, 0.905, 0.052);
    p.lineTo(1.02, 0.08);
    p.closePath();
    this.grad = null;
  }

  gradient(ctx) {
    if (!this.grad) {
      const g = ctx.createLinearGradient(0, -0.08, 0, 0.08);
      g.addColorStop(0, this.pal.lifterDark);
      g.addColorStop(0.45, this.pal.lifter);
      g.addColorStop(0.6, this.pal.lifter);
      g.addColorStop(1, this.pal.lifterDark);
      this.grad = g;
    }
    return this.grad;
  }

  drawSet(ctx, angle) {
    ctx.save();
    ctx.rotate(angle);
    for (let k = 0; k < COUNT; k++) {
      ctx.save();
      ctx.rotate((k * TWO_PI) / COUNT);
      ctx.fillStyle = this.gradient(ctx);
      ctx.fill(this.path);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.008;
      ctx.stroke(this.path);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.moveTo(0.87, 0);
      ctx.lineTo(1.0, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  draw(ctx, theta, dTheta, low) {
    const ad = Math.abs(dTheta);
    const ringStart = 0.4;
    const ringFull = 0.7;
    if (ad < ringFull) {
      const n = ad < 0.06 ? 1 : low ? 2 : Math.min(6, Math.ceil(ad / 0.07));
      ctx.save();
      ctx.globalAlpha = 1 / n;
      for (let s = 0; s < n; s++) {
        this.drawSet(ctx, theta - dTheta * (s / n));
      }
      ctx.restore();
    }
    if (ad > ringStart) {
      const f = Math.min(1, (ad - ringStart) / (ringFull - ringStart));
      ctx.save();
      ctx.globalAlpha = 0.22 * f;
      ctx.fillStyle = this.pal.lifter;
      ctx.beginPath();
      ctx.arc(0, 0, 1.0, 0, TWO_PI);
      ctx.arc(0, 0, 0.845, TWO_PI, 0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
