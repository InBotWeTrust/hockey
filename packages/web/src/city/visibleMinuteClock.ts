/** Lighting changes on minute boundaries; share one clock and stop it in hidden tabs. */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
function tick(): void {
  clearTimeout(timer);
  timer = undefined;
  if (document.hidden || listeners.size === 0) return;
  for (const listener of listeners) listener();
  timer = setTimeout(tick, 60_000 - Date.now() % 60_000);
}
export function subscribeVisibleMinute(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);
    document.addEventListener('visibilitychange', tick);
    tick();
  } else if (!document.hidden) listener();
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    clearTimeout(timer);
    timer = undefined;
    window.removeEventListener('focus', tick);
    window.removeEventListener('pageshow', tick);
    document.removeEventListener('visibilitychange', tick);
  };
}
