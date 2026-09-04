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
    this.impact = new Float32Array(N);
    // Which pieces touched this step and from which side, keyed by the pair
    // of body indices. The smallest piece is 8 particles, so 64 is a ceiling.
    this.maxBodies = 64;
    this.contactX = new Float32Array(this.maxBodies * this.maxBodies);
    this.contactY = new Float32Array(this.maxBodies * this.maxBodies);
    this.contactN = new Float32Array(this.maxBodies * this.maxBodies);
    this.order = [];
    this.share = new Float32Array(this.maxBodies);
    this.events = [];
    this.agitation = 0;
    this.wetness = 0;
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
    // Pieces carry their own particle radius, so the hash cell has to be sized
    // from the largest of them or the 3x3 neighbour scan would miss contacts.
    let maxR = 0;
    for (const tpl of Object.values(this.templates)) maxR = Math.max(maxR, tpl.radius);
    this.hash = new SpatialHash(maxR * 2 + 0.01, 1.1, N);
  }

  get liveBodies() {
    return this.bodies.filter((b) => !b.removing);
  }

  get liveCount() {
    let n = 0;
    for (const b of this.bodies) if (!b.removing) n++;
    return n;
  }

  canAdd(type) {
    const tpl = this.templates[type];
    if (!tpl) return false;
    return (
      this.bodies.length < this.maxBodies &&
      this.count + tpl.n <= this.cfg.maxParticles &&
      this.ccount + tpl.constraints.length <= this.cfg.maxConstraints
    );
  }

  addBody(type, x, y, rot, designIdx, vx = 0, vy = 0) {
    if (!this.canAdd(type)) return null;
    const tpl = this.templates[type];
    const start = this.count;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const h = this.lastH;
    const rp = tpl.radius;
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
      designIdx,
      alpha: 1,
      removing: false,
      wet: 0,
      airTime: 0,
      cooldown: 0,
      // Compaction state: the load carried, smoothed, the squeeze it
      // produces, the direction it acts along, and the wall contacts seen
      // this step.
      load: 0,
      press: 0,
      nx: 0,
      ny: 1,
      weight: 0,
      height: 0,
      incoming: 0,
      idx: 0,
      wallN: 0,
      wallX: 0,
      wallY: 0,
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
      this.collectImpacts(h, water);
      this.postStep();
    }
    this.updateCompression(dt, water, omega, sub);
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
    let wetSum = 0;
    let wetN = 0;
    for (const b of this.bodies) {
      let sum = 0;
      const end = b.start + b.n;
      for (let i = b.start; i < end; i++) {
        sum += wet[i];
        invMass[i] = 1 / (1 + gain * wet[i]);
      }
      b.wet = sum / b.n;
      if (!b.removing) {
        wetSum += b.wet;
        wetN++;
      }
      const k = shearK * (1 - 0.5 * b.wet);
      const cend = b.cStart + b.cN;
      for (let c = b.cStart; c < cend; c++) {
        if (cShear[c]) cStiff[c] = k;
      }
    }
    this.wetness = wetN ? wetSum / wetN : 0;
  }

  // Emits one event per body when it lands on the drum after time in the
  // air; strength is the approach speed of the hardest-hitting particle.
  collectImpacts(h, water) {
    const { px, py, flag, impact, cnx, cny } = this;
    const ys = water.surfaceY;
    const cosT = Math.cos(water.tilt);
    const sinT = Math.sin(water.tilt);
    for (const b of this.bodies) {
      let contacts = 0;
      let maxImp = 0;
      let sx = 0;
      let sy = 0;
      const end = b.start + b.n;
      for (let i = b.start; i < end; i++) {
        if (flag[i]) {
          contacts++;
          b.wallX += cnx[i];
          b.wallY += cny[i];
        }
        if (impact[i] > maxImp) maxImp = impact[i];
        sx += px[i];
        sy += py[i];
      }
      b.wallN += contacts;
      b.cooldown -= h;
      if (contacts === 0) {
        b.airTime += h;
        continue;
      }
      if (b.airTime >= 0.05 && maxImp > 1.5 && b.cooldown <= 0 && this.events.length < 32) {
        const cx = sx / b.n;
        const cy = sy / b.n;
        const yr = -cx * sinT + cy * cosT;
        const splash = water.active && yr > ys - 0.05;
        if (!splash || maxImp > 3) {
          this.events.push({ type: 'impact', strength: maxImp, wet: b.wet, splash, x: cx, y: cy });
          b.cooldown = splash ? 0.6 : 0.4;
        }
      }
      b.airTime = 0;
    }
  }

  integrate(h, water, g, omega) {
    const { px, py, ppx, ppy, wet, radius, flag, impact, count } = this;
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
    let agSum = 0;
    let agN = 0;

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
          agSum += sp * s;
          agN++;
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
      impact[i] = 0;
    }
    this.agitation = agN ? agSum / agN : 0;
  }

  // Fabric compaction. The load a piece carries is read off the contact
  // network rather than off the solver's corrections, which are mostly
  // iteration noise. Every piece weighs its mass in the effective gravity at
  // its centroid, gravity less buoyancy plus the centrifugal term, and, taken
  // from the top of the pile down, hands that weight and whatever has landed
  // on it to the pieces and the wall it rests on, split by how many contacts
  // point along that gravity. What arrives from above plus half its own
  // weight is the pressure across it, in particle weights per particle. The
  // lattice then shortens along the effective gravity by a compaction law, so
  // the bottom of the pile is pressed flat by what is on it, a load pinned to
  // the wall in a spin is pressed thin by the centrifugal field, and a piece
  // under water, being buoyant, hardly compacts at all. Cloth packs faster
  // than it lofts back, hence the two time constants.
  updateCompression(dt, water, omega, sub) {
    const { px, py, radius, invMass, cA, cB, cRest, bodies, order, share } = this;
    const k = this.cfg.compress;
    const B = this.maxBodies;
    const g = this.cfg.gravity;
    const w2 = omega * omega;
    const hasWater = water.active;
    const cosT = Math.cos(water.tilt);
    const sinT = Math.sin(water.tilt);
    const ys = water.surfaceY;
    const beta = water.cfg.buoyancy;
    const n = bodies.length;

    for (let bi = 0; bi < n; bi++) {
      const b = bodies[bi];
      let cx = 0;
      let cy = 0;
      let mass = 0;
      let wetted = 0;
      const end = b.start + b.n;
      for (let i = b.start; i < end; i++) {
        const x = px[i];
        const y = py[i];
        cx += x;
        cy += y;
        mass += 1 / invMass[i];
        if (hasWater) {
          const yr = -x * sinT + y * cosT;
          const d = (yr - ys) / (2 * radius[i]) + 0.5;
          if (d > 0) wetted += d > 1 ? 1 : d;
        }
      }
      cx /= b.n;
      cy /= b.n;
      const gx = w2 * cx;
      const gy = w2 * cy + g * (1 - (beta * wetted) / b.n);
      const gm = Math.hypot(gx, gy) || 1e-9;
      b.nx = gx / gm;
      b.ny = gy / gm;
      b.weight = (mass * gm) / g;
      b.height = -(cx * b.nx + cy * b.ny);
      b.incoming = 0;
      b.idx = bi;
    }

    // Top of the pile first, so a piece has everything on it before it hands
    // its load down. Only pieces lower than it can carry it, which also keeps
    // a pair whose contact normals disagree from passing load in a loop.
    order.length = 0;
    for (const b of bodies) order.push(b);
    order.sort((a, b) => b.height - a.height);
    const { contactX, contactY, contactN } = this;
    const perSub = 1 / sub;
    const perPair = 1 / (sub * this.cfg.pairIterations);
    for (const a of order) {
      const total = a.weight + a.incoming;
      let sum = 0;
      let wall = 0;
      if (a.wallN > 0) {
        const l = Math.hypot(a.wallX, a.wallY) || 1;
        const align = (a.wallX * a.nx + a.wallY * a.ny) / l;
        if (align > k.align) wall = align * a.wallN * perSub;
      }
      sum += wall;
      for (let bj = 0; bj < n; bj++) {
        share[bj] = 0;
        const b = bodies[bj];
        if (b === a || b.height >= a.height) continue;
        const lo = a.idx < bj ? a.idx : bj;
        const hi = a.idx < bj ? bj : a.idx;
        const key = lo * B + hi;
        const cnt = contactN[key];
        if (!cnt) continue;
        const sgn = a.idx < bj ? 1 : -1;
        const l = Math.hypot(contactX[key], contactY[key]) || 1;
        const align = (sgn * (contactX[key] * a.nx + contactY[key] * a.ny)) / l;
        if (align <= k.align) continue;
        share[bj] = align * cnt * perPair;
        sum += share[bj];
      }
      if (sum <= 0) continue;
      for (let bj = 0; bj < n; bj++) {
        if (share[bj] > 0) bodies[bj].incoming += (total * share[bj]) / sum;
      }
    }
    contactX.fill(0);
    contactY.fill(0);
    contactN.fill(0);

    const kPress = 1 - Math.exp(-dt / k.tauPress);
    const kRelax = 1 - Math.exp(-dt / k.tauRelax);
    for (const b of bodies) {
      const stress = (b.incoming + 0.5 * b.weight) / b.n;
      b.load += (stress - b.load) * (stress > b.load ? kPress : kRelax);
      const over = b.load - k.s0;
      b.press = over > 0 ? k.max * (1 - Math.exp(-over / k.s1)) : 0;
      b.wallN = 0;
      b.wallX = 0;
      b.wallY = 0;

      const cons = b.tpl.constraints;
      const cend = b.cStart + b.cN;
      if (b.press < 0.005) {
        for (let c = b.cStart, j = 0; c < cend; c++, j++) cRest[c] = cons[j].rest;
        continue;
      }
      // A uniaxial squeeze by s along n takes a unit vector u to length
      // sqrt(1 - (1 - s^2)(u.n)^2). Every constraint follows that one affine
      // map, so the structural and shear members agree instead of fighting.
      const sq = 1 - b.press;
      const q = 1 - sq * sq;
      const nx = b.nx;
      const ny = b.ny;
      for (let c = b.cStart, j = 0; c < cend; c++, j++) {
        const ia = cA[c];
        const ib = cB[c];
        const dx = px[ib] - px[ia];
        const dy = py[ib] - py[ia];
        const L2 = dx * dx + dy * dy;
        if (L2 < 1e-12) {
          cRest[c] = cons[j].rest;
          continue;
        }
        const p = dx * nx + dy * ny;
        cRest[c] = cons[j].rest * Math.sqrt(1 - (q * p * p) / L2);
      }
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
