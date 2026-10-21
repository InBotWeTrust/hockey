import { useGameInvites } from './gameInviteStore.js';
import type {
  BarGameId,
  GameCharacter,
  BarGameSnapshot,
  BarGameCommand,
  BarGameLobby,
  GameParticipant,
} from '@hockey/game-core';
import { apiFetch } from '../../api/apiFetch.js';
export type GamePickerPlayer = GameParticipant & {lastSeenAt?:string|null};
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
export const gameApi = {
  ochkoOffer: () =>
    apiFetch<{ offerId: string; stars: number; balance: number; expiresAt: number }>(
      '/bar/games/ochko/offer',
      post({}),
    ),
  startOchkoStake: (input: { requestId: string; offerId: string; stars: number }) =>
    apiFetch<BarGameSnapshot>('/bar/games/ochko/start', post(input)),
  lobby: () => apiFetch<BarGameLobby>('/bar/games/lobby'),
  players: (q: string) =>
    apiFetch<GamePickerPlayer[]>(`/bar/games/players?q=${encodeURIComponent(q)}`),
  start: (character: GameCharacter, requestId: string, previousId?: string) =>
    apiFetch<BarGameSnapshot>(
      '/bar/games/computer',
      post({ character, requestId, ...(previousId ? { previousId } : {}) }),
    ),
  read: (id: string) => apiFetch<BarGameSnapshot>(`/bar/games/matches/${id}`),
  command: (id: string, input: BarGameCommand, signal?: AbortSignal) =>
    apiFetch<BarGameSnapshot>(`/bar/games/matches/${id}`, {
      ...post(input),
      ...(signal ? { signal } : {}),
    }),
  queue: (kind: BarGameId, cancel = false) =>
    apiFetch<{ matchId: string | null }>(
      '/bar/games/queue',
      cancel ? { method: 'DELETE' } : post({ kind }),
    ),
  invite: (kind: BarGameId, userId: string) =>
    apiFetch('/bar/games/invites', post({ kind, userId })),
  respond: async (id: string, action: 'accept' | 'decline' | 'cancel') => {
    const owner = useGameInvites.getState().owner;
    const result = await apiFetch<{ matchId: string | null }>(`/bar/games/invites/${id}`, post({ action }));
    if (owner) useGameInvites.getState().remove(owner, id);
    return result;
  },
  localCards: (id: string, leave = false, finish = false) =>
    apiFetch('/bar/games/local-cards', post({ id, leave, finish })),
};
