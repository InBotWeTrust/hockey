import {useBarMenuStore} from '../barMenuStore.js';
import { InvitationToast } from '../../components/InvitationToast.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../auth/authStore.js';
import { lobby, respond } from './onlineApi.js';
import { incomingInvites, useCardInvites } from './cardInvites.js';
export function CardInviteToast({
  suppressed = false,
  previewUserId,
}: {
  suppressed?: boolean;
  previewUserId?: string;
}) {
  const actualUserId = useAuthStore((s) => s.user?.id);
  const userId = previewUserId ?? actualUserId;
  const incoming = useCardInvites((s) => s.incoming);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const epoch = ++generation.current;
    useCardInvites.getState().setIncoming([]);
    setError(null);
    if (!userId) return;
    let alive = true;
    let reading = false;
    const refresh = async () => {
      if (reading || pending.current || document.hidden) return;
      const version = generation.current;
      const storeVersion = useCardInvites.getState().version;
      reading = true;
      try {
        const state = await lobby();
        if (
          alive &&
          version === generation.current &&
          storeVersion === useCardInvites.getState().version
        ) {
          useBarMenuStore.getState().setCards(userId,state);
          useCardInvites.getState().setIncoming(incomingInvites(state.invites, userId));
        }
      } catch {
        /* Keep indicators until expiry or a successful refresh. */
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      useCardInvites
        .getState()
        .setIncoming(incomingInvites(useCardInvites.getState().incoming, userId));
      void refresh();
    }, 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      if (generation.current === epoch) generation.current++;
    };
  }, [userId]);
  const invitation = incoming[0];
  const answer = async (action: 'accept' | 'decline') => {
    if (!invitation || pending.current) return;
    pending.current = true;
    generation.current++;
    setBusy(true);
    setError(null);
    try {
      const result = await respond(invitation.id, action);
      if (!previewUserId && useAuthStore.getState().user?.id !== userId) return;
      useCardInvites.getState().remove(invitation.id);
      if (action === 'accept' && result.roomId) navigate(`/bar/cards/room/${result.roomId}`);
      else if (action === 'accept' && result.matchId)
        navigate(`/bar/cards/match/${result.matchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось ответить на приглашение.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (suppressed || !invitation) return null;
  return (
    <InvitationToast name={invitation.sender_name} avatarUrl={invitation.sender_avatar_url} description={`Приглашает сыграть в карты${invitation.capacities?.length ? ` · стол на ${invitation.capacities.join(' / ')}` : invitation.capacity ? ` · стол на ${invitation.capacity}` : ''}`}>
        {error && <p role="alert">{error}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void answer('decline')}
            style={{ minHeight: 38, fontSize: 12, background: '#dc2626', color: '#fff' }}
          >
            Отклонить
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void answer('accept')}
            style={{ minHeight: 38, fontSize: 12, background: '#16a34a', color: '#fff' }}
          >
            Принять
          </button>
        </div>
    </InvitationToast>
  );
}
