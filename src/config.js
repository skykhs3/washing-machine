const TUMBLE = [[1, 12], [0, 3], [-1, 12], [0, 3]];
const SHORT_SPIN = [[60, 20], [120, 80], [0, 20]];
const FINAL_SPIN = [[60, 60], [120, 90], [200, 390], [0, 60]];

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
    // needs with the effective gravity to count as support.
    compress: { max: 0.45, s0: 0.6, s1: 3, tauPress: 0.25, tauRelax: 0.9, align: 0.3 },
  },

  motor: {
    accelWash: 3,
    accelSpinUp: 1.2,
    accelSpinDown: 1.5,
    accelManual: 6,
    maxRpm: 240,
    reducedMotionMaxRpm: 90,
  },

  water: {
    fillRate: 0.0022,
    drainRate: 0.0045,
    tiltGain: 0.04,
    tiltMax: 0.44,
    tiltTau: 0.6,
    swirlRatio: 0.3,
    swirlTau: 0.8,
    buoyancy: 0.85,
    linearDrag: 2.0,
    quadDrag: 3.0,
    manualLevel: 0.35,
    // Surface waves. The drive is the largest of the swirl, the agitation of
    // the load under water, and the fill or drain flow, each scaled to its
    // reference; a splash adds strength × splashRipple on top.
    swirlRippleRef: 2.5,
    agitationRippleRef: 1.5,
    fillRipple: 0.45,
    drainRipple: 0.25,
    splashRipple: 0.08,
    rippleRise: 0.3,
    rippleDecay: 1.5,
  },

  // Laundry. `mask` is the cell grid the soft body is built from, `scale`
  // shrinks the whole piece, `pieces` is how many go in per press of the
  // button, and each design carries its own colours plus the marks that make
  // it read as a garment. Mark coordinates are continuous grid coordinates
  // (u across columns, v down rows) resolved against the deformed particles,
  // so seams and bands bend with the cloth. Coordinates outside the mask are
  // extrapolated and clipped by the silhouette, which is how hems reach the
  // edge instead of stopping short of it.
  laundry: {
    max: 20,
    maxLow: 12,
    spawnInterval: 0.4,
    removeFade: 0.5,
    spawnY: -0.55,
    types: {
      tshirt: {
        mask: ['#######', '.#####.', '.#####.', '.#####.'],
        designs: [
          {
            base: '#f1ece2',
            accent: '#2f4f8a',
            marks: [
              { t: 'stripe', rows: [1.3, 2.15], u0: 0.6, u1: 5.4, w: 0.42, color: 'accent' },
              { t: 'band', pts: [[2.05, 0.06], [3, 0.58], [3.95, 0.06]], w: 0.28, color: 'accent' },
              { t: 'seam', pts: [[0.62, -0.5], [0.62, 0.55]], mirror: true, w: 0.09, color: { shade: 0.24 }, lod: 1 },
              { t: 'seam', pts: [[0.75, 2.85], [5.25, 2.85]], w: 0.08, color: { shade: 0.22 }, lod: 1 },
            ],
          },
          {
            base: '#f4f1ea',
            accent: '#b8443a',
            marks: [
              { t: 'area', pts: [[-1.2, -1], [1.75, -1], [1.05, 0.95], [-1.2, 0.95]], mirror: true, color: 'accent' },
              { t: 'band', pts: [[2.05, 0.06], [3, 0.58], [3.95, 0.06]], w: 0.28, color: 'accent' },
              { t: 'seam', pts: [[0.75, 2.85], [5.25, 2.85]], w: 0.08, color: { shade: 0.22 }, lod: 1 },
            ],
          },
          {
            base: '#3f8fd2',
            accent: '#f7d154',
            marks: [
              { t: 'motif', at: [3, 1.65], r: 0.78, color: 'accent' },
              { t: 'motif', at: [3, 1.65], r: 0.4, color: { shade: 0.3 } },
              { t: 'band', pts: [[2.05, 0.06], [3, 0.58], [3.95, 0.06]], w: 0.28, color: { tint: 0.42 } },
              { t: 'seam', pts: [[0.62, -0.5], [0.62, 0.55]], mirror: true, w: 0.09, color: { shade: 0.24 }, lod: 1 },
              { t: 'seam', pts: [[0.75, 2.85], [5.25, 2.85]], w: 0.08, color: { shade: 0.22 }, lod: 1 },
            ],
          },
          {
            base: '#6a9c78',
            accent: '#e8ded0',
            marks: [
              { t: 'area', pts: [[1.5, 1.28], [2.85, 1.28], [2.85, 2.35], [1.5, 2.35]], color: { shade: 0.18 } },
              { t: 'seam', pts: [[1.42, 1.22], [2.93, 1.22]], w: 0.15, color: 'accent' },
              { t: 'band', pts: [[2.05, 0.06], [3, 0.58], [3.95, 0.06]], w: 0.28, color: 'accent' },
              { t: 'seam', pts: [[0.62, -0.5], [0.62, 0.55]], mirror: true, w: 0.09, color: { shade: 0.24 }, lod: 1 },
              { t: 'seam', pts: [[0.75, 2.85], [5.25, 2.85]], w: 0.08, color: { shade: 0.22 }, lod: 1 },
            ],
          },
          {
            base: '#e05a4f',
            accent: '#f7f2e8',
            marks: [
              { t: 'band', pts: [[2.05, 0.06], [3, 0.58], [3.95, 0.06]], w: 0.3, color: 'accent' },
              { t: 'seam', pts: [[0.62, -0.5], [0.62, 0.55]], mirror: true, w: 0.09, color: { shade: 0.24 }, lod: 1 },
              { t: 'seam', pts: [[0.75, 2.85], [5.25, 2.85]], w: 0.08, color: { shade: 0.22 }, lod: 1 },
            ],
          },
        ],
      },

      sock: {
        mask: ['..##', '..##', '####'],
        scale: 0.62,
        pieces: 2,
        designs: [
          {
            base: '#e9e4d8',
            accent: '#2f3542',
            marks: [
              { t: 'band', pts: [[0.05, 2.02], [0.85, 2.02]], w: 1.3, color: 'accent' },
              { t: 'band', pts: [[3.1, 1.9], [3.1, 2.12]], w: 1.25, color: 'accent' },
              { t: 'band', pts: [[1.9, 0.28], [3.3, 0.28]], w: 0.34, color: 'accent' },
              { t: 'seam', pts: [[1.9, 0.72], [3.3, 0.72]], w: 0.09, color: { shade: 0.2 }, lod: 1 },
            ],
          },
          {
            base: '#3a3f5c',
            accent: '#f2c14e',
            marks: [
              { t: 'stripe', rows: [0.32, 0.76], u0: 1.85, u1: 3.35, w: 0.26, color: 'accent' },
              { t: 'band', pts: [[0.05, 2.05], [0.7, 2.05]], w: 1.2, color: { tint: 0.3 } },
            ],
          },
          {
            base: '#7dc27a',
            accent: '#eef2ec',
            marks: [
              { t: 'band', pts: [[0.05, 2.02], [0.8, 2.02]], w: 1.3, color: 'accent' },
              { t: 'band', pts: [[1.9, 0.3], [3.3, 0.3]], w: 0.3, color: 'accent' },
            ],
          },
          {
            base: '#f08a5d',
            accent: '#b8532c',
            marks: [
              { t: 'seam', pts: [[2.35, 0.5], [2.35, 1.7]], w: 0.09, color: 'accent' },
              { t: 'seam', pts: [[2.85, 0.5], [2.85, 1.7]], w: 0.09, color: 'accent' },
              { t: 'seam', pts: [[3.35, 0.5], [3.35, 1.7]], w: 0.09, color: 'accent' },
              { t: 'band', pts: [[1.9, 0.28], [3.3, 0.28]], w: 0.3, color: 'accent' },
            ],
          },
        ],
      },

      towel: {
        mask: ['###', '###', '###', '###', '###'],
        designs: [
          {
            base: '#f0a6c8',
            accent: '#fdf3f7',
            marks: [
              { t: 'stripe', rows: [0.45, 3.55], u0: -0.4, u1: 2.4, w: 0.36, color: 'accent' },
              { t: 'stripe', rows: [0.75, 3.25], u0: -0.4, u1: 2.4, w: 0.1, color: { shade: 0.18 } },
            ],
          },
          {
            base: '#9ad1e6',
            accent: '#2f6f95',
            marks: [
              { t: 'stripe', rows: [0.4, 3.6], u0: -0.4, u1: 2.4, w: 0.34, color: 'accent' },
              { t: 'stripe', rows: [0.85, 3.15], u0: -0.4, u1: 2.4, w: 0.18, color: 'accent' },
              { t: 'seam', pts: [[-0.35, 0.15], [2.35, 0.15]], w: 0.08, color: { shade: 0.2 } },
              { t: 'seam', pts: [[-0.35, 3.85], [2.35, 3.85]], w: 0.08, color: { shade: 0.2 } },
            ],
          },
          {
            base: '#f7e7a1',
            accent: '#d0a83c',
            marks: [
              { t: 'stripe', rows: [1.1, 2.9], u0: -0.4, u1: 2.4, w: 0.16, color: 'accent' },
              { t: 'seam', pts: [[0.55, -0.4], [0.55, 4.4]], w: 0.14, color: 'accent' },
              { t: 'seam', pts: [[1.45, -0.4], [1.45, 4.4]], w: 0.14, color: 'accent' },
              { t: 'stripe', rows: [0.35, 3.65], u0: -0.4, u1: 2.4, w: 0.3, color: 'accent' },
            ],
          },
          {
            base: '#c8b6ff',
            accent: '#f3eeff',
            marks: [
              { t: 'stripe', rows: [0.5, 3.5], u0: -0.4, u1: 2.4, w: 0.32, color: 'accent' },
              { t: 'seam', pts: [[0.15, -0.18], [0.15, 0.34]], w: 0.11, color: 'accent', lod: 1 },
              { t: 'seam', pts: [[1.0, -0.18], [1.0, 0.34]], w: 0.11, color: 'accent', lod: 1 },
              { t: 'seam', pts: [[1.85, -0.18], [1.85, 0.34]], w: 0.11, color: 'accent', lod: 1 },
              { t: 'seam', pts: [[0.15, 3.66], [0.15, 4.18]], w: 0.11, color: 'accent', lod: 1 },
              { t: 'seam', pts: [[1.0, 3.66], [1.0, 4.18]], w: 0.11, color: 'accent', lod: 1 },
              { t: 'seam', pts: [[1.85, 3.66], [1.85, 4.18]], w: 0.11, color: 'accent', lod: 1 },
            ],
          },
        ],
      },

      pants: {
        mask: ['#####', '#####', '##.##', '##.##', '##.##'],
        designs: [
          {
            base: '#3c5a8a',
            accent: '#d9b26a',
            marks: [
              { t: 'band', pts: [[-0.4, 0.15], [4.4, 0.15]], w: 0.46, color: { shade: 0.2 } },
              { t: 'seam', pts: [[2, 0.5], [2, 1.45]], w: 0.1, color: 'accent' },
              { t: 'seam', pts: [[0.55, 1.1], [1.5, 1.1], [1.5, 1.85]], mirror: true, w: 0.08, color: 'accent', lod: 1 },
              { t: 'seam', pts: [[0.18, 0.45], [0.18, 4.35]], mirror: true, w: 0.09, color: 'accent', lod: 1 },
              { t: 'band', pts: [[-0.35, 3.9], [1.5, 3.9]], mirror: true, w: 0.26, color: { shade: 0.18 } },
            ],
          },
          {
            base: '#b9a07a',
            accent: '#8a7350',
            marks: [
              { t: 'band', pts: [[-0.4, 0.15], [4.4, 0.15]], w: 0.44, color: 'accent' },
              { t: 'seam', pts: [[2, 0.5], [2, 1.4]], w: 0.09, color: { shade: 0.22 } },
              { t: 'seam', pts: [[0.18, 0.45], [0.18, 4.35]], mirror: true, w: 0.08, color: { shade: 0.2 }, lod: 1 },
              { t: 'band', pts: [[-0.35, 3.95], [1.5, 3.95]], mirror: true, w: 0.22, color: 'accent' },
            ],
          },
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
    maxLow: 160,
    defaultLevel: 0.35,
    capacityExp: 1.3,
    capTau: 1,
    headRoom: 0.95,
    radiusGain: 1.2,
    countExp: 0.7,
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
