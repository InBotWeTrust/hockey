import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../chatStore.js';
import type { ChatEvent, ChatMessageDTO } from '../api.js';

const baseMessage: ChatMessageDTO = {
  id: 'msg-1',
  chatId: 'chat-A',
  senderId: 'user-other',
  senderDisplayName: null,
  senderAvatarUrl: null,
  content: 'hello',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T00:00:00.000Z',
  reactions: [],
};

describe('chatStore', () => {
  beforeEach(() => {
    // Zustand stores keep state across tests in the same module load — reset.
    useChatStore.setState({ unreadByChat: {}, activeChatId: null });
  });

  it('totalUnread counts chats with >0 unread (not message sum)', () => {
    useChatStore.getState().setUnread({ 'chat-A': 2, 'chat-B': 5, 'chat-C': 0 });
    expect(useChatStore.getState().totalUnread()).toBe(2);
  });

  it('totalUnread is 0 when all chats are zero', () => {
    useChatStore.getState().setUnread({ 'chat-A': 0, 'chat-B': 0 });
    expect(useChatStore.getState().totalUnread()).toBe(0);
  });

  it('totalUnread is 0 when map is empty', () => {
    expect(useChatStore.getState().totalUnread()).toBe(0);
  });

  it('setUnread replaces the entire map', () => {
    useChatStore.getState().setUnread({ 'chat-A': 3 });
    useChatStore.getState().setUnread({ 'chat-B': 1 });
    expect(useChatStore.getState().unreadByChat).toEqual({ 'chat-B': 1 });
  });

  it('incrementUnread bumps a single chat by 1, default 0', () => {
    useChatStore.getState().incrementUnread('chat-A');
    useChatStore.getState().incrementUnread('chat-A');
    useChatStore.getState().incrementUnread('chat-B');
    expect(useChatStore.getState().unreadByChat).toEqual({ 'chat-A': 2, 'chat-B': 1 });
  });

  it('resetUnread sets one chat to 0 (key kept so total stays stable)', () => {
    useChatStore.getState().setUnread({ 'chat-A': 4, 'chat-B': 1 });
    useChatStore.getState().resetUnread('chat-A');
    expect(useChatStore.getState().unreadByChat).toEqual({ 'chat-A': 0, 'chat-B': 1 });
  });

  it('setActive updates activeChatId; null is allowed', () => {
    useChatStore.getState().setActive('chat-A');
    expect(useChatStore.getState().activeChatId).toBe('chat-A');
    useChatStore.getState().setActive(null);
    expect(useChatStore.getState().activeChatId).toBeNull();
  });

  it('applyEvent message:new increments unread when chat is not active', () => {
    useChatStore.getState().setActive('chat-other');
    const ev: ChatEvent = { type: 'message:new', chatId: 'chat-A', message: baseMessage };
    useChatStore.getState().applyEvent(ev);
    expect(useChatStore.getState().unreadByChat['chat-A']).toBe(1);
  });

  it('applyEvent message:new does NOT increment unread when chat IS active', () => {
    useChatStore.getState().setActive('chat-A');
    const ev: ChatEvent = { type: 'message:new', chatId: 'chat-A', message: baseMessage };
    useChatStore.getState().applyEvent(ev);
    expect(useChatStore.getState().unreadByChat['chat-A']).toBeUndefined();
  });

  it('applyEvent chat:read resets unread for that chat (other-tab sync)', () => {
    useChatStore.getState().setUnread({ 'chat-A': 3 });
    const ev: ChatEvent = {
      type: 'chat:read',
      chatId: 'chat-A',
      userId: 'me',
      lastReadAt: '2026-04-26T00:00:00.000Z',
    };
    useChatStore.getState().applyEvent(ev);
    expect(useChatStore.getState().unreadByChat['chat-A']).toBe(0);
  });

  it('applyEvent message:deleted is a no-op on unread', () => {
    useChatStore.getState().setUnread({ 'chat-A': 2 });
    const ev: ChatEvent = { type: 'message:deleted', chatId: 'chat-A', messageId: 'msg-1' };
    useChatStore.getState().applyEvent(ev);
    expect(useChatStore.getState().unreadByChat['chat-A']).toBe(2);
  });

  it('applyEvent reaction:added is a no-op on store state (handled by query invalidation)', () => {
    useChatStore.getState().setUnread({ 'chat-A': 2 });
    const ev: ChatEvent = {
      type: 'reaction:added',
      chatId: 'chat-A',
      messageId: 'msg-1',
      userId: 'u',
      emoji: 'thumbs-up',
    };
    useChatStore.getState().applyEvent(ev);
    expect(useChatStore.getState().unreadByChat['chat-A']).toBe(2);
  });
});
