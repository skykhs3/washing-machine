const TWO_PI = Math.PI * 2;

export class Foam {
  constructor(max) {
    this.max = max;
    this.items = [];
    this.acc = 0;
    this.still = false;
  }

  update(dt, water, intensity, time) {
    const items = this.items;
    const active = water.active && intensity > 0;
    const ys = water.surfaceY;
    const half = Math.sqrt(Math.max(0, 1 - ys * ys));

    if (active) {
      this.acc += intensity * 14 * dt;
      while (this.acc >= 1 && items.length < this.max) {
        this.acc -= 1;
        const rising = Math.random() < 0.3 && water.level > 0.12;
        const r = 0.014 + Math.random() * 0.03;
        const x = (Math.random() * 2 - 1) * Math.max(0, half - r - 0.03);
        const y = rising ? ys + Math.random() * (Math.sqrt(Math.max(0, 1 - x * x)) - ys) * 0.8 : ys - Math.random() * 0.04;
        items.push({ x, y, r, age: 0, ttl: 2 + Math.random() * 4, rising, phase: Math.random() * TWO_PI });
      }
      if (this.acc > 1) this.acc = 1;
    }

    const drift = water.swirl * 0.12;
    for (let i = items.length - 1; i >= 0; i--) {
      const b = items[i];
      b.age += dt;
      if (b.rising) {
        b.y -= 0.22 * dt;
        if (b.y <= ys - b.r * 0.3) b.rising = false;
      } else {
        b.y += (ys - b.r * 0.35 - b.y) * Math.min(1, dt * 4);
      }
      const wobble = this.still ? 0 : Math.sin(time * 3 + b.phase) * 0.04;
      b.x += (drift + wobble) * dt;
      const limit = Math.sqrt(Math.max(0, 1 - b.y * b.y)) - b.r - 0.01;
      if (b.x > limit) b.x = limit;
      else if (b.x < -limit) b.x = -limit;
      const dying = !active || b.age > b.ttl;
      if (dying) b.fade = (b.fade ?? 1) - dt * 2;
      if ((b.fade ?? 1) <= 0) items.splice(i, 1);
    }
  }
}

export class FoamLayer {
  constructor(pal) {
    this.rgb = pal.foam;
  }

  draw(ctx, foam, water) {
    const items = foam.items;
    if (!items.length || !water.active) return;
    ctx.save();
    ctx.rotate(water.tilt);
    for (const b of items) {
      const a = 0.5 * (b.fade ?? 1) * Math.min(1, b.age * 3);
      ctx.fillStyle = `rgba(${this.rgb},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = `rgba(${this.rgb},${(a * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.28, 0, TWO_PI);
      ctx.fill();
    }
    ctx.restore();
  }
}
