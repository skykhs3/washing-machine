import { UI_FONT } from './font.js';

const TWO_PI = Math.PI * 2;

export function drawDebug(ctx, vp, state) {
  const { world, drum, stats } = state;
  ctx.save();
  vp.drumTransform(ctx);
  ctx.lineWidth = 0.004;
  ctx.strokeStyle = 'rgba(255,255,0,0.5)';
  ctx.beginPath();
  for (let c = 0; c < world.ccount; c++) {
    const a = world.cA[c];
    const b = world.cB[c];
    ctx.moveTo(world.px[a], world.py[a]);
    ctx.lineTo(world.px[b], world.py[b]);
  }
  ctx.stroke();
  for (let i = 0; i < world.count; i++) {
    ctx.fillStyle = world.flag[i] === 1 ? 'rgba(255,80,80,0.8)' : world.flag[i] === 2 ? 'rgba(80,200,255,0.8)' : 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(world.px[i], world.py[i], world.radius[i], 0, TWO_PI);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,255,120,0.7)';
  ctx.lineWidth = 0.006;
  for (let k = 0; k < drum.lifterCount; k++) {
    ctx.save();
    ctx.rotate(drum.theta + (k * TWO_PI) / drum.lifterCount);
    ctx.beginPath();
    ctx.moveTo(drum.inner, -drum.rc);
    ctx.lineTo(drum.outer, -drum.rc);
    ctx.arc(drum.outer, 0, drum.rc, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(drum.inner, drum.rc);
    ctx.arc(drum.inner, 0, drum.rc, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();
    ctx.restore();
  }
  vp.pixelTransform(ctx);
  ctx.font = `12px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textBaseline = 'top';
  const lines = [
    `fps ${stats.fps.toFixed(0)}  frame ${stats.frameMs.toFixed(1)}ms  physics ${stats.physMs.toFixed(2)}ms`,
    `particles ${world.count}  constraints ${world.ccount}  bodies ${world.bodies.length}`,
    `rpm ${(drum.omega * 60 / TWO_PI).toFixed(1)}  theta ${drum.theta.toFixed(2)}  substeps ${stats.substeps}`,
    `water ${state.water.level.toFixed(2)} tilt ${state.water.tilt.toFixed(2)} swirl ${state.water.swirl.toFixed(2)}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 10, vp.bandHeight + 8 + i * 15));
  ctx.restore();
}
