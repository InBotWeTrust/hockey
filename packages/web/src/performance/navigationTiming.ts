import { useLayoutEffect, useRef } from 'react';
type RouteGroup = 'public-profile' | 'profile' | 'map' | 'chat' | 'game' | 'inventory';
const pending = new Map<string, { route: RouteGroup; start: number }>();
let sequence = 0;

/** Local Performance Timeline only: no account IDs, content or telemetry transmission. */
export function recordNavigationStart(route: RouteGroup): string {
  const token = String(++sequence);
  pending.set(token, { route, start: performance.now() });
  if (pending.size > 64) pending.delete(pending.keys().next().value!);
  return token;
}
export function recordNavigationReady(token: string): void {
  const entry = pending.get(token);
  if (!entry) return;
  pending.delete(token);
  try { performance.clearMeasures?.(`hockey.navigation.${entry.route}`); performance.measure(`hockey.navigation.${entry.route}`, { start: entry.start, end: performance.now() }); }
  catch { /* Older WebViews need not implement user timing options. */ }
}
export function cancelNavigation(token: string): void { pending.delete(token); }

export function useNavigationTiming(route: RouteGroup, navigationKey: string, ready: boolean): void {
  const token = useRef<string>();
  useLayoutEffect(() => {
    token.current = recordNavigationStart(route);
    return () => { if (token.current) cancelNavigation(token.current); };
  }, [route, navigationKey]);
  useLayoutEffect(() => {
    if (!ready || !token.current) return;
    const id = requestAnimationFrame(() => { if (token.current) recordNavigationReady(token.current); });
    return () => cancelAnimationFrame(id);
  }, [ready, navigationKey]);
}
