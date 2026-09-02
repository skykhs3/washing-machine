// The panel stays open until the user closes it; the handle brings it back.
// Whichever of the two is faded out is also made inert so it stays out of the
// tab order and the accessibility tree.
//
// The height the panel takes is measured from the DOM rather than guessed,
// because it changes with the language, row wrapping, the max-height clamp and
// the safe-area inset.
//
// On a phone the panel covers close to half the display, which is what leaves
// the drum crammed against the top band, so it starts collapsed there. The
// decision is made from that measured share rather than a width breakpoint, so
// a short landscape window collapses too. The landscape sidebar layout is
// excluded because there the panel takes width, not height.
const SIDEBAR = '(orientation: landscape) and (min-width: 700px)';
const CROWDED = 0.34;

export function initPanelToggle(ui, { closeButton, handle, dock, open, onReserve, onChange }) {
  const panel = ui.querySelector('.panel');
  // The collapsed state shows a dock (quick pause plus the handle), so that is
  // what reserves height and what goes inert, not the handle alone.
  const collapsed = dock || handle;

  const setInert = (hidden) => {
    if (panel) panel.inert = hidden;
    collapsed.inert = !hidden;
  };

  // Reports the top edge of whichever control is showing. A hidden panel keeps
  // its box, so the element has to be picked by state, not by measuring both.
  const measure = () => {
    if (!onReserve) return;
    const el = ui.classList.contains('hidden') ? collapsed : panel;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.height) onReserve(rect.top);
  };

  const apply = (hidden, notify) => {
    ui.classList.toggle('hidden', hidden);
    setInert(hidden);
    measure();
    if (notify && onChange) onChange(!hidden);
  };

  const hide = () => {
    if (document.activeElement && ui.contains(document.activeElement)) document.activeElement.blur();
    apply(true, true);
  };
  const show = () => apply(false, true);
  const toggle = () => {
    if (ui.classList.contains('hidden')) show();
    else hide();
  };

  closeButton.addEventListener('click', hide);
  handle.addEventListener('click', show);

  const ro = new ResizeObserver(measure);
  if (panel) ro.observe(panel);
  ro.observe(collapsed);
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', measure);

  const crowded = () => {
    if (!panel || matchMedia(SIDEBAR).matches) return false;
    const h = window.innerHeight || document.documentElement.clientHeight;
    return panel.getBoundingClientRect().height > CROWDED * h;
  };

  apply(open === undefined ? crowded() : !open, false);

  return { show, hide, toggle, measure };
}
