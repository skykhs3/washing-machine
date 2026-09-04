const TWO_PI = Math.PI * 2;

const smoothstep = (a, b, x) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Foam is air entrained into a surfactant solution: it needs detergent and
// mechanical work at the free surface, and it lives as a volume that builds
// to a plateau rather than a fixed number of bubbles on a line.
export class Foam {
  constructor(cfg) {
    this.cfg = cfg;
    this.max = cfg.max;
    this.items = [];
    this.volume = 0;
    this.splashAir = 0;
    this.sites = [];
    this.dense = [];
    this.spawnAcc = 0;
    this.still = false;
    this.fr = 0;
    this.tumble = 0;
    this.gen = 0;
    this.capacity = 0;
    this.rScale = 1;
    this.head = 0;
  }

  // A body fell through the surface: it drags a packet of air under with it.
  // Entrainment above a critical impact speed follows a power law. The speed is
  // taken relative to splashRef so splashEntrain reads directly as the foam a
  // reference landing adds, which keeps one garment from saturating the head
  // and leaves the plateau to the kinetics in update().
  splash(e, tilt) {
    const c = this.cfg;
    const over = e.strength - c.splashMin;
    if (over <= 0) return;
    this.splashAir += c.splashEntrain * (over / c.splashRef) ** c.entrainExp;
    if (this.sites.length >= 8) return;
    const cs = Math.cos(tilt);
    const sn = Math.sin(tilt);
    this.sites.push({
      x: e.x * cs + e.y * sn,
      y: -e.x * sn + e.y * cs,
      k: Math.min(1, over / 6),
    });
  }

  update(dt, s) {
    const c = this.cfg;
    const { water, drum, agitation, surfactant, gravity, time } = s;
    const items = this.items;

    // Air entrainment needs the load to plunge through the surface. Below the
    // centrifuging threshold (Froude number Fr = w^2 R / g < 1) gravity wins at
    // the top of the drum, so laundry rides up the wall and drops back through
    // the water. Above it everything is pinned to the wall in near rigid-body
    // rotation, the plunging stops and entrainment collapses. With R = 1 the
    // threshold sits at w = sqrt(g), about 60 RPM, same as a real machine.
    const w2 = drum.omega * drum.omega;
    this.fr = w2 / gravity;
    this.tumble = 1 - smoothstep(c.frLow, c.frHigh, this.fr);
    const depth = water.active ? Math.min(1, water.level / c.dryLevel) : 0;
    const plunge = Math.max(0, agitation - c.agitationMin) ** c.entrainExp;
    // Water pouring in is a plunging jet, the textbook air-entraining flow, so
    // filling foams up on its own even with the drum stopped.
    const jet = water.target > water.level + 0.005 ? c.fillEntrain : 0;
    const splashGate = surfactant * this.tumble * depth;
    this.gen = surfactant * (this.tumble * depth * c.entrain * plunge + jet);

    // dV/dt = G (1 - V) - V/tau. Generation saturates because there is only so
    // much interface a given amount of surfactant can stabilise, and decay
    // covers liquid drainage from the lamellae, film rupture and coarsening.
    // So foam climbs to a plateau over tens of seconds instead of growing
    // without bound, and sags back once the agitation stops.
    const tau = c.tau * (0.2 + 0.8 * surfactant);
    // A strong centrifugal field drains the films and shears the foam apart,
    // so above the threshold it breaks down far faster than it would at rest.
    const shear = 1 + c.shearDecay * smoothstep(c.frHigh, c.shearFr, this.fr);
    // Draining pulls the liquid out from under the head, so the films thin and
    // rupture as the level falls rather than only once the tub is empty.
    const dry = 1 - Math.min(1, water.level / c.dryLevel);
    const collapse = (1 + c.drainCollapse * dry) * shear;
    const room = 1 - this.volume;
    this.volume += (this.gen * room - (this.volume / tau) * collapse) * dt;
    // Several bodies can land in the same frame, so cap what one frame adds.
    this.volume += splashGate * Math.min(this.splashAir, c.splashAirMax) * room;
    this.volume = clamp01(this.volume);
    this.splashAir = 0;

    // The volume is a fraction of what this concentration can hold. Surfactant
    // is what stabilises the interface, so the plateau itself grows with the
    // dose, faster than linearly, and at the top of the slider it is the whole
    // drum. A dose change is eased in so the head swells rather than jumping.
    const capTarget = clamp01((surfactant * c.defaultLevel) ** c.capacityExp);
    this.capacity += (capTarget - this.capacity) * (1 - Math.exp(-dt / c.capTau));
    this.rScale = 1 + c.radiusGain * this.capacity;

    const ys = water.surfaceY;
    // ys + 1 is the room between the surface and the top of the drum.
    const head = this.capacity * this.volume * (ys + 1) * c.headRoom;
    this.head = head;
    // Bubbles scale up with the head as well as multiplying, so a full drum
    // takes a few hundred large ones rather than thousands of small ones.
    const target = Math.round(this.volume * this.max * this.capacity ** c.countExp);

    // Retire the oldest first when the foam is shrinking. Only the ones still
    // alive count against the target: a bubble already fading out is on its
    // way to the target, so counting it as surplus would retire a replacement
    // for it every frame until the whole head had been marked.
    let alive = 0;
    for (let i = 0; i < items.length; i++) {
      if (!items[i].dying) alive++;
    }
    let over = alive - target;
    for (let i = 0; i < items.length && over > 0; i++) {
      if (!items[i].dying) {
        items[i].dying = true;
        over--;
      }
    }

    // Refill toward the target, fast enough to track but not in one jump.
    if (alive < target) {
      this.spawnAcc += (target - alive) * 3 * dt;
      while (this.spawnAcc >= 1 && alive < target && items.length < this.max) {
        this.spawnAcc -= 1;
        items.push(this.spawn(water, surfactant));
        alive++;
      }
    } else {
      this.spawnAcc = 0;
    }

    const cs = Math.cos(water.tilt);
    const sn = Math.sin(water.tilt);

    for (let i = items.length - 1; i >= 0; i--) {
      const b = items[i];
      b.age += dt;

      // Ostwald ripening: gas diffuses out of small bubbles into large ones,
      // so the mean radius grows like sqrt(t). dr/dt = k/r reproduces that.
      b.r += (c.coarsen / b.r) * dt;

      const bx = b.x;
      const by = b.y;
      const rad = Math.hypot(bx, by) || 1;
      // Effective gravity in the rotating drum: gravity plus centrifugal.
      const gx = w2 * bx + gravity * sn;
      const gy = w2 * by + gravity * cs;
      // Component along the wall's inward normal. Negative means the wall is
      // holding the foam up; positive means the wall overhangs it and gravity
      // is peeling it off. The centrifugal part is purely radial and always
      // contributes negatively, which is why foam stays smeared on at speed.
      const onWall = !b.sub && rad > c.clingRadius && by < ys;
      const gn = onWall ? -(gx * bx + gy * by) / rad : 0;
      if (b.sub) {
        // A bubble is buoyant, so it accelerates along -g_eff and rises against
        // the local effective gravity. At high spin the centrifugal term
        // dominates and bubbles migrate toward the rotation axis instead of
        // straight up.
        const gm = Math.hypot(gx, gy) || 1;
        // Terminal velocity: Stokes drag gives v proportional to r^2, and large
        // bubbles cap out once they deform and shed a wake.
        const vt = Math.min(c.riseCap, c.stokes * b.r * b.r) * (gm / gravity);
        // Drag dominates inertia at this size, so the bubble sits at its
        // terminal velocity rather than accelerating toward it.
        b.vx = -water.swirl * by - (gx / gm) * vt;
        b.vy = water.swirl * bx - (gy / gm) * vt;
        b.x = bx + b.vx * dt;
        b.y = by + b.vy * dt;
        if (b.y <= ys) b.sub = false;
        if (b.y > 1 - b.r) b.y = 1 - b.r;
      } else if (onWall && gn <= 0) {
        // Held against the wall, so it cannot fall off: it can only shear along
        // the wall. Foam is a yield-stress material, so it slides only where the
        // gravitational shear beats its yield stress and otherwise stays put.
        // That is why foam runs down a wall in sheets instead of dropping.
        const tx = -by / rad;
        const ty = bx / rad;
        const gt = gx * tx + gy * ty;
        const excess = Math.abs(gt) - c.yieldStress;
        const creep = excess > 0 ? Math.sign(gt) * excess * c.creep : 0;
        // It also rides with the wall, which grips it far harder than gravity.
        const vt = drum.omega * rad + creep;
        b.vx = tx * vt;
        b.vy = ty * vt;
        b.x = bx + b.vx * dt;
        b.y = by + b.vy * dt;
        // Sliding is along the wall, so pin the radius back after the step.
        const r2 = Math.hypot(b.x, b.y);
        if (r2 > 1e-6) {
          const keep = Math.min(rad, 1 - b.r);
          b.x = (b.x / r2) * keep;
          b.y = (b.y / r2) * keep;
        }
        // Carried back under the waterline: it is a bubble in the water again.
        if (b.y > ys) b.sub = true;
      } else if (by < ys - head - b.r) {
        // Above the head, unsupported: a blob of foam falling through air. It is
        // mostly gas, so it weighs almost nothing and the drag is large, which
        // is why suds drift down slowly instead of dropping like water.
        // The drum drags the air around with it, and drag relaxes the blob
        // toward that flow, so falling suds spiral down rather than drop.
        const ax = -water.swirl * by * c.airSwirl;
        const ay = water.swirl * bx * c.airSwirl;
        const k = Math.exp(-c.airDrag * dt);
        b.vx = ax + (b.vx - ax + gx * c.airGravity * dt) * k;
        b.vy = ay + (b.vy - ay + gy * c.airGravity * dt) * k;
        b.x = bx + b.vx * dt;
        b.y = by + b.vy * dt;
      } else {
        // In the head: settle into the layer and drift with the surface flow.
        const rest = ys - b.slot * head - b.r * 0.5;
        const wobble = this.still ? 0 : Math.sin(time * 3 + b.phase) * c.wobble;
        b.vy = (rest - by) * c.settleRate;
        b.vx = -water.swirl * by + wobble;
        b.y = by + b.vy * dt;
        b.x = bx + b.vx * dt;
      }

      const limit = Math.sqrt(Math.max(0, 1 - b.y * b.y)) - b.r - 0.01;
      if (b.x > limit) b.x = limit;
      else if (b.x < -limit) b.x = -limit;

      if (b.r > b.pop || b.age > b.ttl || !water.active) b.dying = true;
      b.fade = b.dying ? b.fade - dt * 2 : Math.min(1, b.fade + dt * 3);
      if (b.fade <= 0) items.splice(i, 1);
    }

    this.cohere(dt);
    this.sites.length = 0;
  }

  // Real foam is a yield-stress material, not a bag of independent bubbles: it
  // packs, sags and shears off a wall in clumps rather than as separate falling
  // spheres. Sharing velocity with touching neighbours and keeping them out of
  // deep overlap reproduces that cohesion without a foam rheology. Only the
  // dense phase above the surface takes part; bubbles down in the water are a
  // dilute suspension and do move independently.
  cohere(dt) {
    const c = this.cfg;
    const dense = this.dense;
    dense.length = 0;
    for (const b of this.items) {
      if (!b.sub) dense.push(b);
    }
    const blend = 1 - Math.exp(-c.cohesion * dt);
    for (let i = 0; i < dense.length; i++) {
      const a = dense[i];
      for (let j = i + 1; j < dense.length; j++) {
        const b = dense[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const reach = (a.r + b.r) * c.contact;
        if (d2 > reach * reach || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const mvx = (a.vx + b.vx) * 0.5;
        const mvy = (a.vy + b.vy) * 0.5;
        a.vx += (mvx - a.vx) * blend;
        a.vy += (mvy - a.vy) * blend;
        b.vx += (mvx - b.vx) * blend;
        b.vy += (mvy - b.vy) * blend;
        const push = (reach - d) * 0.25;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }

  spawn(water, surfactant) {
    const c = this.cfg;
    const ys = water.surfaceY;
    const r = (c.minRadius + Math.random() * (c.maxRadius - c.minRadius)) * this.rScale;
    const site = this.sites.length ? this.sites[Math.floor(Math.random() * this.sites.length)] : null;
    let x;
    let y;
    if (site) {
      x = site.x + (Math.random() - 0.5) * 0.25;
      y = site.y + Math.random() * 0.35 * site.k;
    } else {
      x = (Math.random() * 2 - 1) * 0.8;
      y = ys + Math.random() * Math.max(0.05, (1 - ys) * 0.5);
    }
    const limit = Math.sqrt(Math.max(0, 1 - y * y)) - r - 0.02;
    if (x > limit) x = limit;
    else if (x < -limit) x = -limit;
    return {
      x,
      y,
      r,
      pop: c.popRadius * this.rScale,
      slot: Math.random(),
      vx: 0,
      vy: 0,
      age: 0,
      ttl: (3 + Math.random() * 5) * (0.35 + 1.3 * surfactant),
      fade: 0,
      dying: false,
      sub: true,
      phase: Math.random() * TWO_PI,
    };
  }
}

export class FoamLayer {
  constructor(pal) {
    this.rgb = pal.foam;
    this.low = false;
  }

  setLowQuality(low) {
    this.low = low;
  }

  // Submerged bubbles. Drawn before the front water tint so the tint washes
  // over them and they read as being inside the water. They are sparse enough
  // that individual circles do not pile up into blotches.
  drawBulk(ctx, foam, water) {
    const items = foam.items;
    if (!items.length || !water.active) return;
    ctx.save();
    ctx.rotate(water.tilt);
    for (const b of items) {
      if (!b.sub) continue;
      const a = 0.32 * b.fade;
      if (a <= 0.004) continue;
      ctx.strokeStyle = `rgba(${this.rgb},${a.toFixed(3)})`;
      ctx.lineWidth = b.r * 0.45;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.8, 0, TWO_PI);
      ctx.stroke();
      ctx.fillStyle = `rgba(${this.rgb},${(a * 0.5).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.6, 0, TWO_PI);
      ctx.fill();
    }
    ctx.restore();
  }

  // The foam head. Bubbles here overlap heavily, so the mass goes into one
  // path filled once: individually stroked translucent circles would darken
  // wherever they cross and read as blotches instead of a single body of foam.
  drawRaft(ctx, foam, water, waterLayer, time) {
    const items = foam.items;
    if (!items.length || foam.volume <= 0.002) return;
    const head = foam.head;
    ctx.save();
    ctx.rotate(water.tilt);

    // Wet base of the head, stroked along the surface so it follows the waves
    // instead of sitting under a straight edge.
    if (water.active && head > 0.01) {
      ctx.save();
      ctx.translate(0, -Math.min(0.12, head * 0.28));
      waterLayer.surfacePath(ctx, water, time, false);
      ctx.lineWidth = Math.min(0.45, head * 0.75);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(${this.rgb},${(0.14 + 0.18 * foam.volume).toFixed(3)})`;
      ctx.stroke();
      ctx.restore();
    }

    let any = false;
    ctx.beginPath();
    for (const b of items) {
      if (b.sub || b.fade <= 0.05) continue;
      ctx.moveTo(b.x + b.r, b.y);
      ctx.arc(b.x, b.y, b.r, 0, TWO_PI);
      any = true;
    }
    if (any) {
      // Suds are opaque white, so the more of the drum the head fills, the
      // less of what is behind it shows through.
      const fill = head / (water.surfaceY + 1);
      const alpha = Math.min(0.85, 0.38 + 0.24 * foam.volume + 0.25 * fill);
      ctx.fillStyle = `rgba(${this.rgb},${alpha.toFixed(3)})`;
      ctx.fill();
    }

    if (!this.low) {
      for (const b of items) {
        if (b.sub || b.fade <= 0.2) continue;
        ctx.fillStyle = `rgba(${this.rgb},${(0.5 * b.fade).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.34, b.y - b.r * 0.34, b.r * 0.26, 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
