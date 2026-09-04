import { t } from '../i18n.js';

export function initPanel(root, app) {
  const els = {
    auto: root.querySelector('#modeAuto'),
    manual: root.querySelector('#modeManual'),
    pause: root.querySelector('#pause'),
    rpm: root.querySelector('#rpm'),
    rpmOut: root.querySelector('#rpmOut'),
    foam: root.querySelector('#foam'),
    foamOut: root.querySelector('#foamOut'),
    dir: root.querySelector('#dir'),
    water: root.querySelector('#water'),
    waterOut: root.querySelector('#waterOut'),
    prev: root.querySelector('#prev'),
    skip: root.querySelector('#skip'),
    lang: root.querySelector('#lang'),
    resetAll: root.querySelector('#resetAll'),
    sound: root.querySelector('#sound'),
    volume: root.querySelector('#volume'),
    quickPause: root.querySelector('#quickPause'),
    quickSound: root.querySelector('#quickSound'),
  };

  els.auto.addEventListener('click', () => app.setMode('auto'));
  els.manual.addEventListener('click', () => app.setMode('manual'));
  els.pause.addEventListener('click', () => app.togglePause());
  els.quickPause.addEventListener('click', () => app.togglePause());
  els.rpm.addEventListener('input', () => app.setManualRpm(Number(els.rpm.value)));
  els.foam.addEventListener('input', () => app.setFoam(Number(els.foam.value) / 100));
  els.dir.addEventListener('click', () => app.toggleDirection());
  els.water.addEventListener('input', () => app.setWaterLevel(Number(els.water.value) / 100));
  els.prev.addEventListener('click', () => app.prevStage());
  els.skip.addEventListener('click', () => app.skipStage());
  els.lang.addEventListener('click', () => app.toggleLang());
  els.resetAll.addEventListener('click', () => app.resetAll());
  // A press while the output is blocked asks for sound rather than for silence,
  // and that has to be read at pointerdown. The window gesture listener resumes
  // the context before the click lands, and the poll can repaint the button in
  // between, so by click time nothing left says the press began on a slash.
  // Keyboard activation sends no pointerdown, hence the fallback.
  const bindSound = (el) => {
    let blocked = null;
    el.addEventListener('pointerdown', () => {
      blocked = el.dataset.blocked === 'true';
    });
    el.addEventListener('click', () => {
      app.toggleSound(blocked ?? el.dataset.blocked === 'true');
      blocked = null;
    });
  };
  bindSound(els.sound);
  bindSound(els.quickSound);
  els.volume.addEventListener('input', () => app.setVolume(Number(els.volume.value) / 100));

  let lastRpm = -1;
  let lastWater = -1;
  return {
    refresh() {
      const s = app.state;
      const manual = s.mode === 'manual';
      els.auto.setAttribute('aria-pressed', String(!manual));
      els.manual.setAttribute('aria-pressed', String(manual));
      els.pause.setAttribute('aria-pressed', String(s.paused));
      els.pause.textContent = t(s.lang, s.paused ? 'resume' : 'pause');
      els.quickPause.setAttribute('aria-pressed', String(s.paused));
      els.quickPause.setAttribute('aria-label', t(s.lang, s.paused ? 'resume' : 'pause'));
      els.prev.disabled = manual;
      els.skip.disabled = manual;
      // aria-pressed stays the user's intent; the slash also shows when the
      // output is still blocked and needs a gesture. The dock copy and the
      // panel copy always read the same.
      const blocked = String(s.sound.enabled && !app.soundReady());
      for (const el of [els.sound, els.quickSound]) {
        el.setAttribute('aria-pressed', String(s.sound.enabled));
        el.dataset.blocked = blocked;
      }
      els.quickSound.dataset.invite = String(app.soundInvite());
      const vol = Math.round(s.sound.volume * 100);
      els.volume.value = String(vol);
      els.volume.setAttribute('aria-valuetext', `${vol}%`);
      const foam = Math.round(s.foam * 100);
      els.foam.value = String(foam);
      els.foam.setAttribute('aria-valuetext', `${foam}%`);
      els.foamOut.textContent = `${foam}%`;
      els.rpm.max = String(app.maxRpm());
      this.syncLive(true);
    },
    // The motor and water readouts follow the simulation, so in AUTO they show
    // what the program is doing and in MANUAL what the user asked for.
    syncLive(force = false) {
      const s = app.state;
      const rpm = s.mode === 'manual' ? s.manual.rpm : Math.round(Math.abs(app.currentTargetRpm()));
      const dir = s.mode === 'manual' ? s.manual.dir : app.currentDirection();
      if (force || rpm !== lastRpm) {
        lastRpm = rpm;
        els.rpm.value = String(rpm);
        els.rpm.setAttribute('aria-valuetext', `${rpm} RPM`);
        els.rpmOut.textContent = String(rpm);
      }
      els.dir.setAttribute('aria-pressed', String(dir < 0));
      // Rounded to the slider's own step, or in AUTO the readout would name a
      // level the thumb cannot sit on.
      const level = s.mode === 'manual' ? s.manual.waterLevel : app.currentWaterLevel();
      const water = Math.round((level * 100) / 5) * 5;
      if (force || water !== lastWater) {
        lastWater = water;
        els.water.value = String(water);
        els.water.setAttribute('aria-valuetext', `${water}%`);
        els.waterOut.textContent = `${water}%`;
      }
    },
  };
}
