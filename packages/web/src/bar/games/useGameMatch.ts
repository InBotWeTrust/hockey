import { useCallback, useEffect, useRef, useState } from 'react';
import type { BarGameAction, BarGameCommand, BarGameSnapshot } from '@hockey/game-core';
import { ApiError } from '../../api/apiFetch.js';
import { queryClient } from '../../app/queryClient.js';
import { gameApi } from './api.js';
export function mergeGameSnapshot(current: BarGameSnapshot | null, next: BarGameSnapshot) {
  return current && current.id === next.id && current.runtime.revision > next.runtime.revision
    ? current
    : next;
}
export function useGameMatch(id: string | undefined) {
  const [view, setView] = useState<BarGameSnapshot | null>(null),
    [error, setError] = useState<string | null>(null),
    [readError, setReadError] = useState<string | null>(null),
    [armBlocked, setArmBlocked] = useState(false),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const armAbort = useRef<AbortController | null>(null);
  const armSending = useRef(false),
    armQueued = useRef<Extract<BarGameAction, { type: 'arm-input' }> | null>(null);
  const seenStakes = useRef(new Set<string>());
  const recovering = useRef(false);
  const queued = useRef<BarGameCommand['action'] | null>(null);
  const current = useRef(view);
  current.current = view;
  const pending = useRef<BarGameCommand | null>(null),
    sending = useRef(false),
    generation = useRef(0),
    offset = useRef(0);
  const apply = useCallback(
    (next: BarGameSnapshot) => {
      if (next.id !== id || mergeGameSnapshot(current.current, next) !== next) return;
      offset.current = next.serverNow - Date.now();
      setNow(next.rulesPaused ? next.serverNow : Date.now() + offset.current);
      current.current = mergeGameSnapshot(current.current, next);
      if (current.current === next && next.stake) {
        const key = `${next.id}:${next.stake.amount}:${next.stake.payout}`;
        if (!seenStakes.current.has(key)) {
          seenStakes.current.add(key);
          void queryClient.invalidateQueries({ queryKey: ['profile'] });
          void queryClient.invalidateQueries({ queryKey: ['inventory'] });
        }
      }
      setView((v) => mergeGameSnapshot(v, next));
    },
    [id],
  );
  useEffect(() => {
    const token = ++generation.current;
    pending.current = null;
    queued.current = null;
    armAbort.current?.abort();
    armAbort.current = null;
    armSending.current = false;
    armQueued.current = null;
    setArmBlocked(false);
    sending.current = false;
    setBusy(false);
    setError(null);
    setReadError(null);
    recovering.current = false;
    setView(null);
    let reading = false;
    const refresh = async () => {
      if (!id || reading || document.hidden) return;
      reading = true;
      try {
        const next = await gameApi.read(id);
        if (token === generation.current) {
          apply(next);
          setReadError(null);
          setArmBlocked(false);
          if (recovering.current) {
            recovering.current = false;
            setError(null);
          }
        }
      } catch {
        if (token === generation.current)
          setReadError('Не удалось обновить партию. Пробуем снова…');
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 500),
      clock = setInterval(() => setNow(current.current?.rulesPaused ? current.current.serverNow : Date.now() + offset.current), 100);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      generation.current++;
      armAbort.current?.abort();
      armQueued.current = null;
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
    setBusy(input.action.type !== 'aim');
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
        recovering.current = e.status === 409;
        setError(e.status === 409 ? 'Ход уже изменился. Обновляем поле.' : e.message);
        try {
          const next = await gameApi.read(id);
          if (token !== generation.current) return;
          apply(next);
          setReadError(null);
          if (recovering.current) {
            recovering.current = false;
            setError(null);
          }
        } catch {
          /* Polling retries. */
        }
      } else setError('Не удалось подтвердить ход.');
    } finally {
      if (token === generation.current) {
        sending.current = false;
        setBusy(!!pending.current && pending.current.action.type !== 'aim');
        if (!pending.current && queued.current) {
          const action = queued.current;
          queued.current = null;
          send(action);
        }
      }
    }
  };
  const deliverArm = async (action: Extract<BarGameAction, { type: 'arm-input' }>) => {
    if (!id || current.current?.kind !== 'armwrestling') return;
    if (armSending.current) {
      armQueued.current = action;
      return;
    }
    const token = generation.current;
    armSending.current = true;
    const controller = new AbortController();
    armAbort.current = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const next = await Promise.race([
        gameApi.command(
          id,
          { requestId: crypto.randomUUID(), revision: current.current.runtime.revision, action },
          controller.signal,
        ),
        new Promise<BarGameSnapshot>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('Arm input timed out'));
          }, 1000);
        }),
      ]);
      if (token !== generation.current) return;
      apply(next);
      setArmBlocked(false);
      setError(null);
    } catch {
      if (token === generation.current) {
        armQueued.current = null;
        recovering.current = true;
        setArmBlocked(true);
        setError('Связь прервалась. Отпусти руки и попробуй снова.');
      }
    } finally {
      clearTimeout(timeout);
      if (token === generation.current) {
        armAbort.current = null;
        armSending.current = false;
        const next = armQueued.current;
        armQueued.current = null;
        if (next) void deliverArm(next);
      }
    }
  };
  const send = (action: BarGameCommand['action']) => {
    if (action.type === 'arm-input') {
      void deliverArm(action);
      return;
    }
    if (pending.current) {
      if (
        action.type === 'rules-pause' || (pending.current.action.type === 'aim' &&
        action.type !== 'ready' &&
        queued.current?.type !== 'shot')
      )
        queued.current = action;
      return;
    }
    if (!current.current) return;
    pending.current = {
      requestId: crypto.randomUUID(),
      revision: current.current.runtime.revision,
      action,
    };
    void deliver();
  };
  return {
    view,
    armBlocked,
    error: error ?? readError,
    busy,
    now,
    send,
    retry: () => void deliver(),
    uncertain: !!pending.current && !sending.current,
  };
}
