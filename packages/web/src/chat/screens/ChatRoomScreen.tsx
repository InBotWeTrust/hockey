import { useEffect, useMemo, useState, useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import {
  deleteMessage,
  fetchMessages,
  markChatAsRead,
  sendMessage,
  type ChatDTO,
  type ChatMessageDTO,
} from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { useAuthStore } from '../../auth/authStore.js';
import { ChatBubble } from '../components/ChatBubble.js';
import { ChatInput } from '../components/ChatInput.js';

const PAGE_SIZE = 50;

interface InfinitePages {
  pages: ChatMessageDTO[][];
  pageParams: unknown[];
}

export function ChatRoomScreen(): JSX.Element {
  const params = useParams<{ chatId: string }>();
  const chatId = params.chatId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const setActive = useChatStore((s) => s.setActive);
  const resetUnread = useChatStore((s) => s.resetUnread);

  const [replyTo, setReplyTo] = useState<ChatMessageDTO | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Pull chat metadata from the list cache so the search placeholder hints at
  // which chat we're in (DM counterpart name / system channel name).
  const chatMeta = queryClient
    .getQueryData<ChatDTO[]>(chatKeys.list())
    ?.find((c) => c.id === chatId);
  const chatTitle =
    chatMeta?.type === 'direct'
      ? (chatMeta.dmCounterpart?.displayName ?? 'Диалог')
      : (chatMeta?.name ?? (chatMeta?.type === 'system' ? 'Системный канал' : 'Чат'));

  // Track active chat in the store so message:new from PR 5 won't
  // increment unread for THIS chat.
  useEffect(() => {
    if (!chatId) return;
    setActive(chatId);
    return () => setActive(null);
  }, [chatId, setActive]);

  const query = useInfiniteQuery<
    ChatMessageDTO[],
    Error,
    InfinitePages,
    ReturnType<typeof chatKeys.messages>,
    string | undefined
  >({
    queryKey: chatKeys.messages(chatId),
    enabled: chatId.length > 0,
    queryFn: ({ pageParam }) =>
      fetchMessages(chatId, {
        limit: PAGE_SIZE,
        ...(pageParam ? { before: pageParam } : {}),
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      // Server returns DESC by created_at — last item in the array is the OLDEST in this page.
      return lastPage[lastPage.length - 1]?.createdAt;
    },
    staleTime: Infinity,
  });

  // Mark as read on mount + when query first fetches.
  const { mutate: markRead } = useMutation({
    mutationFn: () => markChatAsRead(chatId),
    onSuccess: () => {
      resetUnread(chatId);
      void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });

  useEffect(() => {
    if (chatId.length === 0) return;
    if (!query.data) return;
    markRead();
  }, [chatId, query.data, markRead]);

  // Flatten pages, oldest at top.
  const messages = useMemo<ChatMessageDTO[]>(() => {
    if (!query.data) return [];
    const all = query.data.pages.flat();
    // Server returns each page DESC; we want ASC for display.
    return [...all].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }, [query.data]);

  const messageById = useMemo(() => {
    const map = new Map<string, ChatMessageDTO>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const senderNameOf = useCallback(
    (msg: ChatMessageDTO): string => (msg.senderId === meId ? 'Вы' : 'Собеседник'),
    [meId],
  );

  const sendMut = useMutation({
    mutationFn: (vars: { content: string; replyToId: string | null }) =>
      sendMessage(chatId, {
        content: vars.content,
        ...(vars.replyToId !== null ? { replyToId: vars.replyToId } : {}),
      }),
    onSuccess: (msg) => {
      // Append to first page (server returns the created DTO).
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return { pages: [[msg]], pageParams: [undefined] };
        const firstPage = old.pages[0] ?? [];
        // Insert as newest (server DESC: index 0).
        const nextFirst = [msg, ...firstPage];
        return { ...old, pages: [nextFirst, ...old.pages.slice(1)] };
      });
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onMutate: (messageId) => {
      // Optimistic patch: mark as deleted in-cache.
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((m) => (m.id === messageId ? { ...m, isDeleted: true, content: '' } : m)),
          ),
        };
      });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });

  // Stable callbacks so memoised ChatBubble doesn't churn on each render.
  const onReply = useCallback((m: ChatMessageDTO) => setReplyTo(m), []);
  const onDelete = useCallback((id: string) => deleteMut.mutate(id), [deleteMut]);

  const handleSend = useCallback(
    (content: string, replyToId: string | null): void => {
      sendMut.mutate({ content, replyToId });
    },
    [sendMut],
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const visibleMessages = useMemo<ChatMessageDTO[]>(() => {
    if (trimmedQuery.length === 0) return messages;
    return messages.filter(
      (m) => !m.isDeleted && m.content.toLowerCase().includes(trimmedQuery),
    );
  }, [messages, trimmedQuery]);

  return (
    <main
      className="screen"
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        bottom: 0,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: 'calc(10px + env(safe-area-inset-top, 0px) / 2) 12px 0',
        }}
      >
        <button
          type="button"
          className="icon-btn glass"
          aria-label="К списку чатов"
          onClick={() => navigate('/chat')}
          style={{
            width: 40,
            height: 40,
            minWidth: 40,
            minHeight: 40,
            borderRadius: 999,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <div
          className="glass"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 12px',
            height: 40,
            borderRadius: 999,
          }}
        >
          <Search size={14} color="var(--muted)" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Поиск в «${chatTitle}»`}
            aria-label="Поиск по чату"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--ink)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      <div
        data-testid="messages-list"
        style={{
          flex: 1,
          minHeight: 0,
          padding: '8px 14px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {query.hasNextPage && trimmedQuery.length === 0 && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            style={{ alignSelf: 'center', margin: '4px 0 12px', fontSize: 12, padding: '8px 14px' }}
          >
            {query.isFetchingNextPage ? 'Загрузка...' : 'Загрузить ещё'}
          </button>
        )}
        {visibleMessages.length === 0 && trimmedQuery.length > 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
            Ничего не найдено
          </div>
        )}
        {visibleMessages.map((m) => {
          const isOwn = m.senderId === meId;
          const replyParent = m.replyToId ? messageById.get(m.replyToId) : undefined;
          const replyTo = replyParent
            ? { senderName: senderNameOf(replyParent), content: replyParent.content }
            : null;
          return (
            <ChatBubble
              key={m.id}
              message={m}
              isOwn={isOwn}
              replyTo={replyTo}
              onReply={onReply}
              onDelete={onDelete}
            />
          );
        })}
      </div>

      <div style={{ marginBottom: `calc(12px + env(safe-area-inset-bottom, 0px) / 2)` }}>
        <ChatInput
          replyTo={replyTo}
          replyToSenderName={replyTo ? senderNameOf(replyTo) : undefined}
          onClearReply={() => setReplyTo(null)}
          disabled={sendMut.isPending}
          onSend={handleSend}
        />
      </div>
    </main>
  );
}
