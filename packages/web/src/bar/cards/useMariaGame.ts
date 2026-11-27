import { useCallback, useEffect, useRef, useState } from 'react';
import { activePlayer, type Action } from './rules.js';
import type { DurakController } from './useDurakGame.js';
import { mariaApi, mariaViewToGame, type MariaMatchView } from './mariaApi.js';

export function useMariaGame(): {
  controller: DurakController | null;
  error: string | null;
  opponent: MariaMatchView['opponent'] | null;
} {
  const [view, setView] = useState<MariaMatchView | null>(null),
    [error, setError] = useState<string | null>(null);
  const current = useRef<MariaMatchView | null>(null),
    mounted = useRef(false),
    pending = useRef(false),
    offset = useRef(0);
  const receive = useCallback((next: MariaMatchView, replace = false) => {
    if (!mounted.current) return;
    const previous = current.current;
    if (previous && previous.id !== next.id && !replace) return;
    if (previous?.id === next.id && previous.revision > next.revision) return;
    offset.current = next.serverNow - Date.now();
    current.current = next;
    setView(next);
    setError(null);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void mariaApi
      .start()
      .then((next) => receive(next, true))
      .catch(() => {
        if (mounted.current) setError('Не удалось открыть карточный стол.');
      });
    const timer = window.setInterval(() => {
      const active = current.current;
      if (active?.id && active.result === null && !pending.current)
        void mariaApi
          .read(active.id, controller.signal)
          .then(receive)
          .catch(() => {
            if (mounted.current && !controller.signal.aborted)
              setError('Связь потеряна. Обновляем стол…');
          });
    }, 1000);
    return () => {
      mounted.current = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [receive]);
  const send = useCallback(
    (action: Action | 'surrender') => {
      const active = current.current;
      if (!active || pending.current) return;
      pending.current = true;
      void mariaApi
        .move(active.id, active.revision, action)
        .then(receive)
        .catch((reason: unknown) => {
          if (mounted.current)
            setError(reason instanceof Error ? reason.message : 'Ход не подтверждён.');
        })
        .finally(() => {
          pending.current = false;
        });
    },
    [receive],
  );
  if (!view) return { controller: null, error, opponent: null };
  const game = mariaViewToGame(view);
  return {
    opponent: view.opponent,
    error,
    controller: {
      game,
      dispatch: send,
      surrender: () => send('surrender'),
      restart: () => {
        if (pending.current) return;
        pending.current = true;
        void mariaApi
          .start()
          .then((next) => receive(next, true))
          .catch(() => {
            if (mounted.current) setError('Не удалось открыть карточный стол.');
          })
          .finally(() => {
            pending.current = false;
          });
      },
      remainingSeconds:
        view.deadline === null
          ? null
          : Math.max(0, Math.ceil((view.deadline - Date.now() - offset.current) / 1000)),
      thinking: game.result === null && activePlayer(game) === 1,
    },
  };
}
