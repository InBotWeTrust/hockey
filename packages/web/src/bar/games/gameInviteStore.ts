import { create } from 'zustand';
import type { BarGameInvite } from '@hockey/game-core';

export function incomingGameInvites(rows: BarGameInvite[], owner: string, now = Date.now()) {
  const seen = new Set<string>();
  return rows.filter(invite => {
    if (invite.receiverId !== owner || invite.status !== 'pending' || !Number.isFinite(invite.expiresAt) || invite.expiresAt <= now || seen.has(invite.id)) return false;
    seen.add(invite.id);
    return true;
  });
}

export const useGameInvites = create<{
  owner: string | null;
  incoming: BarGameInvite[];
  revision: number;
  reset: (owner: string | null) => void;
  replace: (owner: string, rows: BarGameInvite[], revision: number) => void;
  prune: (owner: string) => void;
  remove: (owner: string, id: string) => void;
}>((set) => ({
  owner: null,
  incoming: [],
  revision: 0,
  reset: owner => set(state => ({ owner, incoming: [], revision: state.revision + 1 })),
  replace: (owner, rows, revision) => set(state => state.owner === owner && state.revision === revision
    ? { incoming: incomingGameInvites(rows, owner) } : state),
  prune: owner => set(state => state.owner === owner ? { incoming: incomingGameInvites(state.incoming, owner) } : state),
  remove: (owner, id) => set(state => state.owner === owner
    ? { incoming: state.incoming.filter(invite => invite.id !== id), revision: state.revision + 1 } : state),
}));
