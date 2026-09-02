import { UI_FONT } from './font.js';

const SEG = {
  0: [1, 1, 1, 1, 1, 1, 0],
  1: [0, 1, 1, 0, 0, 0, 0],
  2: [1, 1, 0, 1, 1, 0, 1],
  3: [1, 1, 1, 1, 0, 0, 1],
  4: [0, 1, 1, 0, 0, 1, 1],
  5: [1, 0, 1, 1, 0, 1, 1],
  6: [1, 0, 1, 1, 1, 1, 1],
  7: [1, 1, 1, 0, 0, 0, 0],
  8: [1, 1, 1, 1, 1, 1, 1],
  9: [1, 1, 1, 1, 0, 1, 1],
  '-': [0, 0, 0, 0, 0, 0, 1],
};

// Every element inside the console is sized from its height, so the height has
// to be capped to what the width can actually hold. The clock is laid out from
// the right edge inward, so once the contents overflow it walks off the left
// side and lands on top of the stage label.
const PER_HEIGHT = { withRpm: 4.1, timeOnly: 3 };

export function hudRect(vp) {
  const band = vp.bandHeight;
  const want = Math.round(band * 0.66);
  // A taller band means a bigger machine, so let the console grow with it
  // rather than pinning it at 300 and overflowing.
  const w = Math.round(Math.min(Math.max(150, vp.w * 0.5), Math.max(300, want * 4)));
  const showRpm = w >= 210;
  const h = Math.min(want, Math.round(w / (showRpm ? PER_HEIGHT.withRpm : PER_HEIGHT.timeOnly)));
  const margin = Math.round(band * 0.2);
  const x = vp.sidebar ? Math.round(vp.cx - w / 2) : vp.w - w - margin;
  return { x, y: Math.round((band - h) / 2), w, h, showRpm };
}

export class Hud {
  constructor(pal) {
    this.pal = pal;
    this.cache = document.createElement('canvas');
    this.key = '';
  }

  invalidate() {
    this.key = '';
  }

  draw(ctx, vp, info) {
    const r = hudRect(vp);
    const sec = Math.ceil(info.remaining);
    const rpm = Math.round(Math.abs(info.rpm));
    const key = [r.w, r.h, r.showRpm, vp.dpr, info.stageLabel, info.modeLabel, info.paused, sec, rpm, info.phaseIndex, info.manual].join('|');
    if (key !== this.key) {
      this.key = key;
      this.render(vp, r, info, sec, rpm);
    }
    ctx.drawImage(this.cache, r.x, r.y, r.w, r.h);
  }

  render(vp, r, info, sec, rpm) {
    const pal = this.pal;
    const c = this.cache;
    const cw = Math.round(r.w * vp.dpr);
    const ch = Math.round(r.h * vp.dpr);
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const g = c.getContext('2d');
    g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    const { w, h } = r;
    g.clearRect(0, 0, w, h);

    roundRect(g, 0, 0, w, h, 8);
    g.fillStyle = pal.ledBg;
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 1;
    roundRect(g, 0.5, 0.5, w - 1, h - 1, 7.5);
    g.stroke();
    const glow = g.createLinearGradient(0, 0, 0, h);
    glow.addColorStop(0, 'rgba(95,242,200,0.06)');
    glow.addColorStop(1, 'rgba(95,242,200,0)');
    g.fillStyle = glow;
    roundRect(g, 0, 0, w, h, 8);
    g.fill();

    const pad = Math.round(h * 0.18);
    const showRpm = r.showRpm;
    const rpmW = showRpm ? Math.round(h * 0.95) : 0;
    const digitH = h * 0.46;
    const digitW = digitH * 0.52;
    const gap = digitH * 0.14;
    const colonW = digitH * 0.2;
    const timeW = 4 * digitW + 3 * gap + colonW;
    const timeX = w - pad - rpmW - (showRpm ? pad * 0.6 : 0) - timeW;
    const timeY = h * 0.19;

    const timeStr = info.manual ? '----' : `${pad2(Math.floor(sec / 60))}${pad2(sec % 60)}`;
    let x = timeX;
    for (let i = 0; i < 4; i++) {
      drawDigit(g, timeStr[i], x, timeY, digitW, digitH, pal);
      x += digitW + gap;
      if (i === 1) {
        const dotR = digitH * 0.06;
        g.fillStyle = info.manual ? pal.ledDim : pal.led;
        g.beginPath();
        g.arc(x - gap + colonW / 2, timeY + digitH * 0.3, dotR, 0, Math.PI * 2);
        g.arc(x - gap + colonW / 2, timeY + digitH * 0.7, dotR, 0, Math.PI * 2);
        g.fill();
        x += colonW;
      }
    }

    if (showRpm) {
      g.fillStyle = pal.led;
      g.textAlign = 'right';
      g.textBaseline = 'alphabetic';
      g.font = `600 ${Math.round(h * 0.34)}px ${UI_FONT}`;
      g.fillText(String(rpm), w - pad, h * 0.52);
      g.font = `500 ${Math.round(h * 0.17)}px ${UI_FONT}`;
      g.fillStyle = 'rgba(95,242,200,0.6)';
      g.fillText('RPM', w - pad, h * 0.76);
    }

    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = pal.led;
    g.font = `600 ${Math.round(h * 0.3)}px ${UI_FONT}`;
    const labelMax = timeX - pad * 1.5;
    g.fillText(info.paused ? info.pausedLabel : info.stageLabel, pad, h * 0.48, Math.max(20, labelMax));
    g.font = `500 ${Math.round(h * 0.16)}px ${UI_FONT}`;
    g.fillStyle = 'rgba(95,242,200,0.6)';
    g.fillText(info.modeLabel, pad, h * 0.72, Math.max(20, labelMax));

    const dots = info.phaseCount;
    const dotR = Math.max(1.5, h * 0.035);
    const dotGap = dotR * 3.2;
    const dy = h - pad * 0.55;
    for (let i = 0; i < dots; i++) {
      const on = !info.manual && i === info.phaseIndex;
      const done = !info.manual && i < info.phaseIndex;
      g.fillStyle = on ? pal.led : done ? 'rgba(95,242,200,0.45)' : pal.ledDim;
      g.beginPath();
      g.arc(pad + dotR + i * dotGap, dy, dotR, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(Math.min(99, n));
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

// Seven segment digit: a=top, b=top-right, c=bottom-right, d=bottom,
// e=bottom-left, f=top-left, g=middle.
function drawDigit(g, ch, x, y, w, h, pal) {
  const on = SEG[ch] || SEG['-'];
  const t = h * 0.13;
  const half = h / 2;
  const segs = [
    [x + t * 0.6, y, w - t * 1.2, t],
    [x + w - t, y + t * 0.6, t, half - t * 0.9],
    [x + w - t, y + half + t * 0.3, t, half - t * 0.9],
    [x + t * 0.6, y + h - t, w - t * 1.2, t],
    [x, y + half + t * 0.3, t, half - t * 0.9],
    [x, y + t * 0.6, t, half - t * 0.9],
    [x + t * 0.6, y + half - t / 2, w - t * 1.2, t],
  ];
  segs.forEach((s, i) => {
    g.fillStyle = on[i] ? pal.led : pal.ledDim;
    roundRect(g, s[0], s[1], s[2], s[3], t * 0.3);
    g.fill();
  });
}
