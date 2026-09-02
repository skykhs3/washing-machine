import { BodyLayer } from './body.js';
import { GlassLayer } from './glass.js';
import { DrumBackLayer } from './drumBack.js';
import { LifterLayer } from './lifters.js';

const TWO_PI = Math.PI * 2;

export class Renderer {
  constructor(vp, cfg) {
    this.vp = vp;
    this.cfg = cfg;
    const pal = cfg.palette;
    this.body = new BodyLayer(pal);
    this.glass = new GlassLayer(pal);
    this.drumBack = new DrumBackLayer(pal);
    this.lifters = new LifterLayer(pal);
    this.gen = -1;
  }

  draw() {
    const vp = this.vp;
    const ctx = vp.ctx;
    if (vp.generation !== this.gen) {
      this.gen = vp.generation;
      this.body.rebuild(vp);
      this.glass.rebuild(vp);
      this.drumBack.rebuild(vp);
    }

    vp.pixelTransform(ctx);
    this.body.draw(ctx, vp);

    ctx.save();
    vp.drumTransform(ctx);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TWO_PI);
    ctx.clip();
    this.drumBack.draw(ctx, 0, 0, false);
    this.lifters.draw(ctx, 0, 0, false);
    ctx.restore();

    vp.pixelTransform(ctx);
    this.glass.draw(ctx, vp);
  }
}
