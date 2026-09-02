import { SpatialHash } from './spatialHash.js';
import { buildTemplates } from './softbody.js';

export class World {
  constructor(phys, laundry) {
    this.cfg = phys;
    const N = phys.maxParticles;
    const M = phys.maxConstraints;
    this.px = new Float32Array(N);
    this.py = new Float32Array(N);
    this.ppx = new Float32Array(N);
    this.ppy = new Float32Array(N);
    this.invMass = new Float32Array(N);
    this.radius = new Float32Array(N);
    this.wet = new Float32Array(N);
    this.cnx = new Float32Array(N);
    this.cny = new Float32Array(N);
    this.flag = new Uint8Array(N);
    this.bodyIdx = new Int16Array(N);
    this.gcol = new Int8Array(N);
    this.grow = new Int8Array(N);
    this.cA = new Int32Array(M);
    this.cB = new Int32Array(M);
    this.cRest = new Float32Array(M);
    this.cStiff = new Float32Array(M);
    this.cShear = new Uint8Array(M);
    this.count = 0;
    this.ccount = 0;
    this.bodies = [];
    this.nextId = 1;
    this.time = 0;
    this.lastH = phys.dt;
    this.removeFade = laundry.removeFade;
    this.templates = buildTemplates(laundry.types, phys.spacing, phys.particleRadius);
    this.hash = new SpatialHash(phys.particleRadius * 2 + 0.01, 1.1, N);
  }

  canAdd(type) {
    const tpl = this.templates[type];
    if (!tpl) return false;
    return (
      this.count + tpl.n <= this.cfg.maxParticles &&
      this.ccount + tpl.constraints.length <= this.cfg.maxConstraints
    );
  }

  addBody(type, x, y, rot, colorIdx, vx = 0, vy = 0) {
    if (!this.canAdd(type)) return null;
    const tpl = this.templates[type];
    const start = this.count;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const h = this.lastH;
    const rp = this.cfg.particleRadius;
    const bi = this.bodies.length;
    for (let k = 0; k < tpl.n; k++) {
      const tx = tpl.pos[2 * k];
      const ty = tpl.pos[2 * k + 1];
      const wx = x + c * tx - s * ty;
      const wy = y + s * tx + c * ty;
      const i = start + k;
      this.px[i] = wx;
      this.py[i] = wy;
      this.ppx[i] = wx - vx * h;
      this.ppy[i] = wy - vy * h;
      this.invMass[i] = 1;
      this.radius[i] = rp;
      this.wet[i] = 0;
      this.flag[i] = 0;
      this.bodyIdx[i] = bi;
      this.gcol[i] = tpl.cols[k];
      this.grow[i] = tpl.rows[k];
    }
    const cStart = this.ccount;
    for (const con of tpl.constraints) {
      const ci = this.ccount++;
      this.cA[ci] = start + con.a;
      this.cB[ci] = start + con.b;
      this.cRest[ci] = con.rest;
      this.cShear[ci] = con.shear ? 1 : 0;
      this.cStiff[ci] = con.shear ? this.cfg.shearStiffness : this.cfg.structuralStiffness;
    }
    const body = {
      id: this.nextId++,
      type,
      tpl,
      start,
      n: tpl.n,
      cStart,
      cN: tpl.constraints.length,
      colorIdx,
      alpha: 1,
      removing: false,
      wet: 0,
    };
    this.bodies.push(body);
    this.count += tpl.n;
    return body;
  }

  removeLast() {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      if (!this.bodies[i].removing) {
        this.bodies[i].removing = true;
        return true;
      }
    }
    return false;
  }

  clear() {
    this.bodies = [];
    this.count = 0;
    this.ccount = 0;
  }

  // Compacts particle storage after bodies were removed and rebuilds the
  // constraint list from the templates.
  rebuild() {
    const arrays = [this.px, this.py, this.ppx, this.ppy, this.invMass, this.radius, this.wet, this.gcol, this.grow];
    let start = 0;
    this.bodies.forEach((b, bi) => {
      if (b.start !== start) {
        for (const arr of arrays) arr.copyWithin(start, b.start, b.start + b.n);
      }
      b.start = start;
      this.bodyIdx.fill(bi, start, start + b.n);
      start += b.n;
    });
    this.count = start;
    this.ccount = 0;
    for (const b of this.bodies) {
      b.cStart = this.ccount;
      for (const con of b.tpl.constraints) {
        const ci = this.ccount++;
        this.cA[ci] = b.start + con.a;
        this.cB[ci] = b.start + con.b;
        this.cRest[ci] = con.rest;
        this.cShear[ci] = con.shear ? 1 : 0;
        this.cStiff[ci] = con.shear ? this.cfg.shearStiffness : this.cfg.structuralStiffness;
      }
    }
  }

  step(dt, drum, water) {
    this.processRemovals(dt);
    const cfg = this.cfg;
    const omega = drum.omega;
    const sub = Math.min(cfg.maxSubsteps, Math.max(1, Math.ceil((Math.abs(omega) * dt) / cfg.substepMove)));
    const h = dt / sub;
    if (h !== this.lastH) this.rescaleVelocities(h / this.lastH);
    this.lastH = h;
    this.updateWetEffects();
    for (let s = 0; s < sub; s++) {
      drum.advance(h);
      this.integrate(h, water, cfg.gravity, omega);
      for (let it = 0; it < cfg.iterations; it++) {
        this.solveDistance();
        if (it < cfg.pairIterations) {
          this.hash.build(this.px, this.py, this.count);
          this.hash.solvePairs(this);
        }
        drum.collide(this, h, it === 0);
      }
      drum.applyContactVelocities(this, h, cfg.gravity);
      this.postStep();
    }
    this.time += dt;
  }

  processRemovals(dt) {
    let changed = false;
    for (const b of this.bodies) {
      if (!b.removing) continue;
      b.alpha -= dt / this.removeFade;
      if (b.alpha <= 0) {
        b.dead = true;
        changed = true;
      }
    }
    if (changed) {
      this.bodies = this.bodies.filter((b) => !b.dead);
      this.rebuild();
    }
  }

  rescaleVelocities(k) {
    const { px, py, ppx, ppy, count } = this;
    for (let i = 0; i < count; i++) {
      ppx[i] = px[i] - (px[i] - ppx[i]) * k;
      ppy[i] = py[i] - (py[i] - ppy[i]) * k;
    }
  }

  updateWetEffects() {
    const { wet, invMass, cStiff, cShear } = this;
    const gain = this.cfg.wetMassGain;
    const shearK = this.cfg.shearStiffness;
    for (const b of this.bodies) {
      let sum = 0;
      const end = b.start + b.n;
      for (let i = b.start; i < end; i++) {
        sum += wet[i];
        invMass[i] = 1 / (1 + gain * wet[i]);
      }
      b.wet = sum / b.n;
      const k = shearK * (1 - 0.5 * b.wet);
      const cend = b.cStart + b.cN;
      for (let c = b.cStart; c < cend; c++) {
        if (cShear[c]) cStiff[c] = k;
      }
    }
  }

  integrate(h, water, g, omega) {
    const { px, py, ppx, ppy, wet, radius, flag, count } = this;
    const cfg = this.cfg;
    const airK = Math.exp(-cfg.airDrag * h);
    const hasWater = water.active;
    const cosT = Math.cos(water.tilt);
    const sinT = Math.sin(water.tilt);
    const ys = water.surfaceY;
    const swirl = water.swirl;
    const wc = water.cfg;
    const beta = wc.buoyancy;
    const c1 = wc.linearDrag;
    const c2 = wc.quadDrag;
    const maxV = cfg.maxSpeed;
    const maxV2 = maxV * maxV;
    const drying = !hasWater && Math.abs(omega) > cfg.dryOmega;
    const wetRate = h / cfg.wetRate;
    const dryStep = h / cfg.dryRate;
    const h2 = h * h;

    for (let i = 0; i < count; i++) {
      const x = px[i];
      const y = py[i];
      let vx = (x - ppx[i]) / h;
      let vy = (y - ppy[i]) / h;
      let ay = g;
      let inWater = false;
      if (hasWater) {
        const yr = -x * sinT + y * cosT;
        let s = (yr - ys) / (2 * radius[i]) + 0.5;
        if (s > 0) {
          if (s > 1) s = 1;
          inWater = true;
          ay -= g * beta * s;
          const wvx = -swirl * y;
          const wvy = swirl * x;
          const rx = vx - wvx;
          const ry = vy - wvy;
          const sp = Math.sqrt(rx * rx + ry * ry);
          const f = Math.exp(-c1 * s * h) / (1 + c2 * s * sp * h);
          vx = wvx + rx * f;
          vy = wvy + ry * f;
          wet[i] += (1 - wet[i]) * wetRate * s;
        }
      }
      if (!inWater) {
        vx *= airK;
        vy *= airK;
        if (drying) {
          wet[i] -= dryStep;
          if (wet[i] < 0) wet[i] = 0;
        }
      }
      const v2 = vx * vx + vy * vy;
      if (v2 > maxV2) {
        const k = maxV / Math.sqrt(v2);
        vx *= k;
        vy *= k;
      }
      ppx[i] = x;
      ppy[i] = y;
      px[i] = x + vx * h;
      py[i] = y + vy * h + ay * h2;
      flag[i] = 0;
    }
  }

  solveDistance() {
    const { px, py, invMass, cA, cB, cRest, cStiff, ccount } = this;
    for (let c = 0; c < ccount; c++) {
      const a = cA[c];
      const b = cB[c];
      const dx = px[b] - px[a];
      const dy = py[b] - py[a];
      const L2 = dx * dx + dy * dy;
      if (L2 < 1e-12) continue;
      const wa = invMass[a];
      const wb = invMass[b];
      const ws = wa + wb;
      if (ws === 0) continue;
      const L = Math.sqrt(L2);
      const s = (cStiff[c] * (L - cRest[c])) / (L * ws);
      px[a] += wa * s * dx;
      py[a] += wa * s * dy;
      px[b] -= wb * s * dx;
      py[b] -= wb * s * dy;
    }
  }

  postStep() {
    const { px, py, ppx, ppy, count } = this;
    const maxD = this.cfg.maxStepDisplacement;
    const maxD2 = maxD * maxD;
    const esc2 = this.cfg.escapeRadius * this.cfg.escapeRadius;
    for (let i = 0; i < count; i++) {
      let x = px[i];
      let y = py[i];
      const r2 = x * x + y * y;
      if (!(r2 <= esc2)) {
        const r = Math.sqrt(r2);
        if (r > 1e-6) {
          x = (x / r) * 0.5;
          y = (y / r) * 0.5;
        } else {
          x = 0;
          y = 0.3;
        }
        px[i] = x;
        py[i] = y;
        ppx[i] = x;
        ppy[i] = y;
        continue;
      }
      const dx = x - ppx[i];
      const dy = y - ppy[i];
      const d2 = dx * dx + dy * dy;
      if (d2 > maxD2) {
        const k = maxD / Math.sqrt(d2);
        ppx[i] = x - dx * k;
        ppy[i] = y - dy * k;
      }
    }
  }
}
