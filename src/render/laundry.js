const TILE = 16;

export class LaundryLayer {
  constructor(phys) {
    this.rp = phys.particleRadius;
    this.patterns = new Map();
    this.rgbCache = new Map();
  }

  rgb(hex) {
    let v = this.rgbCache.get(hex);
    if (!v) {
      const n = parseInt(hex.slice(1), 16);
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      this.rgbCache.set(hex, v);
    }
    return v;
  }

  shade(hex, k) {
    const [r, g, b] = this.rgb(hex);
    const m = 1 - k;
    return `rgb(${(r * m) | 0},${(g * m) | 0},${(b * m) | 0})`;
  }

  isLight(hex) {
    const [r, g, b] = this.rgb(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150;
  }

  pattern(ctx, kind, light) {
    const key = kind + (light ? 'L' : 'D');
    let p = this.patterns.get(key);
    if (p) return p;
    const c = document.createElement('canvas');
    c.width = TILE;
    c.height = TILE;
    const g = c.getContext('2d');
    const ink = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.75)';
    g.fillStyle = ink;
    g.strokeStyle = ink;
    switch (kind) {
      case 'stripes':
        g.fillRect(0, 1, TILE, 3);
        g.fillRect(0, 9, TILE, 3);
        break;
      case 'dots':
        g.beginPath();
        g.arc(4, 4, 2, 0, Math.PI * 2);
        g.arc(12, 12, 2, 0, Math.PI * 2);
        g.fill();
        break;
      case 'waffle':
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(0, 4.5);
        g.lineTo(TILE, 4.5);
        g.moveTo(0, 12.5);
        g.lineTo(TILE, 12.5);
        g.moveTo(4.5, 0);
        g.lineTo(4.5, TILE);
        g.moveTo(12.5, 0);
        g.lineTo(12.5, TILE);
        g.stroke();
        break;
      default:
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(-2, TILE + 2);
        g.lineTo(TILE + 2, -2);
        g.moveTo(-2, 10);
        g.lineTo(10, -2);
        g.moveTo(6, TILE + 2);
        g.lineTo(TILE + 2, 6);
        g.stroke();
    }
    p = ctx.createPattern(c, 'repeat');
    this.patterns.set(key, p);
    return p;
  }

  outlinePath(ctx, world, b) {
    const { px, py } = world;
    const o = b.tpl.outline;
    const n = o.length;
    const s = b.start;
    const i0 = s + o[0];
    const i1 = s + o[1 % n];
    ctx.beginPath();
    ctx.moveTo((px[i0] + px[i1]) / 2, (py[i0] + py[i1]) / 2);
    for (let i = 1; i <= n; i++) {
      const cur = s + o[i % n];
      const nxt = s + o[(i + 1) % n];
      ctx.quadraticCurveTo(px[cur], py[cur], (px[cur] + px[nxt]) / 2, (py[cur] + py[nxt]) / 2);
    }
    ctx.closePath();
  }

  draw(ctx, world, vp, usePatterns) {
    const { px, py } = world;
    const rp = this.rp;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const b of world.bodies) {
      const tpl = b.tpl;
      const base = tpl.colors[b.colorIdx % tpl.colors.length];
      const fill = base;
      const edge = this.shade(base, 0.42);

      ctx.save();
      if (b.alpha < 1) ctx.globalAlpha = Math.max(0, b.alpha);
      this.outlinePath(ctx, world, b);
      ctx.lineWidth = 2 * rp + 0.022;
      ctx.strokeStyle = edge;
      ctx.stroke();
      ctx.lineWidth = 2 * rp - 0.004;
      ctx.strokeStyle = fill;
      ctx.fillStyle = fill;
      ctx.stroke();
      ctx.fill();

      if (usePatterns) {
        const a = b.start + tpl.refA;
        const c = b.start + tpl.refB;
        const ang = Math.atan2(py[c] - py[a], px[c] - px[a]) - tpl.restAngle;
        const mx = (px[a] + px[c]) / 2;
        const my = (py[a] + py[c]) / 2;
        ctx.clip();
        vp.pixelTransform(ctx);
        ctx.translate(vp.cx + mx * vp.R, vp.cy + my * vp.R);
        ctx.rotate(ang);
        ctx.globalAlpha *= 0.32;
        ctx.fillStyle = this.pattern(ctx, tpl.pattern, this.isLight(base));
        const ext = tpl.extent * vp.R * 2.2;
        ctx.fillRect(-ext, -ext, ext * 2, ext * 2);
      }
      ctx.restore();
    }
  }
}
