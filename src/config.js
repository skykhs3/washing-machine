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
  },

  laundry: {
    max: 20,
    maxLow: 12,
    spawnInterval: 0.4,
    removeFade: 0.5,
    spawnY: -0.55,
    types: {
      tshirt: {
        mask: ['#######', '.#####.', '.#####.', '.#####.'],
        colors: ['#e8574f', '#3f8fd2', '#f2c14e', '#f5f1e8', '#6dbf8a'],
        pattern: 'stripes',
      },
      sock: {
        mask: ['..##', '..##', '####'],
        scale: 0.62,
        colors: ['#f5f1e8', '#3a3f5c', '#7dc27a', '#f08a5d'],
        pattern: 'dots',
      },
      towel: {
        mask: ['###', '###', '###', '###', '###'],
        colors: ['#f0a6c8', '#9ad1e6', '#f7e7a1', '#c8b6ff'],
        pattern: 'waffle',
      },
      pants: {
        mask: ['#####', '#####', '##.##', '##.##', '##.##'],
        colors: ['#2f4f8a', '#4a6ea8', '#3d3d3d', '#7a5c3e'],
        pattern: 'denim',
      },
    },
  },

  // Standard cotton course, about 57 minutes: wash, two rinses with a short
  // spin after each drain, then a 10 minute final spin.
  // `surfactant` is the detergent concentration in the drum, not a foam
  // amount: each rinse dilutes what is left. Foam volume is derived from it
  // together with the air the tumbling load actually entrains.
  cycle: {
    stages: [
      { id: 'fill', label: 'fill', phase: 0, duration: 180, rpm: 0, level: 0.35, surfactant: 0.2 },
      { id: 'wash', label: 'wash', phase: 0, duration: 1080, rpm: 45, pattern: TUMBLE, level: 0.35, surfactant: 1 },
      { id: 'drain', label: 'drain', phase: 0, duration: 90, rpm: 0, level: 0, surfactant: 0.2 },
      { id: 'spin1', label: 'spin', phase: 0, duration: 120, rpm: 120, profile: SHORT_SPIN, level: 0, surfactant: 0, spin: true },
      { id: 'rinseFill1', label: 'fill', phase: 1, duration: 150, rpm: 0, level: 0.3, surfactant: 0.1 },
      { id: 'rinse1', label: 'rinse', phase: 1, duration: 300, rpm: 45, pattern: TUMBLE, level: 0.3, surfactant: 0.4 },
      { id: 'drain2', label: 'drain', phase: 1, duration: 90, rpm: 0, level: 0, surfactant: 0.1 },
      { id: 'spin2', label: 'spin', phase: 1, duration: 120, rpm: 120, profile: SHORT_SPIN, level: 0, surfactant: 0, spin: true },
      { id: 'rinseFill2', label: 'fill', phase: 2, duration: 150, rpm: 0, level: 0.3, surfactant: 0.05 },
      { id: 'rinse2', label: 'rinse', phase: 2, duration: 300, rpm: 45, pattern: TUMBLE, level: 0.3, surfactant: 0.25 },
      { id: 'drain3', label: 'drain', phase: 2, duration: 90, rpm: 0, level: 0, surfactant: 0 },
      { id: 'spin', label: 'spin', phase: 3, duration: 600, rpm: 200, profile: FINAL_SPIN, level: 0, surfactant: 0, spin: true },
      { id: 'done', label: 'done', phase: 4, duration: 120, rpm: 0, level: 0, surfactant: 0 },
    ],
  },

  // Foam is air entrained into a surfactant solution, so it needs both
  // detergent and mechanical work. Generation is gated by the Froude number
  // (see Foam.update) and the volume follows saturating kinetics, so foam
  // builds to a plateau instead of growing without bound.
  foam: {
    max: 96,
    maxLow: 48,
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
    headMax: 0.2,
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
