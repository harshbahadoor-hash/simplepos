type Boundary = { stage: string; count: number; entry: string; multiplied: boolean; editing: boolean; busy: boolean; dialog: boolean };
export function canUpdate(state: Boundary) {
  return state.stage === 'sale' && state.count === 0 && !state.entry && !state.multiplied && !state.editing && !state.busy && !state.dialog;
}
let waiting: ServiceWorker | null = null;
let reloadAllowed: (() => boolean) | null = null;
const changed = () => window.dispatchEvent(new Event('simplepos-update'));
export const updateReady = () => waiting !== null;
export function applyUpdate(safe: () => boolean) {
  if (!waiting || !safe()) return;
  reloadAllowed = safe;
  waiting.postMessage({ type: 'ACTIVATE' });
}
export async function prepareUpdates() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    waiting = null; changed();
    if (reloadAllowed?.()) window.location.reload();
    reloadAllowed = null;
  });
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const check = () => { waiting = registration.waiting; changed(); };
    check();
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', check));
  } catch { /* Loading and selling must still work without offline caching. */ }
}
