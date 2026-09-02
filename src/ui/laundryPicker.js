export function initLaundryPicker(root, app) {
  root.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => app.addLaundry(btn.dataset.add));
  });
  root.querySelector('#addRandom').addEventListener('click', () => app.addLaundry(null));
  root.querySelector('#removeLast').addEventListener('click', () => app.removeLast());
  root.querySelector('#clear').addEventListener('click', () => app.clearLaundry());

  const count = root.querySelector('#count');
  return {
    refresh() {
      count.textContent = `${app.laundryCount()} / ${app.laundryMax()}`;
      const full = app.laundryCount() >= app.laundryMax();
      root.querySelectorAll('[data-add], #addRandom').forEach((b) => {
        b.disabled = full;
      });
    },
  };
}
