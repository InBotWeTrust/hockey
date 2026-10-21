import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { BarGameId } from '@hockey/game-core';
import { gameApi } from '../../bar/games/api.js';
import { respond as respondCards } from '../../bar/cards/onlineApi.js';
import { chatKeys } from '../../lib/queryKeys.js';
export type BarInviteMetadata = {
  type: 'bar_game_invite'; inviteId: string; kind: BarGameId | 'cards'; senderId: string; receiverId: string;
  capacity: number; capacities?: number[]; expiresAt: string; status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  matchId: string | null; roomId: string | null;
};
const kinds = ['cards', 'darts', 'checkers', 'billiards', 'ochko', 'armwrestling', 'battleship'];
export function parseBarInvite(value: unknown): BarInviteMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const m = value as Record<string, unknown>;
  if (m.type !== 'bar_game_invite' || typeof m.inviteId !== 'string' || !kinds.includes(String(m.kind)) || typeof m.senderId !== 'string' || typeof m.receiverId !== 'string' || typeof m.capacity !== 'number' || typeof m.expiresAt !== 'string' || !Number.isFinite(Date.parse(m.expiresAt)) || !['pending', 'accepted', 'declined', 'cancelled', 'expired'].includes(String(m.status)) || !(m.matchId === null || typeof m.matchId === 'string') || !(m.roomId === null || typeof m.roomId === 'string')) return null;
  if (m.capacities !== undefined && (!Array.isArray(m.capacities) || !m.capacities.length || m.capacities.some(n => typeof n !== 'number' || !Number.isInteger(n) || n < 2 || n > 6))) return null;
  return m as BarInviteMetadata;
}
const statusCopy = { pending: 'Ожидаем ответа', accepted: 'Приглашение принято', declined: 'Приглашение отклонено', cancelled: 'Приглашение отменено', expired: 'Срок приглашения истёк' };
export function BarInviteActions({ invite, isOwn }: { invite: BarInviteMetadata; isOwn: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now);
  const [local, setLocal] = useState<BarInviteMetadata | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const current = local?.inviteId === invite.inviteId && invite.status === 'pending' ? local : invite;
  const status = current.status === 'pending' && now >= Date.parse(current.expiresAt) ? 'expired' : current.status;
  useEffect(() => {
    if (status !== 'pending') return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [invite.inviteId, status]);
  const answer = async (action: 'accept' | 'decline' | 'cancel') => {
    if (lock.current || status !== 'pending' || Date.now() >= Date.parse(invite.expiresAt)) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const result = invite.kind === 'cards' ? await respondCards(invite.inviteId, action) : await gameApi.respond(invite.inviteId, action);
      setLocal({ ...invite, status: action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled', matchId: result.matchId, roomId: 'roomId' in result && typeof result.roomId === 'string' ? result.roomId : null });
      void qc.invalidateQueries({ queryKey: chatKeys.all });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось ответить на приглашение.');
      void qc.invalidateQueries({ queryKey: chatKeys.all });
    } finally { lock.current = false; setBusy(false); }
  };
  const destination = current.roomId ? `/bar/cards/room/${encodeURIComponent(current.roomId)}` : current.matchId ? `/bar/${invite.kind === 'cards' ? 'cards' : 'games'}/match/${encodeURIComponent(current.matchId)}` : null;
  const buttonStyle = { minWidth: 0, padding: '9px 10px', fontSize: 12, letterSpacing: 0, whiteSpace: 'nowrap' as const, flex: 1 };
  return <div style={{ display: 'grid', gap: 10 }}>
    {status === 'pending' ? <>
      <div style={{fontSize:12,opacity:.8}}>{isOwn ? 'Ожидаем ответа' : 'Приглашение в игру'} · {Math.max(0,Math.ceil((Date.parse(invite.expiresAt)-now)/1000))} сек</div>
      <div style={{display:'flex',gap:8}}>
        {isOwn ? <button className="btn btn--ghost" style={buttonStyle} disabled={busy} onClick={() => void answer('cancel')}>Отменить приглашение</button> : <>
          <button className="btn btn--ghost" style={buttonStyle} disabled={busy} onClick={() => void answer('decline')}>Отклонить</button>
          <button className="btn btn--cta" style={buttonStyle} disabled={busy} onClick={() => void answer('accept')}>Принять</button>
        </>}
      </div>
    </> : <div role="status">{statusCopy[status]}</div>}
    {status === 'accepted' && destination && <button className="btn btn--cta" style={buttonStyle} onClick={() => navigate(destination)}>{current.roomId ? 'Перейти к столу' : 'Перейти в игру'}</button>}
    {error && <div role="alert">{error}</div>}
  </div>;
}
