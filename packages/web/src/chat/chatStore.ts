import { create } from 'zustand';
import type { ChatEvent } from './api.js';

interface ChatStoreState {
  unreadByChat: Record<string, number>;
  activeChatId: string | null;

  totalUnread(): number;

  setUnread(map: Record<string, number>): void;
  incrementUnread(chatId: string): void;
  resetUnread(chatId: string): void;
  setActive(chatId: string | null): void;
  applyEvent(event: ChatEvent): void;
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  unreadByChat: {},
  activeChatId: null,

  totalUnread() {
    let chats = 0;
    for (const v of Object.values(get().unreadByChat)) {
      if (v > 0) chats += 1;
    }
    return chats;
  },

  setUnread(map) {
    set({ unreadByChat: { ...map } });
  },

  incrementUnread(chatId) {
    set((s) => ({
      unreadByChat: { ...s.unreadByChat, [chatId]: (s.unreadByChat[chatId] ?? 0) + 1 },
    }));
  },

  resetUnread(chatId) {
    set((s) => ({ unreadByChat: { ...s.unreadByChat, [chatId]: 0 } }));
  },

  setActive(chatId) {
    set({ activeChatId: chatId });
  },

  applyEvent(event) {
    switch (event.type) {
      case 'message:new': {
        const { activeChatId } = get();
        if (activeChatId === event.chatId) return;
        set((s) => ({
          unreadByChat: {
            ...s.unreadByChat,
            [event.chatId]: (s.unreadByChat[event.chatId] ?? 0) + 1,
          },
        }));
        return;
      }
      case 'chat:read': {
        set((s) => ({ unreadByChat: { ...s.unreadByChat, [event.chatId]: 0 } }));
        return;
      }
      case 'message:deleted':
      case 'reaction:added':
      case 'reaction:removed':
        // Handled by TanStack invalidation in PR 5; no store mutation needed.
        return;
      case 'connection:ready':
        // Transport-layer signal; no store state to mutate.
        return;
    }
  },
}));
