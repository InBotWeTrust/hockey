import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BarGameInvite } from '@hockey/game-core';
import { useAuthStore } from '../../auth/authStore.js';
import { gameApi } from './api.js';
import { gameNames } from './content.js';
export function GameInvites() {
  const user = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();
  const [invite, setInvite] = useState<BarGameInvite | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    setInvite(null);
    if (!user) return;
    let alive = true,
      reading = false;
    const refresh = async () => {
      if (reading || document.hidden || lock.current) return;
      reading = true;
      try {
        const s = await gameApi.lobby();
        if (alive)
          setInvite(s.invites.find((i) => i.receiverId === user && i.status === 'pending') ?? null);
      } catch {
        /* Next poll retries. */
      } finally {
        reading = false;
      }
    };
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user]);
  const respond = async (action: 'accept' | 'decline') => {
    if (!invite || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await gameApi.respond(invite.id, action);
      if (useAuthStore.getState().user?.id !== user) return;
      setInvite(null);
      if (r.matchId) navigate(`/bar/games/match/${r.matchId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Приглашение недоступно.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!invite) return null;
  return (
    <aside className="bar-game-invite-toast" aria-label="Приглашение в игру">
      <p>
        {invite.senderName}: {gameNames[invite.kind]}
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="btn btn--ghost" disabled={busy} onClick={() => void respond('decline')}>
        Отклонить
      </button>
      <button className="btn btn--cta" disabled={busy} onClick={() => void respond('accept')}>
        Играть
      </button>
    </aside>
  );
}
