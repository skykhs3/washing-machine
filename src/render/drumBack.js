const TWO_PI = Math.PI * 2;
const RINGS = [
  [0.22, 8],
  [0.38, 14],
  [0.54, 20],
  [0.7, 26],
  [0.86, 32],
];
const HOLE_R = 0.022;
const RIBS = [Math.PI / 3, Math.PI, (5 * Math.PI) / 3];

export class DrumBackLayer {
  constructor(pal) {
    this.pal = pal;
    this.pad = 1.05;
    this.sharp = document.createElement('canvas');
    this.blur = document.createElement('canvas');
    this.minSpacing = TWO_PI / RINGS[RINGS.length - 1][1];
  }

  rebuild(vp) {
    const S = Math.ceil(2 * this.pad * vp.R * vp.dpr);
    for (const c of [this.sharp, this.blur]) {
      c.width = S;
      c.height = S;
    }
    const k = vp.R * vp.dpr;
    const gs = this.sharp.getContext('2d');
    const gb = this.blur.getContext('2d');
    for (const g of [gs, gb]) {
      g.setTransform(k, 0, 0, k, S / 2, S / 2);
      g.beginPath();
      g.arc(0, 0, 1, 0, TWO_PI);
      g.clip();
      this.paintBase(g);
    }
    this.paintHoles(gs);
    this.paintBlur(gb);
  }

  paintBase(g) {
    const pal = this.pal;
    const base = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    base.addColorStop(0, '#3b414a');
    base.addColorStop(0.55, pal.drumMetal);
    base.addColorStop(0.9, pal.drumMetalDark);
    base.addColorStop(1, '#1c1f24');
    g.fillStyle = base;
    g.fillRect(-1.1, -1.1, 2.2, 2.2);

    const sheen = g.createLinearGradient(-1, -1, 1, 1);
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = sheen;
    g.fillRect(-1.1, -1.1, 2.2, 2.2);

    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 0.006;
    for (const [r] of RINGS) {
      g.beginPath();
      g.arc(0, 0, r + 0.08, 0, TWO_PI);
      g.stroke();
    }

    const cap = g.createRadialGradient(-0.03, -0.03, 0, 0, 0, 0.13);
    cap.addColorStop(0, '#5a616b');
    cap.addColorStop(1, '#2a2e34');
    g.fillStyle = cap;
    g.beginPath();
    g.arc(0, 0, 0.13, 0, TWO_PI);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.008;
    g.stroke();
  }

  paintHoles(g) {
    const pal = this.pal;
    g.lineWidth = 0.03;
    g.strokeStyle = pal.rib;
    g.lineCap = 'round';
    for (const a of RIBS) {
      g.beginPath();
      g.moveTo(Math.cos(a) * 0.16, Math.sin(a) * 0.16);
      g.lineTo(Math.cos(a) * 0.97, Math.sin(a) * 0.97);
      g.stroke();
    }
    g.fillStyle = pal.hole;
    RINGS.forEach(([r, n], ri) => {
      const off = ri % 2 ? Math.PI / n : 0;
      for (let i = 0; i < n; i++) {
        const a = (i * TWO_PI) / n + off;
        g.beginPath();
        g.arc(Math.cos(a) * r, Math.sin(a) * r, HOLE_R, 0, TWO_PI);
        g.fill();
      }
    });
  }

  paintBlur(g) {
    const pal = this.pal;
    g.lineWidth = HOLE_R * 2;
    for (const [r, n] of RINGS) {
      const coverage = Math.min(0.6, (n * HOLE_R * 2) / (TWO_PI * r));
      g.strokeStyle = `rgba(15,18,22,${coverage.toFixed(3)})`;
      g.beginPath();
      g.arc(0, 0, r, 0, TWO_PI);
      g.stroke();
    }
    g.strokeStyle = `${pal.rib}22`;
    g.lineWidth = 0.02;
    g.beginPath();
    g.arc(0, 0, 0.56, 0, TWO_PI);
    g.stroke();
  }

  // Draws the perforated back plate rotated to theta. Fast rotation is
  // rendered as a running average of sub-frame poses, then cross-faded to a
  // pre-blurred image so hole rings never strobe.
  draw(ctx, theta, dTheta, low) {
    const size = 2 * this.pad;
    const o = -this.pad;
    const ratio = Math.abs(dTheta) / this.minSpacing;
    const blit = (angle, alpha, img) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.rotate(angle);
      ctx.drawImage(img, o, o, size, size);
      ctx.restore();
    };
    const single = low ? 0.4 : 0.2;
    if (ratio < single) {
      blit(theta, 1, this.sharp);
      return;
    }
    const f = low ? Math.min(1, (ratio - 0.4) / 0.4) : Math.min(1, (ratio - 0.2) / 0.55);
    if (f >= 1) {
      blit(0, 1, this.blur);
      return;
    }
    const n = low ? 1 : Math.min(6, Math.max(2, Math.ceil(ratio * 8)));
    for (let k = 0; k < n; k++) {
      blit(theta - dTheta * (k / n), 1 / (k + 1), this.sharp);
    }
    if (f > 0) blit(0, f, this.blur);
  }
}
