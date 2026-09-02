import { CONFIG } from './config.js';
import { World } from './physics/world.js';
import { Drum } from './physics/drum.js';
import { Motor } from './physics/motor.js';
import { Water } from './physics/water.js';
import { Cycle } from './cycle.js';
import { Foam } from './render/foam.js';
import { Viewport } from './render/viewport.js';
import { Renderer } from './render/renderer.js';
import { AudioEngine } from './audio.js';
import { STRINGS, detectLang, applyI18n, t, stageName } from './i18n.js';
import { loadState, createSaver } from './ui/storage.js';
import { initPanelToggle } from './ui/panelToggle.js';
import { initCanvasTap } from './ui/input.js';
import { initLaundryPicker } from './ui/laundryPicker.js';
import { initPanel } from './ui/panel.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DT = CONFIG.physics.dt;
const TYPES = Object.keys(CONFIG.laundry.types);
const DEFAULT_LOAD = ['tshirt', 'sock', 'towel', 'pants', 'tshirt', 'sock'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const saved = loadState();
const canvas = document.getElementById('scene');
const uiRoot = document.getElementById('ui');
const live = document.getElementById('live');

const vp = new Viewport(canvas);
const world = new World(CONFIG.physics, CONFIG.laundry);
const drum = new Drum(CONFIG.physics);
const motor = new Motor(CONFIG.motor);
const water = new Water(CONFIG.water);
const cycle = new Cycle(CONFIG.cycle);
const foam = new Foam(CONFIG.foam.max);
const renderer = new Renderer(vp, CONFIG);
const audio = new AudioEngine();

if (reduceMotion) {
  motor.maxRpm = CONFIG.motor.reducedMotionMaxRpm;
  foam.still = true;
}

const lowHint = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
const state = {
  mode: saved?.mode === 'manual' ? 'manual' : 'auto',
  paused: false,
  manual: {
    rpm: clamp(Math.round(saved?.manual?.rpm ?? 45), 0, motor.maxRpm),
    dir: saved?.manual?.dir === -1 ? -1 : 1,
    water: Boolean(saved?.manual?.water),
  },
  lang: detectLang(saved?.lang),
  low: saved?.quality ? saved.quality === 'low' : lowHint,
  qualityUserSet: Boolean(saved?.quality),
  sound: {
    enabled: saved?.sound?.enabled ?? true,
    volume: clamp(Number(saved?.sound?.volume ?? 0.6) || 0, 0, 1),
  },
};
audio.setEnabled(state.sound.enabled);
audio.setVolume(state.sound.volume);

const spawnQueue = [];
let spawnTimer = 0;

const save = createSaver(() => ({
  laundry: [
    ...world.liveBodies.map((b) => ({ type: b.type, colorIdx: b.colorIdx })),
    ...spawnQueue.map((q) => ({ type: q.type, colorIdx: q.colorIdx })),
  ],
  mode: state.mode,
  manual: state.manual,
  lang: state.lang,
  sound: state.sound,
  quality: state.qualityUserSet ? (state.low ? 'low' : 'high') : undefined,
}));

const app = {
  state,
  laundryMax() {
    return state.low ? CONFIG.laundry.maxLow : CONFIG.laundry.max;
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
    save();
    refreshUi();
  },
  removeLast() {
    if (spawnQueue.length) spawnQueue.pop();
    else world.removeLast();
    save();
    refreshUi();
  },
  clearLaundry() {
    spawnQueue.length = 0;
    world.clear();
    save();
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
    save();
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
    save();
    panel.syncRpm(true);
  },
  setDirection(dir) {
    if (state.mode !== 'manual') this.setMode('manual');
    state.manual.dir = dir < 0 ? -1 : 1;
    save();
    panel.syncRpm(true);
  },
  toggleDirection() {
    this.setDirection(state.mode === 'manual' ? -state.manual.dir : -this.currentDirection());
  },
  toggleWater() {
    if (state.mode !== 'manual') this.setMode('manual');
    state.manual.water = !state.manual.water;
    save();
    refreshUi();
  },
  skipStage() {
    if (state.mode === 'auto') cycle.skip();
  },
  toggleLang() {
    state.lang = state.lang === 'ko' ? 'en' : 'ko';
    applyI18n(document, state.lang);
    save();
    refreshUi();
  },
  toggleLowPower() {
    state.low = !state.low;
    state.qualityUserSet = true;
    applyQuality();
    save();
    refreshUi();
  },
  toggleSound() {
    state.sound.enabled = !state.sound.enabled;
    audio.unlock();
    audio.setEnabled(state.sound.enabled);
    if (state.sound.enabled) audio.beep(1, 1568, 0);
    save();
    refreshUi();
  },
  setVolume(v) {
    state.sound.volume = clamp(v, 0, 1);
    audio.unlock();
    audio.setVolume(state.sound.volume);
    save();
    refreshUi();
  },
};

for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) {
  window.addEventListener(ev, () => audio.unlock(), { passive: true });
}

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
applyI18n(document, state.lang);
applyQuality();

const initial = Array.isArray(saved?.laundry) ? saved.laundry : DEFAULT_LOAD.map((type) => ({ type }));
for (const item of initial.slice(0, app.laundryMax())) {
  app.addLaundry(item.type, undefined, item.colorIdx);
}
refreshUi();

function refreshUi() {
  panel.refresh();
  picker.refresh();
}

function applyQuality() {
  vp.setMaxDpr(state.low ? 1 : 2);
  renderer.setLowQuality(state.low);
  foam.max = state.low ? CONFIG.foam.maxLow : CONFIG.foam.max;
  while (app.laundryCount() > app.laundryMax()) {
    if (spawnQueue.length) spawnQueue.pop();
    else world.removeLast();
  }
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
  if (state.mode === 'auto' && cycle.idx !== lastStageIdx) {
    if (cycle.stage.id === 'done') audio.beep(3);
    lastStageIdx = cycle.idx;
  }
}
let lastStageIdx = cycle.idx;

function foamIntensity() {
  if (state.mode === 'auto') return cycle.foamIntensity();
  if (!water.active) return 0;
  return Math.abs(motor.rpm) > 5 ? 0.6 : 0.15;
}

function hudInfo() {
  const manual = state.mode === 'manual';
  return {
    stageLabel: manual ? t(state.lang, 'manual') : stageName(state.lang, cycle.stage.label),
    modeLabel: manual ? '' : t(state.lang, 'auto'),
    remaining: manual ? 0 : cycle.totalRemaining,
    rpm: motor.rpm,
    paused: state.paused,
    pausedLabel: t(state.lang, 'paused'),
    phaseIndex: cycle.phase,
    phaseCount: cycle.phaseCount,
    manual,
  };
}

function formatTime(sec) {
  const s = Math.ceil(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const stats = { fps: 0, frameMs: 0, physMs: 0, substeps: 1 };
let last = performance.now();
let acc = 0;
let rafId = 0;
let uiTimer = 0;
let liveTimer = 0;
let fpsAcc = 0;
let fpsCount = 0;
let probeTime = 0;
let probeAcc = 0;
let probeCount = 0;
let probed = false;

function frame(now) {
  rafId = requestAnimationFrame(frame);
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

  for (const e of world.events) audio.impact(e.strength, e.wet, e.splash);
  world.events.length = 0;
  audio.update(frameDt, {
    rpm: motor.rpm,
    level: water.level,
    target: water.target,
    waterActive: water.active,
    swirl: water.swirl,
    agitation: world.agitation,
    load: world.liveCount,
    paused: state.paused,
  });

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
  liveTimer += frameDt;
  if (liveTimer > 1) {
    liveTimer = 0;
    const say = STRINGS[state.lang]?.live ?? STRINGS.en.live;
    live.textContent = say(info.paused ? info.pausedLabel : info.stageLabel, info.manual ? '-' : formatTime(info.remaining), Math.round(Math.abs(info.rpm)));
  }

  if (!probed && !state.qualityUserSet && !state.low) {
    probeTime += frameDt;
    if (probeTime > 1) {
      probeAcc += frameDt;
      probeCount++;
    }
    if (probeTime > 4) {
      probed = true;
      if (probeCount > 0 && probeAcc / probeCount > 0.022) {
        state.low = true;
        applyQuality();
        refreshUi();
      }
    }
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    audio.suspend();
  } else {
    last = performance.now();
    acc = 0;
    audio.resume();
    if (!rafId) rafId = requestAnimationFrame(frame);
  }
});

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

if (DEBUG) window.__washer = { world, drum, motor, water, cycle, state, app, audio };

rafId = requestAnimationFrame(frame);
