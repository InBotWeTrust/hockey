import { useSyncExternalStore } from 'react';

export type MapChatPosition = 'left' | 'right';
const listeners = new Set<() => void>();
const fallback = new Map<string, MapChatPosition>();
const keyFor = (owner?: string) => `map-chat-position-v1:${owner ?? 'anonymous'}`;
export function getMapChatPosition(owner?: string, initial: MapChatPosition = 'right'): MapChatPosition {
  const key = keyFor(owner);
  try { const saved = localStorage.getItem(key); return saved === 'left' || saved === 'right' ? saved : initial; }
  catch { return fallback.get(key) ?? initial; }
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
export function useMapChatPosition(owner?: string, initial: MapChatPosition = 'right'): MapChatPosition {
  return useSyncExternalStore(subscribe, () => getMapChatPosition(owner, initial), () => initial);
}
