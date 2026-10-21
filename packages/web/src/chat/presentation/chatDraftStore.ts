import { create } from 'zustand';
interface DraftState {
  owner: string | null;
  drafts: Record<string, string>;
  set: (owner: string, chatId: string, text: string) => void;
  read: (owner: string, chatId: string) => string;
  switchOwner: (owner: string | null) => void;
  clear: () => void;
}
export const chatDraftKey = (owner: string, chatId: string) => JSON.stringify([owner, chatId]);
export const useChatDraftStore = create<DraftState>((set, get) => ({
  owner: null,
  drafts: {},
  set: (owner, chatId, text) =>
    set((state) => ({
      owner,
      drafts: {
        ...(state.owner === owner ? state.drafts : {}),
        [chatDraftKey(owner, chatId)]: text,
      },
    })),
  read: (owner, chatId) => get().drafts[chatDraftKey(owner, chatId)] ?? '',
  switchOwner: (owner) => {
    if (get().owner !== owner) set({ owner, drafts: {} });
  },
  clear: () => set({ owner: null, drafts: {} }),
}));
