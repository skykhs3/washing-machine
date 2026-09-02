const TWO_PI = Math.PI * 2;

// The door is a thick convex pane. What sells it is not the shape of the
// highlights but three things that fall out of how glass actually reflects:
// the room it mirrors (bright ceiling overhead, dark floor below), Fresnel
// reflectance climbing steeply toward the rim so the edge reads as a mirror
// while the middle stays clear, and highlights with a hot core and a soft
// falloff instead of flat cutouts. Everything here is static, because a
// reflection is fixed to the viewer and the room, not to the drum.
export class GlassLayer {
  constructor(pal) {
    this.pal = pal;
    this.pad = 1.28;
    this.cache = document.createElement('canvas');
  }

  rebuild(vp) {
    const pal = this.pal;
    const S = Math.ceil(2 * this.pad * vp.R * vp.dpr);
    const c = this.cache;
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    const k = vp.R * vp.dpr;
    g.setTransform(k, 0, 0, k, S / 2, S / 2);

    const disc = () => {
      g.beginPath();
      g.arc(0, 0, 1, 0, TWO_PI);
    };
    const wash = (style) => {
      g.fillStyle = style;
      disc();
      g.fill();
    };

    g.save();
    disc();
    g.clip();

    // Contact shadow where the gasket wraps over the edge of the pane.
    const shadow = g.createRadialGradient(0, 0, 0.78, 0, 0, 1);
    shadow.addColorStop(0, 'rgba(0,0,0,0)');
    shadow.addColorStop(1, 'rgba(0,0,0,0.62)');
    wash(shadow);

    // The room in the pane. A convex surface squeezes the whole floor-to-
    // ceiling span into the aperture, so the upper half picks up a cool cast
    // from the ceiling and the lower half goes nearly black.
    const env = g.createLinearGradient(0, -1, 0, 1);
    env.addColorStop(0, `rgba(${pal.sky},0.085)`);
    env.addColorStop(0.4, `rgba(${pal.sky},0.02)`);
    env.addColorStop(0.58, 'rgba(0,0,0,0.05)');
    env.addColorStop(1, 'rgba(0,0,0,0.26)');
    wash(env);

    // Fresnel. Reflectance rises steeply toward grazing incidence, which
    // Schlick approximates as R = R0 + (1 - R0)(1 - cos t)^5. On a convex pane
    // the incidence angle grazes as the radius grows, so that becomes a steep
    // function of the radius: a mirror-bright rim over a clear centre.
    const fresnel = g.createRadialGradient(0, 0, 0.72, 0, 0, 1);
    fresnel.addColorStop(0, 'rgba(255,255,255,0)');
    fresnel.addColorStop(0.62, 'rgba(255,255,255,0.012)');
    fresnel.addColorStop(0.86, 'rgba(255,255,255,0.05)');
    fresnel.addColorStop(0.96, `rgba(${pal.sky},0.16)`);
    fresnel.addColorStop(1, 'rgba(255,255,255,0.3)');
    wash(fresnel);

    // A rim is only bright where it has something bright to mirror, so the
    // lower edge, which is busy reflecting the floor, gets knocked back.
    const floor = g.createLinearGradient(0, 0.1, 0, 1);
    floor.addColorStop(0, 'rgba(0,0,0,0)');
    floor.addColorStop(1, 'rgba(0,0,0,0.32)');
    wash(floor);

    // Diffuse sheen off the window to the upper left.
    const sheen = g.createRadialGradient(-0.34, -0.44, 0.02, -0.34, -0.44, 0.9);
    sheen.addColorStop(0, 'rgba(255,255,255,0.1)');
    sheen.addColorStop(0.38, 'rgba(255,255,255,0.022)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    wash(sheen);

    // Specular reflections of that window, stretched by the curvature. The
    // small offset copy is the reflection off the pane's back surface, which
    // any thick pane shows alongside the front one.
    streak(g, -0.36, -0.52, -0.62, 0.33, 0.07, 0.3);
    streak(g, -0.19, -0.35, -0.62, 0.12, 0.03, 0.12);
    streak(g, 0.42, 0.55, -0.62, 0.19, 0.045, 0.05);

    g.restore();

    annulus(g, 1.0, 1.075);
    g.fillStyle = pal.gasket;
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 0.008;
    g.beginPath();
    g.arc(0, 0, 1.004, 0, TWO_PI);
    g.stroke();

    // Polished metal mirrors the room in bands rather than a single ramp: light
    // off the ceiling, a dark horizon, then a second lift off the floor.
    const chrome = g.createLinearGradient(-0.85, -1.15, 0.85, 1.15);
    chrome.addColorStop(0, pal.chrome[0]);
    chrome.addColorStop(0.16, pal.chrome[1]);
    chrome.addColorStop(0.38, pal.chrome[2]);
    chrome.addColorStop(0.5, pal.chrome[3]);
    chrome.addColorStop(0.63, pal.chrome[2]);
    chrome.addColorStop(0.84, pal.chrome[1]);
    chrome.addColorStop(1, pal.chrome[4]);
    annulus(g, 1.075, 1.18);
    g.fillStyle = chrome;
    g.fill();

    // Grazing highlight along the top of the bezel, where it faces the light.
    const bezel = g.createLinearGradient(0, -1.18, 0, -1.0);
    bezel.addColorStop(0, 'rgba(255,255,255,0.3)');
    bezel.addColorStop(1, 'rgba(255,255,255,0)');
    annulus(g, 1.075, 1.18);
    g.fillStyle = bezel;
    g.fill();

    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 0.012;
    g.beginPath();
    g.arc(0, 0, 1.18, 0, TWO_PI);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.006;
    g.beginPath();
    g.arc(0, 0, 1.075, 0, TWO_PI);
    g.stroke();

    hinges(g, pal);
  }

  draw(ctx, vp) {
    const size = 2 * this.pad * vp.R;
    ctx.drawImage(this.cache, vp.cx - size / 2, vp.cy - size / 2, size, size);
  }
}

// A soft elliptical specular blob: hot core, gradient falloff, no hard edge.
function streak(g, cx, cy, rot, len, wide, alpha) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.scale(len, wide);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, `rgba(255,255,255,${alpha})`);
  gr.addColorStop(0.3, `rgba(255,255,255,${(alpha * 0.6).toFixed(3)})`);
  gr.addColorStop(0.68, `rgba(255,255,255,${(alpha * 0.16).toFixed(3)})`);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, 1, 0, TWO_PI);
  g.fill();
  g.restore();
}

// Two hinge tabs on the left, so which side the door swings from is readable.
function hinges(g, pal) {
  for (const y of [-0.44, 0.44]) {
    roundRect(g, -1.235, y - 0.085, 0.2, 0.17, 0.05);
    const grad = g.createLinearGradient(0, y - 0.085, 0, y + 0.085);
    grad.addColorStop(0, pal.chrome[2]);
    grad.addColorStop(1, pal.chrome[4]);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 0.007;
    g.stroke();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function annulus(g, r0, r1) {
  g.beginPath();
  g.arc(0, 0, r1, 0, TWO_PI);
  g.arc(0, 0, r0, TWO_PI, 0, true);
  g.closePath();
}
