import { CONFIG } from './config.js';
import { World } from './physics/world.js';
import { Drum } from './physics/drum.js';
import { Motor } from './physics/motor.js';
import { Water } from './physics/water.js';
import { Cycle } from './cycle.js';
import { Foam } from './render/foam.js';
import { Viewport } from './render/viewport.js';
import { Renderer } from './render/renderer.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const DT = CONFIG.physics.dt;
const DEFAULT_LOAD = ['tshirt', 'sock', 'towel', 'pants', 'tshirt', 'sock'];

const canvas = document.getElementById('scene');

const vp = new Viewport(canvas);
const world = new World(CONFIG.physics, CONFIG.laundry);
const drum = new Drum(CONFIG.physics);
const motor = new Motor(CONFIG.motor);
const water = new Water(CONFIG.water);
const cycle = new Cycle(CONFIG.cycle);
const foam = new Foam(CONFIG.foam.max);
const renderer = new Renderer(vp, CONFIG);

for (const type of DEFAULT_LOAD) {
  const colors = CONFIG.laundry.types[type].colors;
  const colorIdx = Math.floor(Math.random() * colors.length);
  world.addBody(type, (Math.random() - 0.5) * 0.3, CONFIG.laundry.spawnY, Math.random() * Math.PI * 2, colorIdx, Math.random() - 0.5, 1);
}

function simStep(dt) {
  cycle.update(dt);
  motor.setTargetRpm(cycle.targetRpm(), cycle.accelFor(motor.rpm, CONFIG.motor));
  water.target = cycle.targetLevel();
  motor.update(dt);
  drum.omega = motor.omega;
  water.update(dt, drum.omega);
  world.step(dt, drum, water);
}

function foamIntensity() {
  return cycle.foamIntensity();
}

function hudInfo() {
  return {
    stageLabel: cycle.stage.label.toUpperCase(),
    modeLabel: 'AUTO',
    remaining: cycle.totalRemaining,
    rpm: motor.rpm,
    phaseIndex: cycle.phase,
    phaseCount: cycle.phaseCount,
    manual: false,
  };
}

const stats = { fps: 0, frameMs: 0, physMs: 0, substeps: 1 };
let last = performance.now();
let acc = 0;
let fpsAcc = 0;
let fpsCount = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min((now - last) / 1000, CONFIG.physics.maxFrameDt);
  last = now;
  const t0 = performance.now();

  acc += frameDt;
  let steps = 0;
  while (acc >= DT && steps < CONFIG.physics.maxStepsPerFrame) {
    simStep(DT);
    acc -= DT;
    steps++;
  }
  if (steps === CONFIG.physics.maxStepsPerFrame) acc = 0;
  const t1 = performance.now();

  const intensity = foamIntensity();
  const info = hudInfo();
  foam.update(frameDt, water, intensity, world.time);
  renderer.draw({ world, drum, water, foam, time: world.time, frameDt, foamIntensity: intensity, hud: info, debug: DEBUG, stats });
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
}

if (DEBUG) window.__washer = { world, drum, motor, water, cycle, foam };

requestAnimationFrame(frame);
