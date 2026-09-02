export function hudRect(vp) {
  const band = vp.bandHeight;
  const h = Math.round(band * 0.66);
  const w = Math.round(Math.min(Math.max(150, vp.w * 0.5), 300));
  const margin = Math.round(band * 0.2);
  const x = vp.sidebar ? Math.round(vp.cx - w / 2) : vp.w - w - margin;
  return { x, y: Math.round((band - h) / 2), w, h };
}
