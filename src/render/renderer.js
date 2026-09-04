import { BodyLayer } from './body.js';
import { GlassLayer } from './glass.js';
import { DrumBackLayer } from './drumBack.js';
import { LifterLayer } from './lifters.js';
import { WaterLayer } from './water.js';
import { LaundryLayer } from './laundry.js';
import { FoamLayer } from './foam.js';
import { DoorHandleLayer } from './doorHandle.js';
import { Hud, hudRect } from './hud.js';
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
    this.laundry = new LaundryLayer();
    this.foam = new FoamLayer(pal);
    this.handle = new DoorHandleLayer(pal);
    this.hud = new Hud(pal);
    this.gen = -1;
  }

  // Tap targets on the canvas. The console and the door grip both answer, but
  // neither changes any state: they only make the machine feel physical.
  hitHud(px) {
    const r = hudRect(this.vp);
    return px.x >= r.x && px.x <= r.x + r.w && px.y >= r.y && px.y <= r.y + r.h;
  }

  hitHandle(drum) {
    return this.handle.hit(drum);
  }

  clickHandle() {
    this.handle.click();
  }

  draw(state) {
    const vp = this.vp;
    const ctx = vp.ctx;
    if (vp.generation !== this.gen) {
      this.gen = vp.generation;
      this.body.rebuild(vp);
      this.glass.rebuild(vp);
      this.drumBack.rebuild(vp);
      this.hud.invalidate();
    }
    const { drum, world, water, foam, time, frameDt } = state;
    const dTheta = drum.omega * frameDt;

    vp.pixelTransform(ctx);
    this.body.draw(ctx, vp);

    ctx.save();
    vp.drumTransform(ctx);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TWO_PI);
    ctx.clip();
    this.drumBack.draw(ctx, drum.theta, dTheta);
    this.water.drawBack(ctx, water, time, foam.volume);
    this.laundry.draw(ctx, world);
    this.foam.drawBulk(ctx, foam, water);
    this.water.drawFront(ctx, water, time);
    this.lifters.draw(ctx, drum.theta, dTheta);
    this.foam.drawRaft(ctx, foam, water, this.water, time);
    ctx.restore();

    vp.pixelTransform(ctx);
    this.glass.draw(ctx, vp);

    // The latch, the blur and the simulation run off one clock now that a
    // pause stops the drum instead of the frame.
    this.handle.update(frameDt);
    vp.drumTransform(ctx);
    this.handle.draw(ctx);

    vp.pixelTransform(ctx);
    this.hud.draw(ctx, vp, state.hud);
    if (state.debug) drawDebug(ctx, vp, state);
  }
}
