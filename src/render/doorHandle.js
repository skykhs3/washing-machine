// The grip on the right of the door. It lives outside the glass cache because
// it animates: pressing it works the latch, which snaps in and springs back.
const X0 = 1.04;
const X1 = 1.235;
const HALF = 0.29;
const CENTRE = (X0 + X1) / 2;

// Padded out from the drawn pad so a finger can miss a little.
const HIT_X0 = 0.99;
const HIT_X1 = 1.3;
const HIT_HALF = 0.35;

const DOWN = 0.06;
const UP = 0.26;

export class DoorHandleLayer {
  constructor(pal) {
    this.pal = pal;
    this.t = -1;
  }

  hit(p) {
    return p.x >= HIT_X0 && p.x <= HIT_X1 && Math.abs(p.y) <= HIT_HALF;
  }

  click() {
    this.t = 0;
  }

  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    if (this.t > DOWN + UP) this.t = -1;
  }

  // Snaps in over DOWN, then springs back past rest before settling.
  get press() {
    if (this.t < 0) return 0;
    if (this.t < DOWN) return this.t / DOWN;
    const u = (this.t - DOWN) / UP;
    const k = 1 - u;
    return Math.cos(u * Math.PI * 1.5) * k * k;
  }

  draw(ctx) {
    const pal = this.pal;
    const press = this.press;

    ctx.save();
    // Pivot about the grip's own centre so it works like a latch rather than
    // sliding bodily across the door.
    ctx.translate(CENTRE - 0.03 * press, 0);
    ctx.rotate(-0.045 * press);
    ctx.translate(-CENTRE, 0);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 0.05 * (1 - 0.5 * press);
    ctx.shadowOffsetX = 0.012 * (1 - press);
    ctx.shadowOffsetY = 0.018 * (1 - 0.4 * press);
    roundRect(ctx, X0, -HALF, X1 - X0, HALF * 2, 0.075);
    const pad = ctx.createLinearGradient(0, -HALF, 0, HALF);
    pad.addColorStop(0, pal.chrome[1]);
    pad.addColorStop(0.3, pal.chrome[2]);
    pad.addColorStop(0.72, pal.chrome[3]);
    pad.addColorStop(1, pal.chrome[4]);
    ctx.fillStyle = pad;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.008;
    roundRect(ctx, X0, -HALF, X1 - X0, HALF * 2, 0.075);
    ctx.stroke();

    // Finger pocket: the hand goes in behind the grip, so it is in shadow and
    // deepest against the inner wall. Working the latch closes it up.
    roundRect(ctx, X0 + 0.028, -HALF + 0.06, 0.1 * (1 - 0.35 * press), (HALF - 0.06) * 2, 0.042);
    const pocket = ctx.createLinearGradient(X0, 0, X0 + 0.13, 0);
    pocket.addColorStop(0, '#07090b');
    pocket.addColorStop(1, '#2a2e34');
    ctx.fillStyle = pocket;
    ctx.fill();

    // Top edge faces the light, bottom edge faces the floor. Tipping the grip
    // in swings the lit edge away.
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = `rgba(255,255,255,${(0.34 * (1 - 0.6 * press)).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(X0 + 0.07, -HALF + 0.008);
    ctx.lineTo(X1 - 0.07, -HALF + 0.008);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(X0 + 0.07, HALF - 0.008);
    ctx.lineTo(X1 - 0.07, HALF - 0.008);
    ctx.stroke();

    ctx.restore();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
