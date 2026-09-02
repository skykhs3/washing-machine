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
    const rect = canvas.getBoundingClientRect();
    // Both spaces: the console is laid out in pixels, the door in drum units.
    onTap({
      drum: vp.toDrum(e.clientX, e.clientY),
      px: { x: e.clientX - rect.left, y: e.clientY - rect.top },
    });
  });
  canvas.addEventListener('pointercancel', () => {
    down = null;
  });
}
