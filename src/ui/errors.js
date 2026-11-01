// A visible, recoverable application-error state (finding F12). Text is set with textContent.
export function showError({ title, message, actions = [] }) {
  let el = document.getElementById('app-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-error';
    el.className = 'app-error';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'app-error-title');
    document.body.appendChild(el);
  }
  el.replaceChildren();
  const box = document.createElement('div');
  box.className = 'app-error-box';
  const h = document.createElement('h2'); h.id = 'app-error-title'; h.textContent = title;
  const p = document.createElement('p'); p.textContent = message;
  const row = document.createElement('div'); row.className = 'world-actions';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'world-button'; b.textContent = a.label;
    b.onclick = () => a.run();
    row.appendChild(b);
  }
  box.append(h, p, row);
  el.appendChild(box);
  el.hidden = false;
  row.querySelector('button')?.focus();
  return el;
}

export function hideError() { const el = document.getElementById('app-error'); if (el) el.hidden = true; }
