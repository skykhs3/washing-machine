import { BodyLayer } from './body.js';
import { GlassLayer } from './glass.js';
import { DrumBackLayer } from './drumBack.js';
import { LifterLayer } from './lifters.js';
import { WaterLayer } from './water.js';
import { LaundryLayer } from './laundry.js';
import { drawDebug } from './debug.js';

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
    this.water = new WaterLayer(pal);
    this.laundry = new LaundryLayer(cfg.physics);
    this.gen = -1;
  }

  draw(state) {
    const vp = this.vp;
    const ctx = vp.ctx;
    if (vp.generation !== this.gen) {
      this.gen = vp.generation;
      this.body.rebuild(vp);
      this.glass.rebuild(vp);
      this.drumBack.rebuild(vp);
    }
    const { drum, world, water, time, frameDt } = state;
    const dTheta = drum.omega * frameDt;

    vp.pixelTransform(ctx);
    this.body.draw(ctx, vp);

    ctx.save();
    vp.drumTransform(ctx);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TWO_PI);
    ctx.clip();
    this.drumBack.draw(ctx, drum.theta, dTheta, false);
    this.water.drawBack(ctx, water, time);
    this.laundry.draw(ctx, world, vp, true);
    this.water.drawFront(ctx, water, time);
    this.lifters.draw(ctx, drum.theta, dTheta, false);
    ctx.restore();

    vp.pixelTransform(ctx);
    this.glass.draw(ctx, vp);
    if (state.debug) drawDebug(ctx, vp, state);
  }
}
