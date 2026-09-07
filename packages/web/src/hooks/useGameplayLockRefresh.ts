import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GameplayLockDTO } from '../api/gameplayLock.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';

export function useGameplayLockRefresh(lock: GameplayLockDTO | null | undefined): void {
  const queryClient = useQueryClient();
  const blocked = lock?.blocked === true;
  const endsAt = lock?.ends_at;
  const wasBlocked = useRef(blocked);
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
      void queryClient.invalidateQueries({ queryKey: ['training'] });
      void queryClient.invalidateQueries({ queryKey: ['daily'] });
      void useDailyStore.getState().refresh();
      void useTrainingSessionStore.getState().refresh();
    };
    const completed = wasBlocked.current && !blocked;
    wasBlocked.current = blocked;
    if (completed) refresh();
    if (!blocked) return;
    const expiresAt = endsAt ? Date.parse(endsAt) : NaN;
    const timer = Number.isFinite(expiresAt)
      ? window.setTimeout(
          refresh,
          Math.min(2_147_000_000, Math.max(0, expiresAt - Date.now() + 50)),
        )
      : undefined;
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [blocked, endsAt, queryClient]);
}
