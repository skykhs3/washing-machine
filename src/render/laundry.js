import { compileDesign, drawGarment, hexToRgb, shadeRgb } from './garment.js';

export class LaundryLayer {
  constructor() {
    this.designs = new Map();
  }

  // Marks are compiled against the template, so one compile per design serves
  // every piece wearing it.
  design(tpl, idx) {
    const key = `${tpl.type}:${idx}`;
    let entry = this.designs.get(key);
    if (!entry) {
      const design = tpl.designs[idx];
      entry = { base: hexToRgb(design.base), groups: compileDesign(tpl, design) };
      this.designs.set(key, entry);
    }
    return entry;
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

  draw(ctx, world, low) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const b of world.bodies) {
      const tpl = b.tpl;
      const { base, groups } = this.design(tpl, b.designIdx % tpl.designs.length);
      const wet = b.wet;
      const fill = shadeRgb(base, 0.32 * wet);
      const edge = shadeRgb(base, 0.42 + 0.2 * wet);
      // Both trims are proportional to the piece, so a sock does not get the
      // heavy outline a full size garment carries.
      const rp = tpl.radius;
      const sp = tpl.spacing;

      ctx.save();
      if (b.alpha < 1) ctx.globalAlpha = Math.max(0, b.alpha);
      this.outlinePath(ctx, world, b);
      ctx.lineWidth = 2 * rp + 0.22 * sp;
      ctx.strokeStyle = edge;
      ctx.stroke();
      ctx.lineWidth = 2 * rp - 0.04 * sp;
      ctx.strokeStyle = fill;
      ctx.fillStyle = fill;
      ctx.stroke();
      ctx.fill();

      ctx.clip();
      drawGarment(ctx, world, b, groups, wet, low);
      ctx.restore();
    }
  }
}
