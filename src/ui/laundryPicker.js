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
      // Socks go in two at a time, so their button needs room for the pair.
      const room = app.laundryMax() - app.laundryCount();
      root.querySelectorAll('[data-add]').forEach((b) => {
        b.disabled = app.piecesFor(b.dataset.add) > room;
      });
      root.querySelector('#addRandom').disabled = room <= 0;
    },
  };
}
