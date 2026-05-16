import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ChatSocket, type ChatSocketStatus } from './ws.js';
import { useAuthStore } from '../auth/authStore.js';
import { useChatStore } from './chatStore.js';
import { refreshAccessToken } from '../api/apiFetch.js';
import { chatKeys } from '../lib/queryKeys.js';
import { applyReactionEventToMessage } from './reactionsState.js';
import type { ChatDTO, ChatEvent, ChatMessageDTO } from './api.js';

interface InfinitePages {
  pages: ChatMessageDTO[][];
  pageParams: unknown[];
}

function sortChatList(a: ChatDTO, b: ChatDTO): number {
  const channelDiff = Number(b.type === 'channel') - Number(a.type === 'channel');
  if (channelDiff !== 0) return channelDiff;

  const pinnedA = a.pinnedAt ? new Date(a.pinnedAt).getTime() : Number.NEGATIVE_INFINITY;
  const pinnedB = b.pinnedAt ? new Date(b.pinnedAt).getTime() : Number.NEGATIVE_INFINITY;
  if (pinnedA !== pinnedB) return pinnedB - pinnedA;

  const lastA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : Number.NEGATIVE_INFINITY;
  const lastB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : Number.NEGATIVE_INFINITY;
  return lastB - lastA;
}

function applyMessageNewToChatList(
  qc: QueryClient,
  chatId: string,
  msg: ChatMessageDTO,
  meId: string | null,
  activeChatId: string | null,
  silent: boolean,
): void {
  qc.setQueryData<ChatDTO[] | undefined>(chatKeys.list(), (old) => {
    if (!old) return old;
    let touched = false;
    const next = old.map((chat) => {
      if (chat.id !== chatId) return chat;
      touched = true;
      const shouldIncrementUnread =
        !silent && msg.senderId !== meId && activeChatId !== chatId;
      return {
        ...chat,
        lastMessageAt: msg.createdAt,
        lastMessage: msg,
        lastMessageSenderName: msg.senderDisplayName,
        unreadCount: shouldIncrementUnread ? chat.unreadCount + 1 : chat.unreadCount,
      };
    });
    return touched ? next.sort(sortChatList) : old;
  });
}

function applyMessageNew(qc: QueryClient, chatId: string, msg: ChatMessageDTO): void {
  qc.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
    if (!old) {
      // Cache not yet initialized — the initial fetchMessages is in flight.
      // Writing a {pages:[[msg]]} shell here gets overwritten when the fetch
      // resolves (TanStack replaces the page for pageParam=undefined), and
      // the WS-arrived message silently vanishes from the UI until reload.
      // Trigger a refetch instead — by the time WS publishes, the message
      // is already committed in the DB, so the refresh will include it.
      void qc.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
      return old;
    }
    const flat = old.pages.flat();
    if (flat.some((m) => m.id === msg.id)) return old;
    const firstPage = old.pages[0] ?? [];
    const nextFirst = [msg, ...firstPage];
    return { ...old, pages: [nextFirst, ...old.pages.slice(1)] };
  });
  void qc.invalidateQueries({ queryKey: chatKeys.list() });
  void qc.invalidateQueries({ queryKey: chatKeys.unread() });
}

function applyMessageDeleted(qc: QueryClient, chatId: string, messageId: string): void {
  let didPatch = false;
  qc.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
    if (!old) return old;
    let touched = false;
    const pages = old.pages.map((page) =>
      page.map((m) => {
        if (m.id !== messageId) return m;
        if (m.isDeleted && m.content === '') return m;
        touched = true;
        return { ...m, isDeleted: true, content: '' };
      }),
    );
    if (touched) didPatch = true;
    return touched ? { ...old, pages } : old;
  });
  if (didPatch) void qc.invalidateQueries({ queryKey: chatKeys.list() });
}

function applyMessageUpdated(qc: QueryClient, chatId: string, message: ChatMessageDTO): void {
  qc.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
    if (!old) {
      void qc.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
      return old;
    }
    let touched = false;
    const pages = old.pages.map((page) =>
      page.map((m) => {
        if (m.id !== message.id) return m;
        touched = true;
        return message;
      }),
    );
    return touched ? { ...old, pages } : old;
  });
  qc.setQueryData<ChatMessageDTO | undefined>(chatKeys.channelPost(message.id), (old) =>
    old ? message : old,
  );
  void qc.invalidateQueries({ queryKey: chatKeys.list() });
}

function applyChatRead(
  qc: QueryClient,
  event: Extract<ChatEvent, { type: 'chat:read' }>,
  meId: string | null,
): void {
  if (event.userId === meId) {
    qc.setQueryData<ChatDTO[] | undefined>(chatKeys.list(), (old) => {
      if (!old) return old;
      let touched = false;
      const next = old.map((chat) => {
        if (chat.id !== event.chatId || chat.unreadCount === 0) return chat;
        touched = true;
        return { ...chat, unreadCount: 0 };
      });
      return touched ? next : old;
    });
    void qc.invalidateQueries({ queryKey: chatKeys.unread() });
    return;
  }
  qc.setQueryData<ChatDTO[] | undefined>(chatKeys.list(), (old) => {
    if (!old) return old;
    let touched = false;
    const next = old.map((chat) => {
      if (
        chat.id !== event.chatId ||
        chat.type !== 'direct' ||
        chat.dmCounterpart?.userId !== event.userId
      ) {
        return chat;
      }
      touched = true;
      return {
        ...chat,
        dmCounterpart: {
          ...chat.dmCounterpart,
          lastReadAt: event.lastReadAt,
        },
      };
    });
    return touched ? next : old;
  });
}

function applyReactionEvent(
  qc: QueryClient,
  meId: string | null,
  event: Extract<ChatEvent, { type: 'reaction:added' | 'reaction:removed' }>,
): void {
  qc.setQueryData<InfinitePages | undefined>(chatKeys.messages(event.chatId), (old) => {
    if (!old) return old;
    let touched = false;
    const pages = old.pages.map((page) =>
      page.map((m) => {
        if (m.id !== event.messageId) return m;
        const next = applyReactionEventToMessage(m, event, meId);
        if (next === m) return m;
        touched = true;
        return next;
      }),
    );
    return touched ? { ...old, pages } : old;
  });
}

export function useChatSocket(): ChatSocketStatus {
  const qc = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [status, setStatus] = useState<ChatSocketStatus>('closed');
  const firstOpenRef = useRef(true);

  useEffect(() => {
    if (!accessToken) {
      setStatus('closed');
      firstOpenRef.current = true;
      return;
    }

    const sock = new ChatSocket({
      getToken: () => useAuthStore.getState().accessToken,
      refresh: () => refreshAccessToken(),
      onEvent: (event: ChatEvent) => {
        const meId = useAuthStore.getState().user?.id ?? null;
        if (event.type !== 'chat:read' || event.userId === meId) {
          useChatStore.getState().applyEvent(event);
        }
        switch (event.type) {
          case 'message:new':
            applyMessageNewToChatList(
              qc,
              event.chatId,
              event.message,
              meId,
              useChatStore.getState().activeChatId,
              event.silent === true,
            );
            applyMessageNew(qc, event.chatId, event.message);
            return;
          case 'message:deleted':
            applyMessageDeleted(qc, event.chatId, event.messageId);
            return;
          case 'message:updated':
            applyMessageUpdated(qc, event.chatId, event.message);
            return;
          case 'chat:read':
            applyChatRead(qc, event, meId);
            return;
          case 'reaction:added':
          case 'reaction:removed':
            applyReactionEvent(qc, meId, event);
            return;
          case 'connection:ready':
            // Server finished registering Redis SUBSCRIBEs. Pure transport
            // signal — no cache to patch.
            return;
        }
      },
      onStatus: (next) => {
        setStatus(next);
        if (next === 'open') {
          if (firstOpenRef.current) {
            firstOpenRef.current = false;
            return;
          }
          // Reconnect arrival — catch up.
          void qc.refetchQueries({ queryKey: chatKeys.list() });
          const active = useChatStore.getState().activeChatId;
          if (active) {
            void qc.refetchQueries({ queryKey: chatKeys.messages(active) });
          }
        }
      },
    });
    sock.connect();

    return () => {
      sock.disconnect();
      firstOpenRef.current = true;
    };
  }, [accessToken, qc]);

  return status;
}
