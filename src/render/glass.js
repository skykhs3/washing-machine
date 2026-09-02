const TWO_PI = Math.PI * 2;

export class GlassLayer {
  constructor(pal) {
    this.pal = pal;
    this.pad = 1.22;
    this.cache = document.createElement('canvas');
  }

  rebuild(vp) {
    const pal = this.pal;
    const S = Math.ceil(2 * this.pad * vp.R * vp.dpr);
    const c = this.cache;
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    const k = vp.R * vp.dpr;
    g.setTransform(k, 0, 0, k, S / 2, S / 2);

    const shadow = g.createRadialGradient(0, 0, 0.8, 0, 0, 1.0);
    shadow.addColorStop(0, 'rgba(0,0,0,0)');
    shadow.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = shadow;
    g.beginPath();
    g.arc(0, 0, 1, 0, TWO_PI);
    g.fill();

    const hl = g.createRadialGradient(-0.38, -0.42, 0.02, -0.38, -0.42, 1.0);
    hl.addColorStop(0, 'rgba(255,255,255,0.20)');
    hl.addColorStop(0.45, 'rgba(255,255,255,0.05)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.beginPath();
    g.arc(0, 0, 1, 0, TWO_PI);
    g.fill();

    g.save();
    g.translate(-0.36, -0.52);
    g.rotate(-0.62);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.ellipse(0, 0, 0.3, 0.06, 0, 0, TWO_PI);
    g.fill();
    g.restore();

    g.save();
    g.translate(0.42, 0.55);
    g.rotate(-0.62);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.beginPath();
    g.ellipse(0, 0, 0.16, 0.035, 0, 0, TWO_PI);
    g.fill();
    g.restore();

    annulus(g, 1.0, 1.075);
    g.fillStyle = pal.gasket;
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 0.008;
    g.beginPath();
    g.arc(0, 0, 1.004, 0, TWO_PI);
    g.stroke();

    const chrome = g.createLinearGradient(-1.1, -1.1, 1.1, 1.1);
    chrome.addColorStop(0, pal.chrome[0]);
    chrome.addColorStop(0.5, pal.chrome[1]);
    chrome.addColorStop(1, pal.chrome[2]);
    annulus(g, 1.075, 1.18);
    g.fillStyle = chrome;
    g.fill();

    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 0.012;
    g.beginPath();
    g.arc(0, 0, 1.18, 0, TWO_PI);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.006;
    g.beginPath();
    g.arc(0, 0, 1.075, 0, TWO_PI);
    g.stroke();
  }

  draw(ctx, vp) {
    const size = 2 * this.pad * vp.R;
    ctx.drawImage(this.cache, vp.cx - size / 2, vp.cy - size / 2, size, size);
  }
}

function annulus(g, r0, r1) {
  g.beginPath();
  g.arc(0, 0, r1, 0, TWO_PI);
  g.arc(0, 0, r0, TWO_PI, 0, true);
  g.closePath();
}
