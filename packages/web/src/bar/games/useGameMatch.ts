import { useCallback, useEffect, useRef, useState } from 'react';
import type { BarGameAction, BarGameCommand, BarGameSnapshot } from '@hockey/game-core';
import { ApiError } from '../../api/apiFetch.js';
import { gameApi } from './api.js';
export function mergeGameSnapshot(current: BarGameSnapshot | null, next: BarGameSnapshot) {
  return current && current.id === next.id && current.runtime.revision > next.runtime.revision
    ? current
    : next;
}
export function useGameMatch(id: string | undefined) {
  const [view, setView] = useState<BarGameSnapshot | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const current = useRef(view);
  current.current = view;
  const pending = useRef<BarGameCommand | null>(null),
    sending = useRef(false),
    generation = useRef(0),
    offset = useRef(0);
  const apply = useCallback(
    (next: BarGameSnapshot) => {
      if (next.id !== id) return;
      offset.current = next.serverNow - Date.now();
      setNow(Date.now() + offset.current);
      setView((v) => mergeGameSnapshot(v, next));
    },
    [id],
  );
  useEffect(() => {
    const token = ++generation.current;
    pending.current = null;
    sending.current = false;
    setBusy(false);
    setView(null);
    let reading = false;
    const refresh = async () => {
      if (!id || reading || document.hidden) return;
      reading = true;
      try {
        const next = await gameApi.read(id);
        if (token === generation.current) apply(next);
      } catch {
        if (token === generation.current) setError('Не удалось обновить партию. Пробуем снова…');
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1500),
      clock = setInterval(() => setNow(Date.now() + offset.current), 100);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      generation.current++;
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [id, apply]);
  const deliver = async () => {
    if (!id || !pending.current || sending.current) return;
    const token = generation.current,
      input = pending.current;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await gameApi.command(id, input);
      if (token !== generation.current) return;
      apply(next);
      pending.current = null;
    } catch (e) {
      if (token !== generation.current) return;
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        pending.current = null;
        setError(e.status === 409 ? 'Ход уже изменился. Обновляем поле.' : e.message);
        try {
          apply(await gameApi.read(id));
        } catch {
          /* Polling retries. */
        }
      } else setError('Ход пока не подтверждён. Повтори отправку — он не выполнится дважды.');
    } finally {
      if (token === generation.current) {
        sending.current = false;
        setBusy(!!pending.current);
      }
    }
  };
  const send = (action: BarGameAction | { type: 'ready' }) => {
    if (pending.current || !current.current) return;
    pending.current = {
      requestId: crypto.randomUUID(),
      revision: current.current.runtime.revision,
      action,
    };
    void deliver();
  };
  return {
    view,
    error,
    busy,
    now,
    send,
    retry: () => void deliver(),
    uncertain: !!pending.current && !sending.current,
  };
}
