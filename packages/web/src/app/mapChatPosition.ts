import { useSyncExternalStore } from 'react';

export type MapChatPosition = 'left' | 'right';
const listeners = new Set<() => void>();
const fallback = new Map<string, MapChatPosition>();
const keyFor = (owner?: string) => `map-chat-position-v1:${owner ?? 'anonymous'}`;
export function getMapChatPosition(owner?: string): MapChatPosition {
  const key = keyFor(owner);
  try { return localStorage.getItem(key) === 'left' ? 'left' : 'right'; }
  catch { return fallback.get(key) ?? 'right'; }
}
export function setMapChatPosition(owner: string | undefined, position: MapChatPosition): void {
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
export function useMapChatPosition(owner?: string): MapChatPosition {
  return useSyncExternalStore(subscribe, () => getMapChatPosition(owner), () => 'right');
}
