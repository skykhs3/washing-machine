// Garment marks: collars, seams, waistbands, stripes and colour blocks drawn
// on top of a piece of laundry.
//
// A mark is written in continuous grid coordinates (u across the mask columns,
// v down its rows). Each sample point is compiled once into an affine
// combination of nearby particles, so at draw time the mark is a handful of
// multiply-adds and it bends with the cloth instead of riding on it as a rigid
// overlay. Coordinates outside the mask are extrapolated from the local cell
// basis, which is how a hem reaches the silhouette edge rather than stopping a
// half stroke short of it; the outline clip trims whatever overshoots.

// Longest step, in cells, between two compiled samples. A mark that spans the
// whole piece has to be cut into pieces or its middle would be a straight
// chord across a bent body.
const MAX_STEP = 0.85;

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shadeRgb(rgb, k) {
  const m = 1 - k;
  return `rgb(${(rgb[0] * m) | 0},${(rgb[1] * m) | 0},${(rgb[2] * m) | 0})`;
}

function mixRgb(rgb, target, k) {
  return [
    rgb[0] + (target - rgb[0]) * k,
    rgb[1] + (target - rgb[1]) * k,
    rgb[2] + (target - rgb[2]) * k,
  ];
}

function markRgb(spec, base, accent) {
  if (typeof spec === 'string') return spec === 'accent' ? accent : hexToRgb(spec);
  if (spec && typeof spec.shade === 'number') return mixRgb(base, 0, spec.shade);
  if (spec && typeof spec.tint === 'number') return mixRgb(base, 255, spec.tint);
  return base;
}

function nearestCell(tpl, u, v) {
  const { w, h, cellAt } = tpl;
  let best = -1;
  let bc = 0;
  let br = 0;
  let bd = Infinity;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = cellAt[r * w + c];
      if (i < 0) continue;
      const d = (c - u) ** 2 + (r - v) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
        bc = c;
        br = r;
      }
    }
  }
  return { i: best, c: bc, r: br };
}

// Mean lattice step along one direction, as weights that sum to zero. A cell
// on a one cell wide tab, such as a sleeve on this grid, has no neighbour above
// or below it, so the local difference cannot give a vertical direction at all;
// averaging over the whole piece does, and it still bends with the cloth.
function meanStep(tpl, dc, dr) {
  const { w, h, cellAt } = tpl;
  const at = (c, r) => (c >= 0 && r >= 0 && c < w && r < h ? cellAt[r * w + c] : -1);
  const acc = new Map();
  let n = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const a = at(c, r);
      const b = at(c + dc, r + dr);
      if (a < 0 || b < 0) continue;
      acc.set(b, (acc.get(b) || 0) + 1);
      acc.set(a, (acc.get(a) || 0) - 1);
      n++;
    }
  }
  if (!n) return null;
  for (const [k, x] of acc) acc.set(k, x / n);
  return acc;
}

// One lattice direction as a central difference, falling back to a one-sided
// one where the mask ends and to the piece average where there is no neighbour
// either way. The contributions sum to zero, so the point stays an affine
// combination and the mark neither shrinks nor drifts.
function addAxis(at, anchor, c, r, dc, dr, d, mean, add) {
  if (!d) return;
  const p = at(c + dc, r + dr);
  const m = at(c - dc, r - dr);
  if (p >= 0 && m >= 0) {
    add(p, d * 0.5);
    add(m, -d * 0.5);
  } else if (p >= 0) {
    add(p, d);
    add(anchor, -d);
  } else if (m >= 0) {
    add(anchor, d);
    add(m, -d);
  } else if (mean) {
    for (const [i, x] of mean) add(i, x * d);
  }
}

function resolvePoint(tpl, steps, u, v) {
  const { w, h, cellAt } = tpl;
  const at = (c, r) => (c >= 0 && r >= 0 && c < w && r < h ? cellAt[r * w + c] : -1);
  const a = nearestCell(tpl, u, v);
  const acc = new Map();
  const add = (idx, wt) => {
    if (idx < 0 || !wt) return;
    acc.set(idx, (acc.get(idx) || 0) + wt);
  };
  add(a.i, 1);
  addAxis(at, a.i, a.c, a.r, 1, 0, u - a.c, steps.u, add);
  addAxis(at, a.i, a.c, a.r, 0, 1, v - a.r, steps.v, add);
  const idx = new Int32Array(acc.size);
  const wt = new Float32Array(acc.size);
  let k = 0;
  for (const [i, x] of acc) {
    idx[k] = i;
    wt[k] = x;
    k++;
  }
  return { idx, wt };
}

function subdivide(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [u0, v0] = pts[i - 1];
    const [u1, v1] = pts[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(u1 - u0, v1 - v0) / MAX_STEP));
    for (let s = 1; s <= steps; s++) {
      out.push([u0 + ((u1 - u0) * s) / steps, v0 + ((v1 - v0) * s) / steps]);
    }
  }
  return out;
}

const mirrorPts = (pts, w) => pts.map(([u, v]) => [w - 1 - u, v]);

// Stripes are sugar for a run of horizontal lines, and `mirror` for a second
// copy reflected across the centre column. Both are expanded here so the draw
// path only ever sees plain polylines, loops and discs.
function expand(marks, w) {
  const out = [];
  for (const m of marks) {
    if (m.t === 'stripe') {
      for (const v of m.rows) {
        out.push({ ...m, t: 'band', pts: [[m.u0, v], [m.u1, v]] });
      }
      continue;
    }
    out.push(m);
    if (m.mirror && m.pts) out.push({ ...m, pts: mirrorPts(m.pts, w) });
    if (m.mirror && m.at) out.push({ ...m, at: [w - 1 - m.at[0], m.at[1]] });
  }
  return out;
}

export function compileDesign(tpl, design) {
  const steps = { u: meanStep(tpl, 1, 0), v: meanStep(tpl, 0, 1) };
  const base = hexToRgb(design.base);
  const accent = design.accent ? hexToRgb(design.accent) : base;
  const groups = new Map();
  const groupFor = (kind, rgb, width, lod) => {
    const key = `${kind}|${rgb.map(Math.round).join(',')}|${width}|${lod}`;
    let g = groups.get(key);
    if (!g) {
      g = { kind, rgb, width, lod, items: [] };
      groups.set(key, g);
    }
    return g;
  };

  for (const m of expand(design.marks, tpl.w)) {
    const rgb = markRgb(m.color, base, accent);
    const lod = m.lod ?? 0;
    if (m.t === 'motif') {
      groupFor('disc', rgb, 0, lod).items.push({
        c: resolvePoint(tpl, steps, m.at[0], m.at[1]),
        r: m.r * tpl.spacing,
      });
    } else if (m.t === 'area') {
      groupFor('fill', rgb, 0, lod).items.push(
        subdivide([...m.pts, m.pts[0]]).map(([u, v]) => resolvePoint(tpl, steps, u, v)),
      );
    } else {
      const width = (m.w ?? 0.1) * tpl.spacing;
      groupFor('stroke', rgb, width, lod).items.push(
        subdivide(m.pts).map(([u, v]) => resolvePoint(tpl, steps, u, v)),
      );
    }
  }
  return [...groups.values()];
}

function px(world, start, p) {
  const { idx, wt } = p;
  let x = 0;
  for (let k = 0; k < idx.length; k++) x += world.px[start + idx[k]] * wt[k];
  return x;
}

function py(world, start, p) {
  const { idx, wt } = p;
  let y = 0;
  for (let k = 0; k < idx.length; k++) y += world.py[start + idx[k]] * wt[k];
  return y;
}

// Smoothed through the midpoints, the same way the silhouette is drawn, so a
// mark reads as fabric rather than as a chain of straight segments.
function tracePath(ctx, world, start, pts) {
  const n = pts.length;
  if (n < 2) return;
  let x0 = px(world, start, pts[0]);
  let y0 = py(world, start, pts[0]);
  ctx.moveTo(x0, y0);
  if (n === 2) {
    ctx.lineTo(px(world, start, pts[1]), py(world, start, pts[1]));
    return;
  }
  for (let i = 1; i < n - 1; i++) {
    const x1 = px(world, start, pts[i]);
    const y1 = py(world, start, pts[i]);
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    x0 = x1;
    y0 = y1;
  }
  ctx.quadraticCurveTo(x0, y0, px(world, start, pts[n - 1]), py(world, start, pts[n - 1]));
}

// `wet` darkens the marks by the same amount as the body fill; without it a
// soaked shirt would keep dry-looking stripes.
export function drawGarment(ctx, world, b, groups, wet, low) {
  const start = b.start;
  for (const g of groups) {
    if (low && g.lod) continue;
    const colour = shadeRgb(g.rgb, 0.32 * wet);
    ctx.beginPath();
    if (g.kind === 'disc') {
      for (const it of g.items) {
        const x = px(world, start, it.c);
        const y = py(world, start, it.c);
        ctx.moveTo(x + it.r, y);
        ctx.arc(x, y, it.r, 0, Math.PI * 2);
      }
      ctx.fillStyle = colour;
      ctx.fill();
    } else if (g.kind === 'fill') {
      for (const pts of g.items) {
        tracePath(ctx, world, start, pts);
        ctx.closePath();
      }
      ctx.fillStyle = colour;
      ctx.fill();
    } else {
      for (const pts of g.items) tracePath(ctx, world, start, pts);
      ctx.lineWidth = g.width;
      ctx.strokeStyle = colour;
      ctx.stroke();
    }
  }
}
