import { hudRect } from './hud.js';
import { UI_FONT } from './font.js';
const TWO_PI = Math.PI * 2;

export class BodyLayer {
  constructor(pal) {
    this.pal = pal;
    this.cache = document.createElement('canvas');
  }

  rebuild(vp) {
    const pal = this.pal;
    const c = this.cache;
    c.width = vp.canvas.width;
    c.height = vp.canvas.height;
    const g = c.getContext('2d');
    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    const { w, h, cx, cy, R } = vp;
    const band = vp.bandHeight;

    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, pal.bodyTop);
    grad.addColorStop(1, pal.bodyBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    const sheen = g.createRadialGradient(w * 0.2, h * 0.1, 0, w * 0.2, h * 0.1, Math.max(w, h) * 0.9);
    sheen.addColorStop(0, 'rgba(255,255,255,0.06)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, w, h);

    g.fillStyle = pal.band;
    g.fillRect(0, 0, w, band);
    g.fillStyle = pal.bandEdge;
    g.fillRect(0, band - 2, w, 2);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, band, w, 1);

    const fontPx = Math.max(10, Math.round(band * 0.14));
    const brandX = Math.round(band * 0.2);
    const brandMax = hudRect(vp).x - brandX - Math.round(band * 0.2);
    g.fillStyle = pal.brand;
    g.font = `600 ${fontPx}px ${UI_FONT}`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const canSpace = 'letterSpacing' in g;
    if (canSpace) g.letterSpacing = '0.22em';
    let brand = 'WASHING MACHINE';
    if (g.measureText(brand).width > brandMax) {
      if (canSpace) g.letterSpacing = '0.08em';
      if (g.measureText(brand).width > brandMax) brand = 'WM';
    }
    if (g.measureText(brand).width <= brandMax) g.fillText(brand, brandX, Math.round(band * 0.5));
    if (canSpace) g.letterSpacing = '0px';

    const ring = g.createRadialGradient(cx, cy, R * 1.18, cx, cy, R * 1.48);
    ring.addColorStop(0, pal.surround);
    ring.addColorStop(0.6, 'rgba(21,23,27,0.35)');
    ring.addColorStop(1, 'rgba(21,23,27,0)');
    g.fillStyle = ring;
    g.beginPath();
    g.arc(cx, cy, R * 1.48, 0, TWO_PI);
    g.fill();

    g.fillStyle = '#090b0e';
    g.beginPath();
    g.arc(cx, cy, R * 1.19, 0, TWO_PI);
    g.fill();

    const kick = Math.max(20, h * 0.05);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, h - kick, w, kick);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.fillRect(0, h - kick, w, 1);
  }

  draw(ctx, vp) {
    ctx.drawImage(this.cache, 0, 0, vp.w, vp.h);
  }
}
