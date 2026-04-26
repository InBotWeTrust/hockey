import { useEffect, useMemo, useState, useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
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
import { ChatRoomHeader } from '../components/ChatRoomHeader.js';
import { ChatRoomSearchBar } from '../components/ChatRoomSearchBar.js';
import { MessageActionsMenu } from '../components/MessageActionsMenu.js';

const PAGE_SIZE = 50;

interface InfinitePages {
  pages: ChatMessageDTO[][];
  pageParams: unknown[];
}

interface ActionTarget {
  message: ChatMessageDTO;
  anchorRect: DOMRect;
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);

  const chatMeta = queryClient
    .getQueryData<ChatDTO[]>(chatKeys.list())
    ?.find((c) => c.id === chatId);
  const chatTitle =
    chatMeta?.type === 'direct'
      ? (chatMeta.dmCounterpart?.displayName ?? 'Диалог')
      : (chatMeta?.name ?? (chatMeta?.type === 'system' ? 'Системный канал' : 'Чат'));
  const chatAvatarUrl = chatMeta?.dmCounterpart?.avatarUrl ?? null;

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
      return lastPage[lastPage.length - 1]?.createdAt;
    },
    staleTime: Infinity,
  });

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

  const messages = useMemo<ChatMessageDTO[]>(() => {
    if (!query.data) return [];
    const all = query.data.pages.flat();
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
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return { pages: [[msg]], pageParams: [undefined] };
        const firstPage = old.pages[0] ?? [];
        const nextFirst = [msg, ...firstPage];
        return { ...old, pages: [nextFirst, ...old.pages.slice(1)] };
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onMutate: (messageId) => {
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
  });

  const onRequestActions = useCallback(
    (message: ChatMessageDTO, anchorRect: DOMRect): void => {
      setActionTarget({ message, anchorRect });
    },
    [],
  );
  const onCloseActions = useCallback(() => setActionTarget(null), []);

  const onReplyTo = useCallback((m: ChatMessageDTO) => setReplyTo(m), []);
  const onDeleteId = useCallback((id: string) => deleteMut.mutate(id), [deleteMut]);

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

  const actionMessage = actionTarget?.message ?? null;
  const actionIsOwn = actionMessage ? actionMessage.senderId === meId : false;

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
      <ChatRoomHeader
        title={chatTitle}
        avatarUrl={chatAvatarUrl}
        onBack={() => navigate('/chat')}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((o) => !o)}
      />
      <ChatRoomSearchBar
        open={searchOpen}
        value={searchQuery}
        placeholder={`Поиск в «${chatTitle}»`}
        onChange={setSearchQuery}
      />

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
              onRequestActions={onRequestActions}
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

      <MessageActionsMenu
        open={actionTarget !== null}
        anchorRect={actionTarget?.anchorRect ?? null}
        isOwn={actionIsOwn}
        onReply={() => actionMessage && onReplyTo(actionMessage)}
        onDelete={() => actionMessage && onDeleteId(actionMessage.id)}
        onClose={onCloseActions}
      />
    </main>
  );
}
