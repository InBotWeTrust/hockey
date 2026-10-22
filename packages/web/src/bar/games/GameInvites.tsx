import {useBarMenuStore} from '../barMenuStore.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameInvites } from './gameInviteStore.js';
import { useAuthStore } from '../../auth/authStore.js';
import { gameApi } from './api.js';
import { InvitationToast } from '../../components/InvitationToast.js';
export function GameInvites() {
  const user = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();
  const invite = useGameInvites(state => state.owner === user ? state.incoming[0] ?? null : null);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const epoch = ++generation.current;
    useGameInvites.getState().reset(user ?? null);
    setError(null);
    if (!user) return;
    let alive = true,
      reading = false;
    const refresh = async () => {
      useGameInvites.getState().prune(user);
      if (reading || document.hidden || lock.current) return;
      reading = true;
      const revision = useGameInvites.getState().revision;
      try {
        const s = await gameApi.lobby();
        if (alive && generation.current === epoch && !lock.current && revision === useGameInvites.getState().revision) {
          useBarMenuStore.getState().setGames(user,s);
          useGameInvites.getState().replace(user, s.invites, revision);
        }
      } catch {
        /* Next poll retries. */
      } finally {
        reading = false;
      }
    };
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    const onReturn = () => void refresh();
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [user]);
  const respond = async (action: 'accept' | 'decline') => {
    if (!invite || !user || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await gameApi.respond(invite.id, action);
      if (useAuthStore.getState().user?.id !== user) return;
      useGameInvites.getState().remove(user, invite.id);
      if (r.matchId) navigate(`/bar/games/match/${r.matchId}`);
    } catch (e) {
      if (useAuthStore.getState().user?.id === user)
        setError(e instanceof Error ? e.message : 'Приглашение недоступно.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!invite) return null;
  const label = {battleship:'морской бой',billiards:'бильярд',darts:'дартс',armwrestling:'армрестлинг',ochko:'очко',checkers:'шашки'}[invite.kind];
  return (
    <InvitationToast name={invite.senderName} avatarUrl={invite.senderAvatarUrl} description={`Приглашает сыграть в ${label}`}>
        {error && <p role="alert">{error}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void respond('decline')}
            style={{ minHeight: 38, fontSize: 12, background: '#dc2626', color: '#fff' }}
          >
            Отклонить
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void respond('accept')}
            style={{ minHeight: 38, fontSize: 12, background: '#16a34a', color: '#fff' }}
          >
            Принять
          </button>
        </div>
    </InvitationToast>
  );
}
