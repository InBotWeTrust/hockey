import { useSyncExternalStore } from 'react';

export type MapIconPosition = 'left' | 'right';
const listeners = new Set<() => void>();
const fallback = new Map<string, MapIconPosition>();
const keyFor = (owner?: string) => `map-icon-position-v1:${owner ?? 'anonymous'}`;
export function getMapIconPosition(owner?: string, initial: MapIconPosition = 'right'): MapIconPosition {
  const key = keyFor(owner);
  try { const saved = localStorage.getItem(key); return saved === 'left' || saved === 'right' ? saved : initial; }
  catch { return fallback.get(key) ?? initial; }
}
export function setMapIconPosition(owner: string | undefined, position: MapIconPosition): void {
  const key = keyFor(owner);
  fallback.set(key, position);
  try { localStorage.setItem(key, position); } catch { /* Storage is optional. */ }
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => { listeners.delete(listener); window.removeEventListener('storage', listener); };
}
export function useMapIconPosition(owner?: string, initial: MapIconPosition = 'right'): MapIconPosition {
  return useSyncExternalStore(subscribe, () => getMapIconPosition(owner, initial), () => initial);
}
