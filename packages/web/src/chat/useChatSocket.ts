import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ChatSocket, type ChatSocketStatus } from './ws.js';
import { useAuthStore } from '../auth/authStore.js';
import { useChatStore } from './chatStore.js';
import { refreshAccessToken } from '../api/apiFetch.js';
import { chatKeys } from '../lib/queryKeys.js';
import { applyReactionEventToMessage } from './reactionsState.js';
import type { ChatEvent, ChatMessageDTO } from './api.js';

interface InfinitePages {
  pages: ChatMessageDTO[][];
  pageParams: unknown[];
}

function applyMessageNew(qc: QueryClient, chatId: string, msg: ChatMessageDTO): void {
  qc.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
    if (!old) return { pages: [[msg]], pageParams: [undefined] };
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

function applyChatRead(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: chatKeys.unread() });
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
        useChatStore.getState().applyEvent(event);
        switch (event.type) {
          case 'message:new':
            applyMessageNew(qc, event.chatId, event.message);
            return;
          case 'message:deleted':
            applyMessageDeleted(qc, event.chatId, event.messageId);
            return;
          case 'chat:read':
            applyChatRead(qc);
            return;
          case 'reaction:added':
          case 'reaction:removed':
            applyReactionEvent(qc, useAuthStore.getState().user?.id ?? null, event);
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
