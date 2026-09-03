const SIDEBAR_WIDTH = 352;

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
    // Height the controls take off the bottom, measured from the DOM.
    this.reserved = 0;
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

  setReserved(px) {
    const v = Math.max(0, px);
    if (Math.abs(v - this.reserved) < 0.5) return;
    this.reserved = v;
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
    if (this.sidebar) {
      const avail = w - SIDEBAR_WIDTH;
      this.R = Math.min(0.38 * h, 0.25 * w, 0.42 * avail);
      // Far enough left of the sidebar for the grip at full pull and its
      // shadow, which reach 1.38 drum radii.
      this.cx = Math.min(w / 2, avail - this.R * 1.38);
      this.cy = 0.53 * h;
    } else {
      // Portrait, and phone landscape where the panel is a bottom sheet.
      // Centre the door in whatever is left between the top band and the
      // controls, whose height is measured rather than guessed, so hiding the
      // panel actually gives the drum the space back.
      const top = this.bandHeight;
      const avail = Math.max(80, h - this.reserved - top);
      // The door is not symmetric: the hinge tabs reach 1.235 drum radii to
      // the left, while on the right the grip at full pull, its shadow and the
      // blur under it reach about 1.38. Size and offset for that span so
      // neither side runs off the screen.
      this.R = Math.min(0.378 * w, 0.4 * h, avail / 2.42);
      this.cx = w / 2 - 0.072 * this.R;
      this.cy = top + avail / 2;
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
