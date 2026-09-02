const SIDEBAR_WIDTH = 352;
const PANEL_ESTIMATE = 372;

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.maxDpr = 2;
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.cx = 0;
    this.cy = 0;
    this.R = 1;
    this.portrait = true;
    this.sidebar = false;
    this.generation = 0;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    window.addEventListener('orientationchange', () => this.resize());
    this.resize(true);
  }

  setMaxDpr(v) {
    if (v === this.maxDpr) return;
    this.maxDpr = v;
    this.resize(true);
  }

  resize(force = false) {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    if (!force && w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.portrait = h >= w;
    this.sidebar = !this.portrait && w >= 700;
    if (this.portrait) {
      const bandBottom = this.bandHeight;
      // Keep the whole door above the control panel when there is room.
      const fitR = (h - PANEL_ESTIMATE - bandBottom - 16) / 2.42;
      this.R = Math.max(0.28 * w, Math.min(0.42 * w, 0.3 * h, fitR));
      this.cx = w / 2;
      const room = h - PANEL_ESTIMATE - bandBottom - 2.42 * this.R;
      this.cy = bandBottom + 1.21 * this.R + Math.max(8, room / 2);
    } else {
      const avail = this.sidebar ? w - SIDEBAR_WIDTH : w;
      this.R = Math.min(0.38 * h, 0.25 * w, 0.42 * avail);
      this.cx = this.sidebar ? Math.min(w / 2, avail - this.R * 1.25) : w / 2;
      this.cy = 0.53 * h;
    }
    this.generation++;
  }

  get bandHeight() {
    return this.portrait ? 0.12 * this.h : 0.14 * this.h;
  }

  drumTransform(ctx = this.ctx) {
    const k = this.dpr * this.R;
    ctx.setTransform(k, 0, 0, k, this.dpr * this.cx, this.dpr * this.cy);
  }

  pixelTransform(ctx = this.ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  toDrum(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.cx) / this.R,
      y: (clientY - rect.top - this.cy) / this.R,
    };
  }
}
