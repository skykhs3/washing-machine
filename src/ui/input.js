const TAP_MS = 300;
const TAP_PX = 8;

export function initCanvasTap(canvas, vp, onTap) {
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const held = performance.now() - down.t;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (held > TAP_MS || moved > TAP_PX) return;
    const p = vp.toDrum(e.clientX, e.clientY);
    if (p.x * p.x + p.y * p.y < 1) onTap(p);
  });
  canvas.addEventListener('pointercancel', () => {
    down = null;
  });
}
