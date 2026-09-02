import { CONFIG } from './config.js';
import { World } from './physics/world.js';
import { Drum } from './physics/drum.js';
import { Motor } from './physics/motor.js';
import { Water } from './physics/water.js';
import { Cycle } from './cycle.js';
import { Foam } from './render/foam.js';
import { Viewport } from './render/viewport.js';
import { Renderer } from './render/renderer.js';
import { initPanelToggle } from './ui/panelToggle.js';
import { initCanvasTap } from './ui/input.js';
import { initLaundryPicker } from './ui/laundryPicker.js';
import { initPanel } from './ui/panel.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const DT = CONFIG.physics.dt;
const TYPES = Object.keys(CONFIG.laundry.types);
const DEFAULT_LOAD = ['tshirt', 'sock', 'towel', 'pants', 'tshirt', 'sock'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const canvas = document.getElementById('scene');
const uiRoot = document.getElementById('ui');

const vp = new Viewport(canvas);
const world = new World(CONFIG.physics, CONFIG.laundry);
const drum = new Drum(CONFIG.physics);
const motor = new Motor(CONFIG.motor);
const water = new Water(CONFIG.water);
const cycle = new Cycle(CONFIG.cycle);
const foam = new Foam(CONFIG.foam.max);
const renderer = new Renderer(vp, CONFIG);

const state = {
  mode: 'auto',
  paused: false,
  manual: {
    rpm: 45,
    dir: 1,
    water: false,
  },
};

const spawnQueue = [];
let spawnTimer = 0;

const app = {
  state,
  laundryMax() {
    return CONFIG.laundry.max;
  },
  laundryCount() {
    return world.liveCount + spawnQueue.length;
  },
  maxRpm() {
    return motor.maxRpm;
  },
  currentTargetRpm() {
    return motor.targetRpm;
  },
  currentDirection() {
    const w = Math.abs(motor.omega) > 0.05 ? motor.omega : motor.target;
    return w < 0 ? -1 : 1;
  },
  waterOn() {
    return state.mode === 'manual' ? state.manual.water : water.target > 0;
  },
  addLaundry(type, at, colorIdx) {
    if (this.laundryCount() >= this.laundryMax()) return;
    const kind = type && TYPES.includes(type) ? type : TYPES[Math.floor(Math.random() * TYPES.length)];
    const colors = CONFIG.laundry.types[kind].colors;
    spawnQueue.push({
      type: kind,
      colorIdx: colorIdx ?? Math.floor(Math.random() * colors.length),
      x: at?.x,
      y: at?.y,
    });
    refreshUi();
  },
  removeLast() {
    if (spawnQueue.length) spawnQueue.pop();
    else world.removeLast();
    refreshUi();
  },
  clearLaundry() {
    spawnQueue.length = 0;
    world.clear();
    refreshUi();
  },
  setMode(mode) {
    if (state.mode === mode) return;
    if (mode === 'manual') {
      state.manual.rpm = clamp(Math.round(Math.abs(motor.targetRpm)), 0, motor.maxRpm);
      state.manual.dir = this.currentDirection();
      state.manual.water = water.target > 0;
    }
    state.mode = mode;
    refreshUi();
  },
  togglePause() {
    state.paused = !state.paused;
    if (!state.paused) {
      last = performance.now();
      acc = 0;
    }
    refreshUi();
  },
  setManualRpm(rpm) {
    if (state.mode !== 'manual') this.setMode('manual');
    state.manual.rpm = clamp(Math.round(rpm), 0, motor.maxRpm);
    panel.syncRpm(true);
  },
  setDirection(dir) {
    if (state.mode !== 'manual') this.setMode('manual');
    state.manual.dir = dir < 0 ? -1 : 1;
    panel.syncRpm(true);
  },
  toggleDirection() {
    this.setDirection(state.mode === 'manual' ? -state.manual.dir : -this.currentDirection());
  },
  toggleWater() {
    if (state.mode !== 'manual') this.setMode('manual');
    state.manual.water = !state.manual.water;
    refreshUi();
  },
  skipStage() {
    if (state.mode === 'auto') cycle.skip();
  },
};

const panel = initPanel(uiRoot, app);
const picker = initLaundryPicker(uiRoot, app);
const panelToggle = initPanelToggle(uiRoot, {
  closeButton: uiRoot.querySelector('#hidePanel'),
  handle: uiRoot.querySelector('#handle'),
});
initCanvasTap(canvas, vp, (p) => {
  const r = Math.hypot(p.x, p.y);
  const k = r > 0.6 ? 0.6 / r : 1;
  app.addLaundry(null, { x: p.x * k, y: p.y * k });
});

for (const type of DEFAULT_LOAD) {
  app.addLaundry(type);
}
refreshUi();

function refreshUi() {
  panel.refresh();
  picker.refresh();
}

function tickSpawn(dt) {
  spawnTimer -= dt;
  if (spawnTimer > 0 || !spawnQueue.length) return;
  const item = spawnQueue[0];
  if (!world.canAdd(item.type)) return;
  spawnQueue.shift();
  const tpl = world.templates[item.type];
  const fromTap = item.x != null;
  let x = fromTap ? item.x : (Math.random() - 0.5) * 0.3;
  let y = fromTap ? item.y : CONFIG.laundry.spawnY;
  const maxR = 1 - tpl.extent - 0.04;
  const r = Math.hypot(x, y);
  if (r > maxR) {
    x = (x / r) * maxR;
    y = (y / r) * maxR;
  }
  world.addBody(item.type, x, y, Math.random() * Math.PI * 2, item.colorIdx, Math.random() - 0.5, fromTap ? 0 : 1);
  spawnTimer = CONFIG.laundry.spawnInterval;
  refreshUi();
}

function simStep(dt) {
  if (state.mode === 'auto') {
    cycle.update(dt);
    motor.setTargetRpm(cycle.targetRpm(), cycle.accelFor(motor.rpm, CONFIG.motor));
    water.target = cycle.targetLevel();
  } else {
    motor.setTargetRpm(state.manual.rpm * state.manual.dir, CONFIG.motor.accelManual);
    water.target = state.manual.water ? CONFIG.water.manualLevel : 0;
  }
  motor.update(dt);
  drum.omega = motor.omega;
  water.update(dt, drum.omega);
  tickSpawn(dt);
  world.step(dt, drum, water);
}

function foamIntensity() {
  if (state.mode === 'auto') return cycle.foamIntensity();
  if (!water.active) return 0;
  return Math.abs(motor.rpm) > 5 ? 0.6 : 0.15;
}

function hudInfo() {
  const manual = state.mode === 'manual';
  return {
    stageLabel: manual ? 'MANUAL' : cycle.stage.label.toUpperCase(),
    modeLabel: manual ? '' : 'AUTO',
    remaining: manual ? 0 : cycle.totalRemaining,
    rpm: motor.rpm,
    paused: state.paused,
    pausedLabel: 'Paused',
    phaseIndex: cycle.phase,
    phaseCount: cycle.phaseCount,
    manual,
  };
}

const stats = { fps: 0, frameMs: 0, physMs: 0, substeps: 1 };
let last = performance.now();
let acc = 0;
let uiTimer = 0;
let fpsAcc = 0;
let fpsCount = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min((now - last) / 1000, CONFIG.physics.maxFrameDt);
  last = now;
  const t0 = performance.now();

  if (!state.paused) {
    acc += frameDt;
    let steps = 0;
    while (acc >= DT && steps < CONFIG.physics.maxStepsPerFrame) {
      simStep(DT);
      acc -= DT;
      steps++;
    }
    if (steps === CONFIG.physics.maxStepsPerFrame) acc = 0;
  }
  const t1 = performance.now();

  const intensity = foamIntensity();
  const dtVisual = state.paused ? 0 : frameDt;
  const info = hudInfo();
  foam.update(dtVisual, water, intensity, world.time);
  renderer.draw({
    world,
    drum,
    water,
    foam,
    time: world.time,
    frameDt: dtVisual,
    foamIntensity: intensity,
    hud: info,
    debug: DEBUG,
    stats,
  });
  const t2 = performance.now();

  stats.physMs = t1 - t0;
  stats.frameMs = t2 - t0;
  stats.substeps = Math.min(CONFIG.physics.maxSubsteps, Math.max(1, Math.ceil((Math.abs(drum.omega) * DT) / CONFIG.physics.substepMove)));
  fpsAcc += frameDt;
  fpsCount++;
  if (fpsAcc >= 0.5) {
    stats.fps = fpsCount / fpsAcc;
    fpsAcc = 0;
    fpsCount = 0;
  }

  uiTimer += frameDt;
  if (uiTimer > 0.1) {
    uiTimer = 0;
    panel.syncRpm();
  }
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key) {
    case ' ':
      // Space activates a focused button or link; do not steal it.
      if (e.target instanceof Element && e.target.closest('button, a[href]')) return;
      e.preventDefault();
      app.togglePause();
      break;
    case 'ArrowLeft':
      app.setDirection(-1);
      break;
    case 'ArrowRight':
      app.setDirection(1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      app.setManualRpm((state.mode === 'manual' ? state.manual.rpm : Math.abs(motor.targetRpm)) + 5);
      break;
    case 'ArrowDown':
      e.preventDefault();
      app.setManualRpm((state.mode === 'manual' ? state.manual.rpm : Math.abs(motor.targetRpm)) - 5);
      break;
    case 'a':
    case 'A':
      app.setMode(state.mode === 'auto' ? 'manual' : 'auto');
      break;
    case 's':
    case 'S':
      app.skipStage();
      break;
    case 'Escape':
      panelToggle.toggle();
      break;
    default:
  }
});

if (DEBUG) window.__washer = { world, drum, motor, water, cycle, foam, state, app };

requestAnimationFrame(frame);
