// The panel stays open until the user closes it; the handle brings it back.
// Whichever of the two is faded out is also made inert so it stays out of the
// tab order and the accessibility tree.
export function initPanelToggle(ui, { closeButton, handle }) {
  const panel = ui.querySelector('.panel');
  const setInert = (hidden) => {
    if (panel) panel.inert = hidden;
    handle.inert = !hidden;
  };
  const hide = () => {
    if (document.activeElement && ui.contains(document.activeElement)) document.activeElement.blur();
    ui.classList.add('hidden');
    setInert(true);
  };
  const show = () => {
    ui.classList.remove('hidden');
    setInert(false);
  };
  const toggle = () => {
    if (ui.classList.contains('hidden')) show();
    else hide();
  };
  closeButton.addEventListener('click', hide);
  handle.addEventListener('click', show);
  setInert(ui.classList.contains('hidden'));
  return { show, hide, toggle };
}
