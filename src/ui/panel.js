export function initPanel(root, app) {
  const els = {
    auto: root.querySelector('#modeAuto'),
    manual: root.querySelector('#modeManual'),
    pause: root.querySelector('#pause'),
    rpm: root.querySelector('#rpm'),
    rpmOut: root.querySelector('#rpmOut'),
    dir: root.querySelector('#dir'),
    water: root.querySelector('#water'),
    skip: root.querySelector('#skip'),
  };

  els.auto.addEventListener('click', () => app.setMode('auto'));
  els.manual.addEventListener('click', () => app.setMode('manual'));
  els.pause.addEventListener('click', () => app.togglePause());
  els.rpm.addEventListener('input', () => app.setManualRpm(Number(els.rpm.value)));
  els.dir.addEventListener('click', () => app.toggleDirection());
  els.water.addEventListener('click', () => app.toggleWater());
  els.skip.addEventListener('click', () => app.skipStage());

  let lastRpm = -1;
  return {
    refresh() {
      const s = app.state;
      const manual = s.mode === 'manual';
      els.auto.setAttribute('aria-pressed', String(!manual));
      els.manual.setAttribute('aria-pressed', String(manual));
      els.pause.setAttribute('aria-pressed', String(s.paused));
      els.pause.textContent = s.paused ? 'Resume' : 'Pause';
      els.water.setAttribute('aria-pressed', String(app.waterOn()));
      els.water.disabled = !manual;
      els.skip.disabled = manual;
      els.rpm.max = String(app.maxRpm());
      this.syncRpm(true);
    },
    syncRpm(force = false) {
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
    },
  };
}
