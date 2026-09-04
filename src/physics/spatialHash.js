export class SpatialHash {
  constructor(cellSize, extent, maxN) {
    this.inv = 1 / cellSize;
    this.extent = extent;
    this.dim = Math.ceil((2 * extent) / cellSize);
    const cells = this.dim * this.dim;
    this.cellStart = new Int32Array(cells + 1);
    this.cursor = new Int32Array(cells);
    this.entries = new Int32Array(maxN);
    this.cellIdx = new Int32Array(maxN);
  }

  cellOf(x, y) {
    const d = this.dim;
    let cx = Math.floor((x + this.extent) * this.inv);
    let cy = Math.floor((y + this.extent) * this.inv);
    if (cx < 0) cx = 0;
    else if (cx >= d) cx = d - 1;
    if (cy < 0) cy = 0;
    else if (cy >= d) cy = d - 1;
    return cy * d + cx;
  }

  build(px, py, n) {
    const { cellStart, cursor, entries, cellIdx } = this;
    cellStart.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.cellOf(px[i], py[i]);
      cellIdx[i] = c;
      cellStart[c + 1]++;
    }
    const cells = this.dim * this.dim;
    for (let c = 0; c < cells; c++) {
      cellStart[c + 1] += cellStart[c];
      cursor[c] = cellStart[c];
    }
    for (let i = 0; i < n; i++) {
      entries[cursor[cellIdx[i]]++] = i;
    }
    this.n = n;
  }

  // Pushes overlapping particles apart. Particles that are direct grid
  // neighbours inside the same body are left to the distance constraints.
  solvePairs(world) {
    const { px, py, radius, invMass, bodyIdx, gcol, grow, contactX, contactY, contactN, maxBodies } = world;
    const { cellStart, entries, cellIdx, dim, n } = this;
    for (let i = 0; i < n; i++) {
      const c = cellIdx[i];
      const cx = c % dim;
      const cy = (c - cx) / dim;
      const xi = px[i];
      const yi = py[i];
      const ri = radius[i];
      const wi = invMass[i];
      const bi = bodyIdx[i];
      for (let dy = -1; dy <= 1; dy++) {
        const yy = cy + dy;
        if (yy < 0 || yy >= dim) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx;
          if (xx < 0 || xx >= dim) continue;
          const cc = yy * dim + xx;
          const end = cellStart[cc + 1];
          for (let k = cellStart[cc]; k < end; k++) {
            const j = entries[k];
            if (j <= i) continue;
            if (bi === bodyIdx[j]) {
              const dc = gcol[i] - gcol[j];
              const dr = grow[i] - grow[j];
              if (dc >= -1 && dc <= 1 && dr >= -1 && dr <= 1) continue;
            }
            const ddx = px[j] - xi;
            const ddy = py[j] - yi;
            const t = ri + radius[j];
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 >= t * t || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
            const wj = invMass[j];
            const ws = wi + wj;
            if (ws === 0) continue;
            const s = ((t - d) / d) / ws;
            px[i] -= ddx * s * wi;
            py[i] -= ddy * s * wi;
            px[j] += ddx * s * wj;
            py[j] += ddy * s * wj;
            // Record which pieces touch and from which side, for the load the
            // pile puts on each of them. The normal is stored from the lower
            // body index to the higher one.
            const bj = bodyIdx[j];
            if (bi !== bj) {
              const lo = bi < bj ? bi : bj;
              const hi = bi < bj ? bj : bi;
              const sgn = bi < bj ? 1 : -1;
              const key = lo * maxBodies + hi;
              contactX[key] += (sgn * ddx) / d;
              contactY[key] += (sgn * ddy) / d;
              contactN[key]++;
            }
          }
        }
      }
    }
  }
}
