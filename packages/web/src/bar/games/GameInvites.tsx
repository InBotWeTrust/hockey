import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BarGameInvite } from '@hockey/game-core';
import { useAuthStore } from '../../auth/authStore.js';
import { gameApi } from './api.js';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
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
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'calc(var(--app-safe-top) + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(402px, calc(100vw - 24px))',
        zIndex: 700,
        pointerEvents: 'auto',
      }}
    >
      <div
        className="glass"
        style={{
          borderRadius: 22,
          padding: 12,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <UserAvatar
            avatarUrl={invite.senderAvatarUrl ?? null}
            name={invite.senderName}
            size={42}
            fontSize={16}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: 'var(--ink)',
                fontSize: 14,
                fontWeight: 950,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {invite.senderName}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 760, marginTop: 2 }}>
              Приглашает сыграть в{' '}
              {invite.kind === 'battleship' ? 'морской бой' : invite.kind === 'billiards'
                ? 'бильярд'
                : invite.kind === 'darts'
                  ? 'дартс'
                  : invite.kind === 'armwrestling'
                    ? 'армрестлинг'
                    : invite.kind === 'ochko'
                      ? 'очко'
                      : 'шашки'}
            </div>
          </div>
        </div>
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
      </div>
    </div>
  );
}
