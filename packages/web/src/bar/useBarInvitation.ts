import { useEffect, useState } from 'react';
import type { BarGameId } from '@hockey/game-core';
import { useAuthStore } from '../auth/authStore.js';
import { gameApi } from './games/api.js';
import { lobby as cardLobby } from './cards/onlineApi.js';
export type PendingBarInvitation = { id: string; kind: BarGameId | 'cards' };
/** Re-read invitations on entry even when the global toast is no longer visible. */
export function useBarInvitation(enabled: boolean): PendingBarInvitation | null {
  const user = useAuthStore((s) => s.user?.id);
  const [value, setValue] = useState<{ owner: string; invite: PendingBarInvitation | null } | null>(
    null,
  );
  useEffect(() => {
    if (!enabled || !user) {
      setValue(null);
      return;
    }
    let alive = true,
      reading = false;
    const refresh = async () => {
      if (reading || document.hidden) return;
      reading = true;
      try {
        const [games, cards] = await Promise.allSettled([gameApi.lobby(), cardLobby()]);
        if (!alive) return;
        const game =
          games.status === 'fulfilled'
            ? games.value.invites.find(
                (i) =>
                  i.receiverId === user &&
                  i.status === 'pending' &&
                  i.expiresAt > games.value.serverNow,
              )
            : undefined;
        const card =
          cards.status === 'fulfilled'
            ? cards.value.invites.find(
                (i) =>
                  i.receiver_id === user &&
                  i.status === 'pending' &&
                  Date.parse(i.expires_at) > (cards.value.serverNow ?? Date.now()),
              )
            : undefined;
        const invite = game
          ? { id: game.id, kind: game.kind }
          : card
            ? { id: card.id, kind: 'cards' as const }
            : null;
        if (games.status === 'fulfilled' || cards.status === 'fulfilled')
          setValue({ owner: user, invite });
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, user]);
  return enabled && user && value?.owner === user ? value.invite : null;
}
