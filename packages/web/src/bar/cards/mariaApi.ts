import { apiFetch } from '../../api/apiFetch.js';
import type { Action, Card, Game, Pair, Suit } from './rules.js';

export type MariaMatchView = Pick<
  Game,
  'trump' | 'trumpCard' | 'table' | 'limit' | 'phase' | 'revision' | 'result'
> & {
  id: string;
  hand: Card[];
  opponentCount: number;
  deckCount: number;
  attacker: 0 | 1;
  deadline: number | null;
  serverNow: number;
  opponent: { displayName: string; avatarUrl: string | null };
};

export const mariaApi = {
  start: () => apiFetch<MariaMatchView>('/bar/cards/maria', { method: 'POST', body: '{}' }),
  read: (id: string, signal?: AbortSignal) =>
    apiFetch<MariaMatchView>(`/bar/cards/maria/${id}`, { ...(signal ? { signal } : {}) }),
  move: (id: string, revision: number, action: Action | 'surrender') =>
    apiFetch<MariaMatchView>(`/bar/cards/maria/${id}`, {
      method: 'POST',
      body: JSON.stringify({ revision, action }),
    }),
};

export function mariaViewToGame(view: MariaMatchView): Game {
  return {
    hands: [
      view.hand,
      Array.from({ length: view.opponentCount }, (_, index) => ({
        id: `hidden-${index}`,
        rank: 6,
        suit: 'clubs' as Suit,
      })),
    ],
    deck: Array.from({ length: view.deckCount }, (_, index) => ({
      id: `deck-${index}`,
      rank: 6,
      suit: 'clubs' as Suit,
    })),
    trump: view.trump,
    trumpCard: view.trumpCard,
    attacker: view.attacker,
    table: view.table as Pair[],
    discard: [],
    limit: view.limit,
    phase: view.phase,
    result: view.result,
    revision: view.revision,
  };
}
