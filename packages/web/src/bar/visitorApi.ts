import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisitorSettings, VisitorState } from '@hockey/game-core';
import { apiFetch } from '../api/apiFetch.js';
export interface VisitorCatalog {
  state: VisitorState;
  settings: VisitorSettings;
  revision: number;
}
export const VISITOR_CHANGED = 'bar-visitor-changed';
export const fetchVisitor = () => apiFetch<VisitorCatalog>('/bar/visitor');
export const visitorChanged = () => window.dispatchEvent(new Event(VISITOR_CHANGED));
export function useVisitor(enabled = true) {
  const [data, setData] = useState<VisitorCatalog | null>(null);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const value = await fetchVisitor();
      if (current === generation.current) {
        setData(value);
        setError(false);
      }
    } catch {
      if (current === generation.current) setError(true);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const update = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener(VISITOR_CHANGED, update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    const timer = setInterval(update, 60000);
    return () => {
      ++generation.current;
      clearInterval(timer);
      window.removeEventListener(VISITOR_CHANGED, update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [enabled, refresh]);
  return { data, error, refresh };
}
export const visitorTime = (value: string) =>
  new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
