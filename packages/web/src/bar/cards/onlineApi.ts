import { apiFetch } from '../../api/apiFetch.js';
import type { Action, Card, Game, Player, Suit } from './rules.js';
export type OnlineSnapshot = {
  id: string;
  hand: Card[];
  opponentCount: number;
  deckCount: number;
  trump: Suit;
  trumpCard: Card;
  attacker: Player;
  table: Game['table'];
  limit: number;
  phase: Game['phase'];
  revision: number;
  result: Game['result'];
  deadline: number | null;
  serverNow: number;
  opponent: { displayName: string; avatarUrl: string | null };
};
export type Invite = {
  id: string;
  sender_id: string;
  receiver_id: string;
  sender_name: string;
  receiver_name: string;
  status: string;
  match_id: string | null;
  expires_at: string;
};
export type Lobby = { matchId: string | null; searching: boolean; invites: Invite[] };
export type PickerPlayer = { userId: string; displayName: string; avatarUrl: string | null };
export const lobby = () => apiFetch<Lobby>('/bar/cards/lobby');
export const searchPlayers = (q: string) =>
  apiFetch<PickerPlayer[]>(`/bar/cards/players?q=${encodeURIComponent(q)}`);
export const queue = (cancel = false) =>
  apiFetch<{ matchId: string | null }>('/bar/cards/queue', { method: cancel ? 'DELETE' : 'POST' });
export const invite = (userId: string) =>
  apiFetch('/bar/cards/invites', { method: 'POST', body: JSON.stringify({ userId }) });
export const respond = (id: string, action: 'accept' | 'decline' | 'cancel') =>
  apiFetch<{ matchId: string | null }>(`/bar/cards/invites/${id}`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
export const snapshot = (id: string) => apiFetch<OnlineSnapshot>(`/bar/cards/matches/${id}`);
export const move = (id: string, revision: number, action: Action | 'surrender') =>
  apiFetch<OnlineSnapshot>(`/bar/cards/matches/${id}`, {
    method: 'POST',
    body: JSON.stringify({ revision, action }),
  });
export function tableState(view: OnlineSnapshot): Game {
  const hidden = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `hidden-${i}`,
      rank: 0,
      suit: 'clubs' as const,
    }));
  return {
    hands: [view.hand, hidden(view.opponentCount)],
    deck: hidden(view.deckCount),
    trump: view.trump,
    trumpCard: view.trumpCard,
    attacker: view.attacker,
    table: view.table,
    discard: [],
    limit: view.limit,
    phase: view.phase,
    result: view.result,
    revision: view.revision,
  };
}
