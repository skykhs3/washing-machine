const TWO_PI = Math.PI * 2;

export class Drum {
  constructor(phys) {
    this.R = 1;
    this.omega = 0;
    this.theta = 0;
    this.mu = phys.wallFriction;
    this.e = phys.wallRestitution;
    const L = phys.lifter;
    this.lifterCount = L.count;
    this.inner = L.inner;
    this.outer = L.outer;
    this.rc = L.radius;
    this.lcos = [];
    this.lsin = [];
    for (let k = 0; k < L.count; k++) {
      const a = (k * TWO_PI) / L.count;
      this.lcos.push(Math.cos(a));
      this.lsin.push(Math.sin(a));
    }
  }

  advance(h) {
    this.theta += this.omega * h;
    if (this.theta >= TWO_PI) this.theta -= TWO_PI;
    else if (this.theta < 0) this.theta += TWO_PI;
  }

  collide(world, h, guard) {
    this.collideWall(world);
    this.collideLifters(world, h, guard);
  }

  collideWall(world) {
    const { px, py, radius, flag, cnx, cny, count } = world;
    const R = this.R;
    for (let i = 0; i < count; i++) {
      const x = px[i];
      const y = py[i];
      const lim = R - radius[i];
      const r2 = x * x + y * y;
      if (r2 <= lim * lim) continue;
      const r = Math.sqrt(r2);
      const nx = x / r;
      const ny = y / r;
      px[i] = nx * lim;
      py[i] = ny * lim;
      cnx[i] = nx;
      cny[i] = ny;
      flag[i] = 1;
    }
  }

  collideLifters(world, h, guard) {
    const { px, py, ppx, ppy, radius, flag, cnx, cny, count } = world;
    const { inner, outer, rc, lcos, lsin, lifterCount } = this;
    const ct = Math.cos(this.theta);
    const st = Math.sin(this.theta);
    const thetaPrev = this.theta - this.omega * h;
    const cp = Math.cos(thetaPrev);
    const sp = Math.sin(thetaPrev);
    const rejectR = inner - rc - 0.06;
    const reject2 = rejectR * rejectR;

    for (let i = 0; i < count; i++) {
      const x = px[i];
      const y = py[i];
      if (x * x + y * y < reject2) continue;
      const rr = rc + radius[i];
      const lx = ct * x + st * y;
      const ly = -st * x + ct * y;
      for (let k = 0; k < lifterCount; k++) {
        const c = lcos[k];
        const s = lsin[k];
        const kx = c * lx + s * ly;
        const ky = -s * lx + c * ly;
        if (kx < inner - rr || kx > outer + rr || ky > rr || ky < -rr) continue;
        const qx = kx < inner ? inner : kx > outer ? outer : kx;
        const dx = kx - qx;
        const d2 = dx * dx + ky * ky;
        if (d2 >= rr * rr) continue;

        let nx;
        let ny;
        let flipped = false;
        if (d2 < 1e-12) {
          nx = 0;
          ny = ky >= 0 ? 1 : -1;
        } else {
          const d = Math.sqrt(d2);
          nx = dx / d;
          ny = ky / d;
        }
        if (guard) {
          const ox = ppx[i];
          const oy = ppy[i];
          const plx = cp * ox + sp * oy;
          const ply = -sp * ox + cp * oy;
          const pkx = c * plx + s * ply;
          const pky = -s * plx + c * ply;
          if (pky * ky < 0 && pkx > inner - rr && pkx < outer + rr) {
            nx = 0;
            ny = pky > 0 ? 1 : -1;
            flipped = true;
          }
        }

        const nkx = flipped ? kx : qx + nx * rr;
        const nky = ny * rr;
        const lx2 = c * nkx - s * nky;
        const ly2 = s * nkx + c * nky;
        px[i] = ct * lx2 - st * ly2;
        py[i] = st * lx2 + ct * ly2;

        const wnx0 = c * -nx - s * -ny;
        const wny0 = s * -nx + c * -ny;
        cnx[i] = ct * wnx0 - st * wny0;
        cny[i] = st * wnx0 + ct * wny0;
        flag[i] = 2;
        break;
      }
    }
  }

  // Coulomb friction and restitution against the rotating drum surface.
  // Contact normals point from the particle into the obstacle.
  applyContactVelocities(world, h, g) {
    const { px, py, ppx, ppy, wet, flag, cnx, cny, count } = world;
    const omega = this.omega;
    const w2 = omega * omega;
    const mu = this.mu;
    const e0 = this.e;
    for (let i = 0; i < count; i++) {
      if (flag[i] === 0) continue;
      const x = px[i];
      const y = py[i];
      const nx = cnx[i];
      const ny = cny[i];
      const vx = (x - ppx[i]) / h;
      const vy = (y - ppy[i]) / h;
      const wvx = -omega * y;
      const wvy = omega * x;
      const rvx = vx - wvx;
      const rvy = vy - wvy;
      const vn = rvx * nx + rvy * ny;
      let tvx = rvx - vn * nx;
      let tvy = rvy - vn * ny;
      const e = e0 * (1 - wet[i]);
      const vn2 = vn > 0 ? -e * vn : vn;
      const normalAccel = g * ny + w2 * (x * nx + y * ny);
      const jn = Math.abs(vn2 - vn) + h * (normalAccel > 0 ? normalAccel : 0);
      const tmag = Math.sqrt(tvx * tvx + tvy * tvy);
      const maxF = mu * jn;
      if (tmag <= maxF) {
        tvx = 0;
        tvy = 0;
      } else {
        const k = (tmag - maxF) / tmag;
        tvx *= k;
        tvy *= k;
      }
      const nvx = wvx + vn2 * nx + tvx;
      const nvy = wvy + vn2 * ny + tvy;
      ppx[i] = x - nvx * h;
      ppy[i] = y - nvy * h;
    }
  }
}
