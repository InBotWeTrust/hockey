import type { ColumnLocation } from './columnNavigationStore.js';
import { appSurface } from './appSurface.js';
const key = (owner: string) => `game-return-v1:${owner}`;
function valid(value: unknown): value is ColumnLocation {
  if (!value || typeof value !== 'object') return false;
  const item = value as ColumnLocation;
  if (
    typeof item.pathname !== 'string' ||
    typeof item.search !== 'string' ||
    typeof item.hash !== 'string'
  )
    return false;
  if (
    !item.pathname.startsWith('/') ||
    item.pathname.startsWith('//') ||
    /[\\\r\n]/.test(item.pathname)
  )
    return false;
  return ['venue', 'panorama'].includes(appSurface(item));
}
export function captureGameReturn(owner: string, location: ColumnLocation): void {
  if (!valid(location)) return;
  try {
    sessionStorage.setItem(key(owner), JSON.stringify(location));
  } catch {
    /* Optional navigation persistence. */
  }
}
export function consumeGameReturn(owner: string): ColumnLocation | null {
  try {
    const raw = sessionStorage.getItem(key(owner));
    sessionStorage.removeItem(key(owner));
    const item: unknown = JSON.parse(raw ?? 'null');
    return valid(item) ? item : null;
  } catch {
    return null;
  }
}
