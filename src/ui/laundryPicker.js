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
      // Every button costs one item, a pair of socks included, but a sock left
      // without a pair can still be matched up in a full drum.
      root.querySelectorAll('[data-add]').forEach((b) => {
        b.disabled = !app.hasRoomFor(b.dataset.add);
      });
      root.querySelector('#addRandom').disabled = app.laundryCount() >= app.laundryMax();
    },
  };
}
