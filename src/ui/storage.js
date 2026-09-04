const KEY = 'washing-machine:v1';

export function loadState() {
  try {
    if (new URLSearchParams(location.search).has('reset')) {
      localStorage.removeItem(KEY);
      return null;
    }
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: nothing to do
  }
}

export function createSaver(getState, delay = 500) {
  let timer = 0;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ v: 1, ...getState() }));
      } catch {
        // storage unavailable: nothing to do
      }
    }, delay);
  };
  // A reset wipes the key and reloads; a write still queued from the last
  // change would land in between and put the old state back.
  save.cancel = () => clearTimeout(timer);
  return save;
}
