export function buildTemplates(types, spacing, particleRadius) {
  const out = {};
  for (const [type, def] of Object.entries(types)) {
    out[type] = buildTemplate(type, def, spacing, particleRadius);
  }
  return out;
}

export function buildTemplate(type, def, spacing, particleRadius) {
  const rows = def.mask;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const has = (c, r) => c >= 0 && r >= 0 && c < w && r < h && rows[r][c] === '#';
  const scale = def.scale ?? 1;
  const sp = spacing * scale;
  const rp = particleRadius * scale;

  const cells = [];
  // -1, not 0: 0 is a valid particle index.
  const cellAt = new Int16Array(w * h).fill(-1);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (has(c, r)) {
        cellAt[r * w + c] = cells.length;
        cells.push({ c, r });
      }
    }
  }
  const n = cells.length;
  const id = (c, r) => cellAt[r * w + c];

  let sx = 0;
  let sy = 0;
  for (const { c, r } of cells) {
    sx += c;
    sy += r;
  }
  const cx = sx / n;
  const cy = sy / n;

  const pos = new Float32Array(n * 2);
  const cols = new Int8Array(n);
  const rws = new Int8Array(n);
  let extent = 0;
  cells.forEach(({ c, r }, i) => {
    const x = (c - cx) * sp;
    const y = (r - cy) * sp;
    pos[2 * i] = x;
    pos[2 * i + 1] = y;
    cols[i] = c;
    rws[i] = r;
    extent = Math.max(extent, Math.hypot(x, y) + rp);
  });

  const constraints = [];
  const diag = sp * Math.SQRT2;
  cells.forEach(({ c, r }, i) => {
    if (has(c + 1, r)) constraints.push({ a: i, b: id(c + 1, r), rest: sp, shear: false });
    if (has(c, r + 1)) constraints.push({ a: i, b: id(c, r + 1), rest: sp, shear: false });
    if (has(c + 1, r + 1)) constraints.push({ a: i, b: id(c + 1, r + 1), rest: diag, shear: true });
    if (has(c - 1, r + 1)) constraints.push({ a: i, b: id(c - 1, r + 1), rest: diag, shear: true });
  });

  const outline = traceOutline(has, cells, w);

  const row0 = cells.map((cell, i) => ({ cell, i })).filter(({ cell }) => cell.r === 0);
  const refA = row0[0].i;
  const refB = row0[row0.length - 1].i;
  const restAngle = Math.atan2(pos[2 * refB + 1] - pos[2 * refA + 1], pos[2 * refB] - pos[2 * refA]);

  return {
    type,
    n,
    w,
    h,
    cellAt,
    pos,
    cols,
    rows: rws,
    constraints,
    outline,
    refA,
    refB,
    restAngle,
    extent,
    spacing: sp,
    radius: rp,
    colors: def.colors,
    pattern: def.pattern,
  };
}

// Walks the boundary edges of the cell union clockwise and returns the
// ordered list of boundary cell indices (a closed loop).
function traceOutline(has, cells, w) {
  const key = (x, y) => y * (w + 1) + x;
  const edges = new Map();
  cells.forEach(({ c, r }, ci) => {
    if (!has(c, r - 1)) edges.set(key(c, r), { x: c + 1, y: r, ci });
    if (!has(c + 1, r)) edges.set(key(c + 1, r), { x: c + 1, y: r + 1, ci });
    if (!has(c, r + 1)) edges.set(key(c + 1, r + 1), { x: c, y: r + 1, ci });
    if (!has(c - 1, r)) edges.set(key(c, r + 1), { x: c, y: r, ci });
  });

  const start = key(cells[0].c, cells[0].r);
  let cur = start;
  const walk = [];
  do {
    const e = edges.get(cur);
    if (!e) break;
    walk.push(e.ci);
    cur = key(e.x, e.y);
  } while (cur !== start && walk.length < 4096);

  const out = [];
  for (const ci of walk) {
    if (out[out.length - 1] !== ci) out.push(ci);
  }
  if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
  return out;
}
