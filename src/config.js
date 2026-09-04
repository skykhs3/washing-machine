const TUMBLE = [[1, 12], [0, 3], [-1, 12], [0, 3]];
const SHORT_SPIN = [[60, 20], [120, 80], [0, 20]];
const FINAL_SPIN = [[60, 60], [120, 90], [200, 390], [0, 60]];

// Parts every piece of a kind shares. A tee has the same collar curve, armhole
// seam and hem whatever it is printed with, and a sock the same cuff, toe cap
// and heel patch, so those are written once and a design only says what colour
// they come in. Anything a design draws differently stays inline. The marks are
// only ever read, so one object can serve every design that wears it.
const teeCollar = (color, w = 0.28) => ({ t: 'band', pts: [[2.05, 0.06], [3, 0.58], [3.95, 0.06]], w, color });
const teeSleeveHem = (color) => ({ t: 'seam', pts: [[0.18, -0.45], [0.18, 0.5]], mirror: true, w: 0.1, color });
const TEE_ARMHOLE = { t: 'seam', pts: [[0.62, -0.5], [0.62, 0.55]], mirror: true, w: 0.09, color: { shade: 0.24 } };
const TEE_HEM = { t: 'seam', pts: [[0.75, 2.85], [5.25, 2.85]], w: 0.08, color: { shade: 0.22 } };
const sockCuff = (color, w = 0.32) => ({ t: 'band', pts: [[1.9, 0.28], [3.3, 0.28]], w, color });
const sockToe = (color) => ({ t: 'band', pts: [[0.05, 2.02], [0.85, 2.02]], w: 1.3, color });
const sockHeel = (color) => ({ t: 'band', pts: [[3.1, 1.9], [3.1, 2.12]], w: 1.25, color });
// Ribbing down the leg. It has to stop short of v 1.5, where the nearest cell
// stops being the leg and becomes the foot and a rib would bend into the sole.
const sockRib = (color, w = 0.09) => [1.9, 2.4, 2.9, 3.4].map((u) => ({
  t: 'seam',
  pts: [[u, 0.55], [u, 1.4]],
  w,
  color,
}));
const towelHem = (color, w = 0.09) => [0.12, 3.88].map((v) => ({
  t: 'seam',
  pts: [[-0.35, v], [2.35, v]],
  w,
  color,
}));


export const CONFIG = {
  physics: {
    dt: 1 / 120,
    maxStepsPerFrame: 4,
    maxFrameDt: 0.1,
    iterations: 5,
    pairIterations: 2,
    gravity: 39,
    wallFriction: 0.5,
    wallRestitution: 0.1,
    structuralStiffness: 1.0,
    shearStiffness: 0.3,
    particleRadius: 0.045,
    spacing: 0.1,
    maxParticles: 512,
    maxConstraints: 2048,
    maxSpeed: 40,
    maxStepDisplacement: 0.35,
    airDrag: 0.3,
    substepMove: 0.06,
    maxSubsteps: 3,
    lifter: { count: 3, outer: 1.03, inner: 0.88, radius: 0.06 },
    wetMassGain: 1.5,
    wetRate: 3,
    dryRate: 20,
    dryOmega: 10,
    escapeRadius: 1.2,
    // Fabric compaction. A piece carries the weight of whatever rests on it
    // (see World.updateCompression) and its lattice shortens along the
    // effective gravity by up to `max`. That has to stay below 0.55, or
    // particles two rows apart come within a particle diameter of each other
    // and start colliding with their own piece. `s0` is the pressure, in
    // particle weights per particle, below which nothing gives; `s1` sets how
    // fast compaction saturates above it; `align` is the cosine a contact
    // needs with the effective gravity to count as support; `band` is how far
    // the target has to move before the compaction follows it; `stillSpeed`
    // is the speed relative to the drum below which a piece counts as at rest
    // and `stillTime` how long it has to stay there; `phiRate` caps how fast,
    // in rad/s, the tracked orientation may be corrected toward the best fit;
    // `spinJitter` × w² × h is the numerical jitter of a load riding the drum,
    // taken off that speed; compaction fades out between `packLow` and
    // `packHigh`, the load's lattice area over the drum's, because past about
    // one the load only fits folded over itself.
    compress: {
      max: 0.45,
      s0: 0.6,
      s1: 3,
      tauPress: 0.8,
      tauRelax: 2,
      align: 0.55,
      band: 0.05,
      stillSpeed: 0.15,
      stillTime: 0.4,
      phiRate: 1.2,
      spinJitter: 0.5,
      packLow: 0.85,
      packHigh: 1.05,
    },
  },

  motor: {
    accelWash: 3,
    accelSpinUp: 1.2,
    accelSpinDown: 1.5,
    accelManual: 6,
    // Coming to a stop is the brake, not a programmed speed change, so it is
    // firmer than accelSpinDown: a pause from a full spin settles in a few
    // seconds instead of drifting down for a quarter of a minute. Reduced
    // motion gets the same stop without the coast to watch.
    pauseDecel: 6,
    reducedMotionPauseDecel: 40,
    maxRpm: 240,
    reducedMotionMaxRpm: 90,
  },

  // The course rates are the real thing: at `fillRate` the 180 s fill stage
  // takes 159 s to reach its level, and at `drainRate` the 90 s drain takes
  // 78 s to empty. MANUAL hands the valve and the pump to the user, and
  // waiting minutes for a slider is not watching a machine, so there the two
  // run faster: the whole drum fills in about 30 s and empties in about 15,
  // quick enough that the slider answers and slow enough to watch it move.
  water: {
    fillRate: 0.0022,
    drainRate: 0.0045,
    manualFillRate: 0.033,
    manualDrainRate: 0.066,
    tiltGain: 0.04,
    tiltMax: 0.44,
    tiltTau: 0.6,
    swirlRatio: 0.3,
    swirlTau: 0.8,
    buoyancy: 0.85,
    linearDrag: 2.0,
    quadDrag: 3.0,
    manualLevel: 0.35,
  },

  // Laundry. `mask` is the cell grid the soft body is built from, `scale`
  // shrinks the whole piece, `pieces` is how many go in per press of the
  // button, and each design carries its own colours plus the marks that make
  // it read as a garment. Mark coordinates are continuous grid coordinates
  // (u across columns, v down rows) resolved against the deformed particles,
  // so seams and bands bend with the cloth. Coordinates outside the mask are
  // extrapolated and clipped by the silhouette, which is how hems reach the
  // edge instead of stopping short of it.
  //
  // The colours are the ones a wardrobe actually holds. A design's place in
  // the list is saved with the load, so an entry may change what it wears but
  // new ones go on the end.
  laundry: {
    max: 20,
    spawnInterval: 0.4,
    removeFade: 0.5,
    spawnY: -0.55,
    types: {
      tshirt: {
        mask: ['#######', '.#####.', '.#####.', '.#####.'],
        designs: [
          // Ivory with a navy chest stripe.
          {
            base: '#f1ece2',
            accent: '#2f4f8a',
            marks: [
              { t: 'stripe', rows: [1.3, 2.15], u0: 0.6, u1: 5.4, w: 0.42, color: 'accent' },
              teeCollar('accent'),
              TEE_ARMHOLE,
              TEE_HEM,
            ],
          },
          // Raglan baseball tee, off-white body and red sleeves.
          {
            base: '#f4f1ea',
            accent: '#b8443a',
            marks: [
              { t: 'area', pts: [[-1.2, -1], [1.75, -1], [1.05, 0.95], [-1.2, 0.95]], mirror: true, color: 'accent' },
              teeCollar('accent'),
              TEE_HEM,
            ],
          },
          // Navy print tee: a cream ring screened on the chest.
          {
            base: '#33506e',
            accent: '#e8e2d4',
            marks: [
              { t: 'motif', at: [3, 1.65], r: 0.78, color: 'accent' },
              { t: 'motif', at: [3, 1.65], r: 0.4, color: { shade: 0.3 } },
              teeCollar({ tint: 0.3 }),
              TEE_ARMHOLE,
              TEE_HEM,
            ],
          },
          // Sage pocket tee.
          {
            base: '#6f8f74',
            accent: '#e8ded0',
            marks: [
              { t: 'area', pts: [[1.5, 1.28], [2.85, 1.28], [2.85, 2.35], [1.5, 2.35]], color: { shade: 0.18 } },
              { t: 'seam', pts: [[1.42, 1.22], [2.93, 1.22]], w: 0.15, color: 'accent' },
              teeCollar('accent'),
              TEE_ARMHOLE,
              TEE_HEM,
            ],
          },
          // Red tee with a contrast collar.
          {
            base: '#b5423c',
            accent: '#f7f2e8',
            marks: [
              teeCollar('accent', 0.3),
              TEE_ARMHOLE,
              TEE_HEM,
            ],
          },
          // Plain white tee: nothing but the seams that hold it together.
          {
            base: '#f7f5f0',
            marks: [
              teeCollar({ shade: 0.14 }, 0.26),
              teeSleeveHem({ shade: 0.13 }),
              TEE_ARMHOLE,
              TEE_HEM,
            ],
          },
          // Heather grey with a small chest logo.
          {
            base: '#b7bbc0',
            accent: '#4a5058',
            marks: [
              { t: 'motif', at: [2, 1.3], r: 0.3, color: 'accent' },
              teeCollar({ shade: 0.2 }, 0.26),
              teeSleeveHem({ shade: 0.18 }),
              TEE_ARMHOLE,
              TEE_HEM,
            ],
          },
          // Black tee. Shade would vanish here, so every seam is a tint.
          {
            base: '#2a2c30',
            marks: [
              teeCollar({ tint: 0.16 }, 0.3),
              teeSleeveHem({ tint: 0.12 }),
              { t: 'seam', pts: [[0.62, -0.5], [0.62, 0.55]], mirror: true, w: 0.09, color: { tint: 0.1 } },
              { t: 'seam', pts: [[0.75, 2.85], [5.25, 2.85]], w: 0.08, color: { tint: 0.1 } },
            ],
          },
          // Breton stripe.
          {
            base: '#f2efe8',
            accent: '#22385c',
            marks: [
              { t: 'stripe', rows: [0.95, 1.45, 1.95, 2.45], u0: 0.6, u1: 5.4, w: 0.3, color: 'accent' },
              teeCollar('accent', 0.26),
              TEE_ARMHOLE,
              TEE_HEM,
            ],
          },
        ],
      },

      sock: {
        mask: ['..##', '..##', '####'],
        scale: 0.62,
        pieces: 2,
        designs: [
          // Ivory crew with a dark toe, heel and cuff.
          {
            base: '#e9e4d8',
            accent: '#2f3542',
            marks: [
              sockToe('accent'),
              sockHeel('accent'),
              sockCuff('accent', 0.34),
              { t: 'seam', pts: [[1.9, 0.72], [3.3, 0.72]], w: 0.09, color: { shade: 0.2 } },
            ],
          },
          // Navy crew with two white bands round the cuff.
          {
            base: '#31384f',
            accent: '#eceff3',
            marks: [
              { t: 'stripe', rows: [0.32, 0.76], u0: 1.85, u1: 3.35, w: 0.26, color: 'accent' },
              sockToe({ tint: 0.28 }),
              sockHeel({ tint: 0.2 }),
            ],
          },
          // White sports crew: grey reinforcement, navy cuff lines.
          {
            base: '#f4f2ec',
            accent: '#9aa1a9',
            marks: [
              sockToe('accent'),
              sockHeel('accent'),
              { t: 'stripe', rows: [0.24, 0.46], u0: 1.85, u1: 3.35, w: 0.14, color: '#2f3f5e' },
              { t: 'seam', pts: [[1.9, 0.78], [3.3, 0.78]], w: 0.08, color: { shade: 0.16 } },
            ],
          },
          // Black dress sock, ribbed leg.
          {
            base: '#26282d',
            marks: [
              ...sockRib({ tint: 0.14 }, 0.1),
              sockCuff({ tint: 0.22 }, 0.3),
            ],
          },
          // Heather grey sports sock with a navy cuff.
          {
            base: '#a8adb3',
            accent: '#2f3f5e',
            marks: [
              sockToe({ tint: 0.5 }),
              sockHeel({ tint: 0.5 }),
              sockCuff('accent', 0.38),
              { t: 'seam', pts: [[1.9, 0.82], [3.3, 0.82]], w: 0.09, color: { shade: 0.18 } },
            ],
          },
          // Burgundy ribbed dress sock.
          {
            base: '#6b2f3a',
            marks: [
              ...sockRib({ tint: 0.14 }),
              sockCuff({ shade: 0.2 }, 0.3),
            ],
          },
          // Oatmeal wool sock, chunky rib knit.
          {
            base: '#cdbfa6',
            accent: '#a8977a',
            marks: [
              ...sockRib('accent', 0.16),
              sockCuff({ shade: 0.16 }, 0.4),
              sockToe({ shade: 0.14 }),
            ],
          },
          // Navy and white banded crew.
          {
            base: '#eceae4',
            accent: '#2f3f5e',
            marks: [
              { t: 'stripe', rows: [0.3, 0.75, 1.2], u0: 1.85, u1: 3.35, w: 0.24, color: 'accent' },
              sockToe('accent'),
            ],
          },
        ],
      },

      towel: {
        mask: ['###', '###', '###', '###', '###'],
        designs: [
          // Dusty rose.
          {
            base: '#d99aab',
            accent: '#fbf1f3',
            marks: [
              { t: 'stripe', rows: [0.45, 3.55], u0: -0.4, u1: 2.4, w: 0.36, color: 'accent' },
              { t: 'stripe', rows: [0.75, 3.25], u0: -0.4, u1: 2.4, w: 0.1, color: { shade: 0.18 } },
            ],
          },
          // Soft blue with a woven border.
          {
            base: '#8fbfd4',
            accent: '#2f6f95',
            marks: [
              { t: 'stripe', rows: [0.4, 3.6], u0: -0.4, u1: 2.4, w: 0.34, color: 'accent' },
              { t: 'stripe', rows: [0.85, 3.15], u0: -0.4, u1: 2.4, w: 0.18, color: 'accent' },
              ...towelHem({ shade: 0.2 }, 0.08),
            ],
          },
          // Butter yellow, ribbed lengthwise.
          {
            base: '#eadfa8',
            accent: '#c9a341',
            marks: [
              { t: 'stripe', rows: [1.1, 2.9], u0: -0.4, u1: 2.4, w: 0.16, color: 'accent' },
              { t: 'seam', pts: [[0.55, -0.4], [0.55, 4.4]], w: 0.14, color: 'accent' },
              { t: 'seam', pts: [[1.45, -0.4], [1.45, 4.4]], w: 0.14, color: 'accent' },
              { t: 'stripe', rows: [0.35, 3.65], u0: -0.4, u1: 2.4, w: 0.3, color: 'accent' },
            ],
          },
          // Muted lilac with a fringed end.
          {
            base: '#b0a8c8',
            accent: '#f0edf6',
            marks: [
              { t: 'stripe', rows: [0.5, 3.5], u0: -0.4, u1: 2.4, w: 0.32, color: 'accent' },
              { t: 'seam', pts: [[0.15, -0.18], [0.15, 0.34]], w: 0.11, color: 'accent' },
              { t: 'seam', pts: [[1.0, -0.18], [1.0, 0.34]], w: 0.11, color: 'accent' },
              { t: 'seam', pts: [[1.85, -0.18], [1.85, 0.34]], w: 0.11, color: 'accent' },
              { t: 'seam', pts: [[0.15, 3.66], [0.15, 4.18]], w: 0.11, color: 'accent' },
              { t: 'seam', pts: [[1.0, 3.66], [1.0, 4.18]], w: 0.11, color: 'accent' },
              { t: 'seam', pts: [[1.85, 3.66], [1.85, 4.18]], w: 0.11, color: 'accent' },
            ],
          },
          // White hotel towel: a dobby border in its own colour.
          {
            base: '#f4f2ed',
            accent: '#ddd8cd',
            marks: [
              { t: 'stripe', rows: [0.55, 3.45], u0: -0.4, u1: 2.4, w: 0.2, color: 'accent' },
              { t: 'stripe', rows: [0.78, 3.22], u0: -0.4, u1: 2.4, w: 0.1, color: 'accent' },
              ...towelHem({ shade: 0.12 }, 0.1),
            ],
          },
          // Charcoal. Shade would vanish here, so the border is a tint.
          {
            base: '#5a6068',
            marks: [
              { t: 'stripe', rows: [0.45, 3.55], u0: -0.4, u1: 2.4, w: 0.34, color: { tint: 0.18 } },
              { t: 'stripe', rows: [0.8, 3.2], u0: -0.4, u1: 2.4, w: 0.12, color: { tint: 0.12 } },
              ...towelHem({ tint: 0.1 }),
            ],
          },
          // Navy with a white border.
          {
            base: '#2f4258',
            accent: '#eef1f4',
            marks: [
              { t: 'stripe', rows: [0.5, 3.5], u0: -0.4, u1: 2.4, w: 0.3, color: 'accent' },
              { t: 'stripe', rows: [0.85, 3.15], u0: -0.4, u1: 2.4, w: 0.12, color: 'accent' },
              ...towelHem({ tint: 0.14 }),
            ],
          },
          // Taupe, woven in panels.
          {
            base: '#cbb9a2',
            accent: '#a08d74',
            marks: [
              { t: 'seam', pts: [[0.5, -0.4], [0.5, 4.4]], w: 0.12, color: { shade: 0.14 } },
              { t: 'seam', pts: [[1.5, -0.4], [1.5, 4.4]], w: 0.12, color: { shade: 0.14 } },
              { t: 'stripe', rows: [0.4, 3.6], u0: -0.4, u1: 2.4, w: 0.3, color: 'accent' },
              ...towelHem({ shade: 0.18 }),
            ],
          },
        ],
      },

      pants: {
        mask: ['#####', '#####', '##.##', '##.##', '##.##'],
        designs: [
          // Indigo jeans, topstitched in gold.
          {
            base: '#3c5a8a',
            accent: '#d9b26a',
            marks: [
              { t: 'band', pts: [[-0.4, 0.15], [4.4, 0.15]], w: 0.46, color: { shade: 0.2 } },
              { t: 'seam', pts: [[2, 0.5], [2, 1.45]], w: 0.1, color: 'accent' },
              { t: 'seam', pts: [[0.55, 1.1], [1.5, 1.1], [1.5, 1.85]], mirror: true, w: 0.08, color: 'accent' },
              { t: 'seam', pts: [[0.18, 0.45], [0.18, 4.35]], mirror: true, w: 0.09, color: 'accent' },
              { t: 'band', pts: [[-0.35, 3.9], [1.5, 3.9]], mirror: true, w: 0.26, color: { shade: 0.18 } },
            ],
          },
          // Khaki chinos.
          {
            base: '#b9a07a',
            accent: '#8a7350',
            marks: [
              { t: 'band', pts: [[-0.4, 0.15], [4.4, 0.15]], w: 0.44, color: 'accent' },
              { t: 'seam', pts: [[2, 0.5], [2, 1.4]], w: 0.09, color: { shade: 0.22 } },
              { t: 'seam', pts: [[0.18, 0.45], [0.18, 4.35]], mirror: true, w: 0.08, color: { shade: 0.2 } },
              { t: 'band', pts: [[-0.35, 3.95], [1.5, 3.95]], mirror: true, w: 0.22, color: 'accent' },
            ],
          },
          // Black track pants with a double side stripe.
          {
            base: '#2b2f36',
            accent: '#e6e9ee',
            marks: [
              { t: 'seam', pts: [[0.3, 0.5], [0.3, 4.4]], mirror: true, w: 0.15, color: 'accent' },
              { t: 'seam', pts: [[0.62, 0.5], [0.62, 4.4]], mirror: true, w: 0.15, color: 'accent' },
              { t: 'band', pts: [[-0.4, 0.15], [4.4, 0.15]], w: 0.5, color: { tint: 0.16 } },
              { t: 'band', pts: [[-0.35, 4.0], [1.5, 4.0]], mirror: true, w: 0.28, color: { tint: 0.16 } },
            ],
          },
          // Grey trousers.
          {
            base: '#4a4f58',
            accent: '#20242a',
            marks: [
              { t: 'band', pts: [[-0.4, 0.15], [4.4, 0.15]], w: 0.4, color: 'accent' },
              { t: 'seam', pts: [[0.5, 1.9], [0.5, 4.4]], mirror: true, w: 0.1, color: { tint: 0.2 } },
              { t: 'seam', pts: [[2, 0.5], [2, 1.4]], w: 0.09, color: 'accent' },
              { t: 'band', pts: [[-0.35, 4.05], [1.5, 4.05]], mirror: true, w: 0.2, color: 'accent' },
            ],
          },
          // Washed light denim, hems faded pale.
          {
            base: '#7f9dc0',
            accent: '#e2c98a',
            marks: [
              { t: 'band', pts: [[-0.4, 0.15], [4.4, 0.15]], w: 0.46, color: { shade: 0.18 } },
              { t: 'seam', pts: [[2, 0.5], [2, 1.45]], w: 0.1, color: 'accent' },
              { t: 'seam', pts: [[0.55, 1.1], [1.5, 1.1], [1.5, 1.85]], mirror: true, w: 0.08, color: 'accent' },
              { t: 'seam', pts: [[0.18, 0.45], [0.18, 4.35]], mirror: true, w: 0.09, color: 'accent' },
              { t: 'band', pts: [[-0.35, 3.9], [1.5, 3.9]], mirror: true, w: 0.26, color: { tint: 0.24 } },
            ],
          },
          // Black jeans, stitched tone on tone.
          {
            base: '#25272b',
            marks: [
              { t: 'band', pts: [[-0.4, 0.15], [4.4, 0.15]], w: 0.46, color: { tint: 0.14 } },
              { t: 'seam', pts: [[2, 0.5], [2, 1.45]], w: 0.09, color: { tint: 0.18 } },
              { t: 'seam', pts: [[0.55, 1.1], [1.5, 1.1], [1.5, 1.85]], mirror: true, w: 0.08, color: { tint: 0.18 } },
              { t: 'seam', pts: [[0.18, 0.45], [0.18, 4.35]], mirror: true, w: 0.09, color: { tint: 0.12 } },
              { t: 'band', pts: [[-0.35, 3.95], [1.5, 3.95]], mirror: true, w: 0.22, color: { tint: 0.1 } },
            ],
          },
          // Navy chinos with slant pockets.
          {
            base: '#2f3d55',
            accent: '#1e2838',
            marks: [
              { t: 'band', pts: [[-0.4, 0.15], [4.4, 0.15]], w: 0.44, color: 'accent' },
              { t: 'seam', pts: [[2, 0.5], [2, 1.4]], w: 0.09, color: { tint: 0.14 } },
              { t: 'seam', pts: [[0.6, 0.62], [0.6, 1.5]], mirror: true, w: 0.09, color: { tint: 0.12 } },
              { t: 'seam', pts: [[0.18, 0.45], [0.18, 4.35]], mirror: true, w: 0.08, color: { tint: 0.1 } },
              { t: 'band', pts: [[-0.35, 3.95], [1.5, 3.95]], mirror: true, w: 0.22, color: 'accent' },
            ],
          },
          // Grey sweatpants: drawstring at the waist, elastic at the ankles.
          {
            base: '#9aa0a6',
            accent: '#6f757c',
            marks: [
              { t: 'band', pts: [[-0.4, 0.2], [4.4, 0.2]], w: 0.55, color: { shade: 0.12 } },
              { t: 'seam', pts: [[1.78, 0.32], [1.68, 0.85]], mirror: true, w: 0.09, color: 'accent' },
              { t: 'seam', pts: [[0.35, 1.15], [1.45, 1.15]], mirror: true, w: 0.08, color: { shade: 0.16 } },
              { t: 'band', pts: [[-0.35, 4.05], [1.5, 4.05]], mirror: true, w: 0.4, color: { shade: 0.14 } },
            ],
          },
        ],
      },
    },
  },

  // Standard cotton course, about 57 minutes: wash, two rinses with a short
  // spin after each drain, then a 10 minute final spin.
  // `surfactant` is the detergent concentration in the drum at the default
  // dose, not a foam amount: each rinse dilutes what is left. The foam slider
  // scales all of them, and foam volume is derived from the result together
  // with the air the tumbling load actually entrains.
  cycle: {
    stages: [
      { id: 'fill', label: 'fill', phase: 0, duration: 180, rpm: 0, level: 0.35, surfactant: 0.2 },
      { id: 'wash', label: 'wash', phase: 0, duration: 1080, rpm: 45, pattern: TUMBLE, level: 0.35, surfactant: 1 },
      { id: 'drain', label: 'drain', phase: 0, duration: 90, rpm: 0, level: 0, surfactant: 0.2 },
      { id: 'spin1', label: 'spin', phase: 0, duration: 120, rpm: 120, profile: SHORT_SPIN, level: 0, surfactant: 0, spin: true },
      { id: 'rinseFill1', label: 'fill', phase: 1, duration: 150, rpm: 0, level: 0.3, surfactant: 0.08 },
      { id: 'rinse1', label: 'rinse', phase: 1, duration: 300, rpm: 45, pattern: TUMBLE, level: 0.3, surfactant: 0.3 },
      { id: 'drain2', label: 'drain', phase: 1, duration: 90, rpm: 0, level: 0, surfactant: 0.08 },
      { id: 'spin2', label: 'spin', phase: 1, duration: 120, rpm: 120, profile: SHORT_SPIN, level: 0, surfactant: 0, spin: true },
      { id: 'rinseFill2', label: 'fill', phase: 2, duration: 150, rpm: 0, level: 0.3, surfactant: 0.04 },
      { id: 'rinse2', label: 'rinse', phase: 2, duration: 300, rpm: 45, pattern: TUMBLE, level: 0.3, surfactant: 0.18 },
      { id: 'drain3', label: 'drain', phase: 2, duration: 90, rpm: 0, level: 0, surfactant: 0.02 },
      { id: 'spin', label: 'spin', phase: 3, duration: 600, rpm: 200, profile: FINAL_SPIN, level: 0, surfactant: 0, spin: true },
      { id: 'done', label: 'done', phase: 4, duration: 120, rpm: 0, level: 0, surfactant: 0 },
    ],
  },

  // Foam is air entrained into a surfactant solution, so it needs both
  // detergent and mechanical work. Generation is gated by the Froude number
  // (see Foam.update) and the volume follows saturating kinetics, so foam
  // builds to a plateau instead of growing without bound. How much a full
  // plateau is depends on the dose: `defaultLevel` is the slider position that
  // gives a concentration of 1, and the capacity curve reaches the whole
  // drum at the top of the slider. `max` is the bubble count at that point.
  foam: {
    max: 320,
    defaultLevel: 0.35,
    capacityExp: 1.3,
    // How long a dose change takes to reach the foam. The head is the capacity
    // times the volume, so this is what paces the slider: the suds swell and
    // sag over a few seconds rather than snapping to the new dose.
    capTau: 3,
    headRoom: 0.95,
    radiusGain: 1.2,
    countExp: 0.7,
    // Bubble areas the drawn head may stack into its band. Normal use runs at
    // one to one and a half layers, so this only bites where the band is a
    // sliver.
    packing: 3,
    frLow: 0.7,
    frHigh: 1.3,
    agitationMin: 0.35,
    entrainExp: 1.5,
    entrain: 0.04,
    fillEntrain: 0.05,
    splashMin: 1.8,
    splashRef: 6,
    splashEntrain: 0.02,
    splashAirMax: 0.06,
    tau: 60,
    drainCollapse: 4,
    dryLevel: 0.09,
    shearDecay: 3,
    shearFr: 4,
    stokes: 240,
    riseCap: 0.45,
    coarsen: 2e-5,
    minRadius: 0.012,
    maxRadius: 0.042,
    popRadius: 0.055,
    clingRadius: 0.94,
    yieldStress: 8,
    creep: 0.02,
    airGravity: 0.22,
    airDrag: 2.6,
    airSwirl: 0.35,
    settleRate: 3,
    cohesion: 8,
    contact: 0.92,
    wobble: 0.05,
  },

  palette: {
    bodyTop: '#3a3f47',
    bodyBottom: '#22262c',
    band: '#1a1d22',
    bandEdge: '#0e1013',
    brand: 'rgba(255,255,255,0.32)',
    surround: '#15171b',
    drumMetal: '#474d56',
    drumMetalDark: '#262a30',
    hole: '#0f1216',
    rib: '#565d66',
    lifter: '#aab1ba',
    lifterDark: '#6b727b',
    water: '80,150,215',
    foam: '255,255,255',
    gasket: '#1b1e22',
    chrome: ['#f4f7fa', '#e2e6ea', '#8d939a', '#5b6067', '#3f444a'],
    // What the door pane has to mirror overhead.
    sky: '212,226,240',
    led: '#5ff2c8',
    ledDim: 'rgba(95,242,200,0.16)',
    ledBg: '#070a0c',
  },
};
