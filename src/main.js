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
import { loadState, clearState, createSaver } from './ui/storage.js';
import { initPanelToggle } from './ui/panelToggle.js';
import { initCanvasTap } from './ui/input.js';
import { initLaundryPicker } from './ui/laundryPicker.js';
import { initPanel } from './ui/panel.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DT = CONFIG.physics.dt;
const TYPES = Object.keys(CONFIG.laundry.types);
const DEFAULT_LOAD = ['tshirt', 'sock', 'sock', 'towel', 'pants', 'tshirt'];

const DEFAULT_VOLUME = 0.6;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const numberOr = (v, fallback) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : fallback);

const saved = loadState();
const canvas = document.getElementById('scene');
const uiRoot = document.getElementById('ui');
const live = document.getElementById('live');
// Whether the sound buttons are showing the blocked state. null forces the
// next poll to sync them.
let soundBlocked = null;
// A first visit starts muted, so the speaker itself has to say sound can be
// turned on. Touching sound at all takes the invitation down.
let soundInvite = !saved?.sound;

const vp = new Viewport(canvas);
const world = new World(CONFIG.physics, CONFIG.laundry);
const drum = new Drum(CONFIG.physics);
const motor = new Motor(CONFIG.motor);
const water = new Water(CONFIG.water);
const cycle = new Cycle(CONFIG.cycle);
const foam = new Foam(CONFIG.foam);
const renderer = new Renderer(vp, CONFIG);
const audio = new AudioEngine();

if (reduceMotion) {
  motor.maxRpm = CONFIG.motor.reducedMotionMaxRpm;
  foam.still = true;
}

const state = {
  mode: saved?.mode === 'manual' ? 'manual' : 'auto',
  paused: false,
  manual: {
    rpm: clamp(Math.round(saved?.manual?.rpm ?? 45), 0, motor.maxRpm),
    dir: saved?.manual?.dir === -1 ? -1 : 1,
    waterLevel: clamp(numberOr(saved?.manual?.waterLevel, CONFIG.water.manualLevel), 0, 1),
  },
  lang: detectLang(saved?.lang),
  panelOpen: typeof saved?.panelOpen === 'boolean' ? saved.panelOpen : undefined,
  // Detergent dose on the foam slider, 0..1.
  foam: clamp(numberOr(saved?.foam, CONFIG.foam.defaultLevel), 0, 1),
  sound: {
    enabled: saved?.sound?.enabled ?? false,
    volume: clamp(Number(saved?.sound?.volume ?? DEFAULT_VOLUME) || 0, 0, 1),
  },
};
audio.setEnabled(state.sound.enabled);
audio.setVolume(state.sound.volume);

const spawnQueue = [];
let spawnTimer = 0;

const save = createSaver(() => ({
  laundry: [
    ...world.liveBodies.map((b) => ({ type: b.type, designIdx: b.designIdx })),
    ...spawnQueue.map((q) => ({ type: q.type, designIdx: q.designIdx })),
  ],
  mode: state.mode,
  manual: state.manual,
  lang: state.lang,
  panelOpen: state.panelOpen,
  sound: state.sound,
  foam: state.foam,
}));

const app = {
  state,
  laundryMax() {
    return CONFIG.laundry.max;
  },
  laundryCount() {
    return itemsIn(pieceTally());
  },
  // A piece that completes a pair costs no item, so the second sock goes in
  // even when the drum is otherwise full.
  hasRoomFor(type) {
    const tally = pieceTally();
    tally[type] = (tally[type] ?? 0) + 1;
    return itemsIn(tally) <= this.laundryMax();
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
  currentWaterLevel() {
    return water.level;
  },
  soundReady() {
    return !audio.needsGesture;
  },
  soundInvite() {
    return soundInvite;
  },
  // One press of a button, one item. Socks go in as a pair sharing a design,
  // so they look like a pair, and the pair goes in whole or not at all.
  addLaundry(type) {
    const kind = type && TYPES.includes(type) ? type : TYPES[Math.floor(Math.random() * TYPES.length)];
    if (!this.hasRoomFor(kind)) return;
    const def = CONFIG.laundry.types[kind];
    const designIdx = Math.floor(Math.random() * def.designs.length);
    for (let i = 0; i < (def.pieces ?? 1); i++) spawnQueue.push({ type: kind, designIdx });
    save();
    refreshUi();
  },
  // Exactly one piece. Restoring a saved load goes through here: sending it
  // through addLaundry would double every pair on each reload.
  queuePiece(type, designIdx) {
    if (!TYPES.includes(type) || !this.hasRoomFor(type)) return;
    const def = CONFIG.laundry.types[type];
    const idx = Number.isInteger(designIdx) ? designIdx : Math.floor(Math.random() * def.designs.length);
    spawnQueue.push({ type, designIdx: idx });
    save();
    refreshUi();
  },
  removeLast() {
    const type = tailType();
    if (!removePiece()) return;
    // A pair comes out together; an odd one left behind leaves on its own.
    if (type && (CONFIG.laundry.types[type].pieces ?? 1) > 1 && tailType() === type) removePiece();
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
      state.manual.waterLevel = water.level;
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
    panel.syncLive(true);
  },
  setDirection(dir) {
    if (state.mode !== 'manual') this.setMode('manual');
    state.manual.dir = dir < 0 ? -1 : 1;
    save();
    panel.syncLive(true);
  },
  toggleDirection() {
    this.setDirection(state.mode === 'manual' ? -state.manual.dir : -this.currentDirection());
  },
  setWaterLevel(v) {
    if (state.mode !== 'manual') this.setMode('manual');
    state.manual.waterLevel = clamp(v, 0, 1);
    save();
    panel.syncLive(true);
  },
  // The foam slider is the detergent dose. It works in both modes, so unlike
  // the motor controls it does not switch to MANUAL.
  setFoam(v) {
    state.foam = clamp(v, 0, 1);
    save();
    refreshUi();
  },
  skipStage() {
    this.stepStage(1);
  },
  prevStage() {
    this.stepStage(-1);
  },
  // The tub lands at whatever the stage before the new one leaves behind, so
  // skipping a fill lands on a full tub instead of carrying the fill into the
  // next stage, skipping a drain lands on an empty one, and rewinding into a
  // drain lands on the full tub it is there to empty. Both wrap around the
  // ends of the program.
  stepStage(dir) {
    if (state.mode !== 'auto') return;
    cycle.step(dir);
    water.level = cycle.entryLevel();
    // Arriving at a stage backwards is neither the course ending nor a course
    // starting, so the stage's arrival sounds do not belong to a rewind.
    if (dir < 0) lastStageIdx = cycle.idx;
  },
  toggleLang() {
    state.lang = state.lang === 'ko' ? 'en' : 'ko';
    applyI18n(document, state.lang);
    save();
    refreshUi();
  },
  resetAll() {
    save.cancel();
    clearState();
    location.reload();
  },
  // wasBlocked is the slash the button was showing when it was pressed. That
  // press asks for sound rather than for silence, and it is the press that
  // opens the output, so leave the state alone and let it through.
  toggleSound(wasBlocked) {
    soundInvite = false;
    if (wasBlocked) {
      audio.unlock();
      refreshUi();
      return;
    }
    state.sound.enabled = !state.sound.enabled;
    // Unmuting with the slider at zero would be a dead end, so give it a level.
    if (state.sound.enabled && state.sound.volume === 0) {
      state.sound.volume = DEFAULT_VOLUME;
      audio.setVolume(state.sound.volume);
    }
    audio.unlock();
    audio.setEnabled(state.sound.enabled);
    if (state.sound.enabled) audio.beep(1, 1568, 0);
    save();
    refreshUi();
  },
  setVolume(v) {
    soundInvite = false;
    state.sound.volume = clamp(v, 0, 1);
    // Reaching for the volume is a request to hear something, so it takes the
    // mute off; dragging all the way down is the same as muting.
    state.sound.enabled = state.sound.volume > 0;
    audio.unlock();
    audio.setVolume(state.sound.volume);
    audio.setEnabled(state.sound.enabled);
    save();
    refreshUi();
  },
};

// Try to open the output straight away so simply watching the machine has
// sound; if the browser withholds it the context is created suspended and the
// gesture listeners below resume it. iOS also lands here after an
// interruption, which is why every gesture retries rather than only the first.
for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) {
  window.addEventListener(ev, () => audio.unlock(), { passive: true });
}
audio.onStateChange = () => {
  soundBlocked = null;
};

const panel = initPanel(uiRoot, app);
const picker = initLaundryPicker(uiRoot, app);
const panelToggle = initPanelToggle(uiRoot, {
  closeButton: uiRoot.querySelector('#hidePanel'),
  handle: uiRoot.querySelector('#handle'),
  dock: uiRoot.querySelector('#dock'),
  open: state.panelOpen,
  onReserve: (top) => {
    // In the sidebar layout the panel takes width, not height, so it reserves
    // nothing off the bottom; reporting its top edge there would leave a full
    // panel height reserved behind for the next portrait layout.
    if (vp.sidebar) {
      vp.setReserved(0);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    vp.setReserved(rect.bottom - top + 8);
  },
  onChange: (open) => {
    state.panelOpen = open;
    save();
  },
});
initCanvasTap(canvas, vp, (tap) => {
  audio.unlock();
  if (renderer.hitHud(tap.px)) {
    audio.keyBeep();
    return;
  }
  if (renderer.hitHandle(tap.drum)) {
    renderer.clickHandle();
    audio.latch();
  }
});
applyI18n(document, state.lang);

const initial = Array.isArray(saved?.laundry) ? saved.laundry : defaultLoad();
// Saved loads are stored as pieces, and the cap is in items, so let
// queuePiece turn the rest away rather than cutting the list to length.
for (const item of initial) {
  app.queuePiece(item.type, item.designIdx ?? item.colorIdx);
}
if (state.sound.enabled) audio.unlock();
refreshUi();

function refreshUi() {
  panel.refresh();
  picker.refresh();
  soundBlocked = state.sound.enabled && audio.needsGesture;
}

// A run of the same multi-piece type in the starting load is one set, so it
// shares a design; otherwise the socks a first visit opens with would not match
// the way an added pair does.
function defaultLoad() {
  const out = [];
  let designIdx = 0;
  let run = 0;
  DEFAULT_LOAD.forEach((type, i) => {
    const def = CONFIG.laundry.types[type];
    run = i > 0 && DEFAULT_LOAD[i - 1] === type && run + 1 < (def.pieces ?? 1) ? run + 1 : 0;
    if (run === 0) designIdx = Math.floor(Math.random() * def.designs.length);
    out.push({ type, designIdx });
  });
  return out;
}

// Items, not pieces: socks go in and come out a pair at a time, so a pair
// counts once, and an odd sock left behind still counts once.
function pieceTally() {
  const n = {};
  for (const b of world.bodies) if (!b.removing) n[b.type] = (n[b.type] ?? 0) + 1;
  for (const q of spawnQueue) n[q.type] = (n[q.type] ?? 0) + 1;
  return n;
}

function itemsIn(tally) {
  let total = 0;
  for (const type in tally) {
    total += Math.ceil(tally[type] / (CONFIG.laundry.types[type].pieces ?? 1));
  }
  return total;
}

function tailType() {
  if (spawnQueue.length) return spawnQueue[spawnQueue.length - 1].type;
  for (let i = world.bodies.length - 1; i >= 0; i--) {
    if (!world.bodies[i].removing) return world.bodies[i].type;
  }
  return null;
}

function removePiece() {
  if (spawnQueue.length) {
    spawnQueue.pop();
    return true;
  }
  return world.removeLast();
}

function tickSpawn(dt) {
  spawnTimer -= dt;
  if (spawnTimer > 0 || !spawnQueue.length) return;
  const item = spawnQueue[0];
  if (!world.canAdd(item.type)) return;
  spawnQueue.shift();
  const tpl = world.templates[item.type];
  let x = (Math.random() - 0.5) * 0.3;
  let y = CONFIG.laundry.spawnY;
  const maxR = 1 - tpl.extent - 0.04;
  const r = Math.hypot(x, y);
  if (r > maxR) {
    x = (x / r) * maxR;
    y = (y / r) * maxR;
  }
  world.addBody(item.type, x, y, Math.random() * Math.PI * 2, item.designIdx, Math.random() - 0.5, 1);
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
    water.target = state.manual.waterLevel;
  }
  motor.update(dt);
  drum.omega = motor.omega;
  water.update(dt, drum.omega, state.mode === 'manual');
  tickSpawn(dt);
  world.step(dt, drum, water);
  if (state.mode === 'auto' && cycle.idx !== lastStageIdx) {
    if (cycle.stage.id === 'done') audio.endChime();
    // The interlock engages as a course starts, just before the inlet opens.
    if (cycle.stage.id === 'fill') audio.doorLock();
    lastStageIdx = cycle.idx;
  }
}
let lastStageIdx = cycle.idx;

// Detergent concentration only. The slider is the dose: in AUTO it scales what
// each stage of the program has left in the drum, in MANUAL it is the
// concentration itself. How much foam that actually produces depends on the
// air the tumbling load entrains, which Foam.update works out from the drum
// speed and the agitation.
function surfactantLevel() {
  const dose = state.foam / CONFIG.foam.defaultLevel;
  if (state.mode === 'auto') return cycle.surfactant() * dose;
  return water.active ? dose : 0;
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

  for (const e of world.events) {
    audio.impact(e.strength, e.wet, e.splash);
    if (e.splash) foam.splash(e, water.tilt);
  }
  world.events.length = 0;
  audio.update(frameDt, {
    rpm: motor.rpm,
    level: water.level,
    target: water.target,
    waterActive: water.active,
    swirl: water.swirl,
    agitation: world.agitation,
    load: world.liveCount,
    wetness: world.wetness,
    lifters: CONFIG.physics.lifter.count,
    paused: state.paused,
  });

  const dtVisual = state.paused ? 0 : frameDt;
  const info = hudInfo();
  foam.update(dtVisual, {
    water,
    drum,
    agitation: world.agitation,
    surfactant: surfactantLevel(),
    gravity: CONFIG.physics.gravity,
    time: world.time,
  });
  renderer.draw({
    world,
    drum,
    water,
    foam,
    time: world.time,
    frameDt: dtVisual,
    uiDt: frameDt,
    hud: info,
    debug: DEBUG,
    stats,
    audio,
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
    panel.syncLive();
    if (soundBlocked !== (state.sound.enabled && audio.needsGesture)) refreshUi();
  }
  liveTimer += frameDt;
  if (liveTimer > 1) {
    liveTimer = 0;
    const say = STRINGS[state.lang]?.live ?? STRINGS.en.live;
    live.textContent = say(info.paused ? info.pausedLabel : info.stageLabel, info.manual ? '-' : formatTime(info.remaining), Math.round(Math.abs(info.rpm)));
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

if (DEBUG) window.__washer = { world, drum, motor, water, cycle, state, app, audio, vp, foam, renderer, cfg: CONFIG };

rafId = requestAnimationFrame(frame);
