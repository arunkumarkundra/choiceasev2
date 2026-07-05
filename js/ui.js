/* ==========================================================================
   Choicease — ui.js
   Small shared UI utilities: escaping, toasts, modal control, confirm.
   ========================================================================== */

/** Escape user text for safe interpolation into HTML templates. */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/* ----------------------------- Toasts ----------------------------------- */

let toastTimer = null;

export function toast(message, kind = 'info') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3600);
}

/* ----------------------------- Modals ----------------------------------- */

let lastFocused = null;

export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  lastFocused = document.activeElement;
  modal.classList.add('is-open');
  document.body.classList.add('modal-open');
  const focusable = modal.querySelector('button, [href], input, select, textarea');
  if (focusable) focusable.focus();
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('is-open');
  document.body.classList.remove('modal-open');
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
}

export function wireModalDismissal() {
  document.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close-modal]');
    if (closer) {
      closeModal(closer.dataset.closeModal || closer.closest('.modal')?.id);
      return;
    }
    if (event.target.classList?.contains('modal')) {
      closeModal(event.target.id);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const open = document.querySelector('.modal.is-open');
      if (open) closeModal(open.id);
    }
  });
}

/** Accessible confirm dialog; resolves true/false. */
export function confirmDialog(message, confirmLabel = 'Continue') {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    $('#confirmMessage').textContent = message;
    const okBtn = $('#confirmOk');
    okBtn.textContent = confirmLabel;
    const done = (answer) => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeModal('confirmModal');
      resolve(answer);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const cancelBtn = $('#confirmCancel');
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    openModal('confirmModal');
  });
}

/* --------------------------- Misc helpers -------------------------------- */

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      resolve();
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(area);
    }
  });
}

export function scrollToElement(el) {
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.pageYOffset - 16;
  window.scrollTo({ top: y, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFilename(title, extension) {
  const base = (title || 'decision')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'decision';
  const date = new Date().toISOString().slice(0, 10);
  return `choicease-${base}-${date}.${extension}`;
}
