/**
 * Minimal global toast bus — no React context needed.
 * Import { toast } anywhere and call toast.success() / toast.error() / toast.info().
 * ToastContainer (in App.jsx) subscribes to this bus and renders the UI.
 */

let nextId = 1;
const listeners = [];

export function subscribe(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function emit(event) { listeners.forEach(fn => fn(event)); }

export function dismiss(id) { emit({ id, dismiss: true }); }

function addToast(type, message, duration) {
  const id = nextId++;
  emit({ id, type, message, duration });
  if (duration > 0) setTimeout(() => dismiss(id), duration);
  return id;
}

export const toast = {
  success: (msg, d = 3000) => addToast('success', msg, d),
  error:   (msg, d = 0)    => addToast('error',   msg, d), // stays until dismissed
  info:    (msg, d = 5000) => addToast('info',    msg, d),
};
