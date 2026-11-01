// One controller for every panel (finding F10): buttons report aria-expanded, closed panels are
// hidden and inert (not focusable), focus moves in on open and back to the opener on close, and
// narrow screens show a single drawer at a time.

export class Panels {
  constructor({ narrow = () => window.innerWidth < 760, reducedMotion = () => false } = {}) {
    this.items = new Map(); this.order = []; this.narrow = narrow; this.reducedMotion = reducedMotion;
  }
  register(id, { panel, button = null, group = 'right', onOpen = null, onClose = null }) {
    panel.hidden = true; panel.inert = true; panel.classList.remove('open');
    if (button) { button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', panel.id); button.addEventListener('click', () => this.toggle(id, button)); }
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); this.close(id); } });
    this.items.set(id, { id, panel, button, group, onOpen, onClose, opener: null, timer: 0 });
  }
  isOpen(id) { return !!this.items.get(id)?.panel.classList.contains('open'); }
  open(id, opener = document.activeElement, { focus = true } = {}) {
    const it = this.items.get(id);
    if (!it) return;
    for (const other of this.items.values()) if (other.id !== id && this.isOpen(other.id) && (other.group === it.group || this.narrow())) this.close(other.id, { restore: false });
    clearTimeout(it.timer);
    if (!this.isOpen(id)) it.opener = opener instanceof HTMLElement ? opener : null;
    it.panel.hidden = false; it.panel.inert = false;
    // A forced reflow lets the opening transition run while the state changes synchronously.
    void it.panel.offsetWidth;
    it.panel.classList.add('open');
    if (it.button) { it.button.setAttribute('aria-expanded', 'true'); it.button.classList.add('on'); it.button.classList.remove('ping'); }
    this.order = [...this.order.filter(x => x !== id), id];
    it.onOpen?.();
    if (focus) (it.panel.querySelector('[data-autofocus]') || it.panel.querySelector('h2, h3') || it.panel).focus({ preventScroll: true });
  }
  close(id, { restore = true } = {}) {
    const it = this.items.get(id);
    if (!it || it.panel.hidden) return;
    const hadFocus = it.panel.contains(document.activeElement);
    it.panel.classList.remove('open'); it.panel.inert = true;
    clearTimeout(it.timer);
    it.timer = setTimeout(() => { if (!it.panel.classList.contains('open')) it.panel.hidden = true; }, this.reducedMotion() ? 0 : 220);
    if (it.button) { it.button.setAttribute('aria-expanded', 'false'); it.button.classList.remove('on'); }
    this.order = this.order.filter(x => x !== id);
    it.onClose?.();
    if (restore && hadFocus) (it.opener?.isConnected ? it.opener : it.button)?.focus({ preventScroll: true });
  }
  toggle(id, opener) { this.isOpen(id) ? this.close(id) : this.open(id, opener); }
  closeTop() { const id = this.order.at(-1); if (id) { this.close(id); return true; } return false; }
  // Entering a narrow layout keeps only the most recently opened panel.
  relayout() { if (this.narrow()) for (const id of this.order.slice(0, -1)) this.close(id, { restore: false }); }
}
