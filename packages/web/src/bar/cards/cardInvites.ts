import { create } from 'zustand';
import type { Invite } from './onlineApi.js';
export const useCardInvites = create<{
  incoming: Invite[];
  version: number;
  setIncoming: (rows: Invite[]) => void;
  remove: (id: string) => void;
}>((set) => ({
  incoming: [],
  version: 0,
  setIncoming: (incoming) => set({ incoming }),
  remove: (id) =>
    set((state) => ({
      incoming: state.incoming.filter((i) => i.id !== id),
      version: state.version + 1,
    })),
}));
export function incomingInvites(rows: Invite[], userId: string, now = Date.now()) {
  return rows.filter(
    (i) =>
      i.receiver_id === userId && i.status === 'pending' && new Date(i.expires_at).getTime() > now,
  );
}
