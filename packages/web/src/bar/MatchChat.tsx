import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChatBubble } from '../chat/components/ChatBubble.js';
import { ChatInput } from '../chat/components/ChatInput.js';
import { MessageActionsMenu } from '../chat/components/MessageActionsMenu.js';
import { ReactionPicker } from '../chat/components/ReactionPicker.js';
import { useAuthStore } from '../auth/authStore.js';
import { useChatStore } from '../chat/chatStore.js';
import { chatKeys } from '../lib/queryKeys.js';
import type { ChatMessageDTO } from '../chat/api.js';
import {
  joinMatchChat,
  fetchMessages,
  sendMessage,
  addReaction,
  removeReaction,
  deleteMessage,
  markChatAsRead,
} from './chatApi.js';

export function MatchChat({
  kind,
  id,
  viewerId,
}: {
  kind: string;
  id: string;
  viewerId?: string;
}): JSX.Element {
  const qc = useQueryClient();
  const authenticatedId = useAuthStore((s) => s.user?.id ?? null);
  const meId = authenticatedId ?? viewerId ?? null;
  const room = useQuery({
    queryKey: ['bar-chat', kind, id],
    queryFn: () => joinMatchChat(kind, id),
    retry: false,
  });
  const chatId = room.data?.chatId ?? '';
  const query = useInfiniteQuery({
    queryKey: chatKeys.messages(chatId),
    enabled: !!chatId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchMessages(chatId, { limit: 50, ...(pageParam ? { before: pageParam } : {}) }),
    getNextPageParam: (last) =>
      last.length === 50
        ? last.reduce(
            (oldest, m) => (m.createdAt < oldest ? m.createdAt : oldest),
            last[0]!.createdAt,
          )
        : undefined,
    maxPages: 4,
  });
  const messages = [
    ...new Map((query.data?.pages.flat() ?? []).map((m) => [m.id, m])).values(),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [reply, setReply] = useState<ChatMessageDTO | null>(null);
  const [target, setTarget] = useState<{ message: ChatMessageDTO; rect: DOMRect } | null>(null);
  const [picker, setPicker] = useState<{ message: ChatMessageDTO; rect: DOMRect } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const composer = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(72);
  useLayoutEffect(() => {
    const el = composer.current;
    if (!el) return;
    const measure = () => setComposerHeight(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const newest = messages.at(-1)?.id;
  useEffect(() => {
    if (follow.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [newest, composerHeight]);
  useEffect(() => {
    if (!chatId) return;
    const store = useChatStore.getState();
    store.setActive(chatId);
    store.resetUnread(chatId);
    void markChatAsRead(chatId).catch(() => undefined);
    const visible = () => {
      if (!document.hidden) void qc.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      if (useChatStore.getState().activeChatId === chatId) useChatStore.getState().setActive(null);
    };
  }, [chatId, qc]);
  const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
  const react = async (messageId: string, emoji: string) => {
    try {
      setError('');
      const message = messages.find((m) => m.id === messageId);
      if (message?.reactions.some((r) => r.emoji === emoji && r.reactedByMe))
        await removeReaction(messageId, emoji);
      else await addReaction(messageId, emoji);
      await refresh();
    } catch {
      setError('Не удалось поставить реакцию. Попробуй ещё раз.');
    }
  };
  return (
    <>
      <h2 className="section-label bar-chat-title">Чат</h2>
      <section
        className="game-scoreboard game-scoreboard--stable-surface bar-chat"
        aria-label="Чат трансляции"
        style={{ '--bar-chat-composer-height': `${composerHeight}px` } as CSSProperties}
      >
        <div
          className="bar-chat-messages"
          ref={scroller}
          onScroll={() => {
            const el = scroller.current;
            if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }}
        >
          {query.hasNextPage && (
            <button
              className="btn btn--ghost"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Ранее
            </button>
          )}
          {(room.isError || query.isError) && (
            <button
              className="btn btn--ghost"
              onClick={() => {
                void room.refetch();
                void query.refetch();
              }}
            >
              Не удалось загрузить чат. Повторить
            </button>
          )}
          {!chatId && !room.isError && <p role="status">Подключаем чат…</p>}
          {chatId && !query.isPending && messages.length === 0 && (
            <p className="bar-empty">Пока нет сообщений. Обсудим игру?</p>
          )}
          {messages.map((message) => {
            const original = messages.find((m) => m.id === message.replyToId);
            return (
              <ChatBubble
                key={message.id}
                message={message}
                isOwn={message.senderId === meId}
                showAuthor
                replyTo={
                  original
                    ? {
                        senderName: original.senderDisplayName ?? 'Участник',
                        content: original.content,
                      }
                    : message.replyToId
                      ? { senderName: 'Ответ', content: 'Сообщение из истории' }
                      : null
                }
                onRequestActions={(m, rect) => setTarget({ message: m, rect })}
                onReact={(messageId, emoji) => void react(messageId, emoji)}
              />
            );
          })}
        </div>
        <div
          ref={composer}
          className="bar-chat-input chat-edge-bottom chat-edge-bottom--overlay glass-edge-fade glass-edge-fade--bottom"
        >
          {error && (
            <p role="alert" className="bar-chat-error">
              {error}
            </p>
          )}
          <ChatInput
            disabled={!chatId || pending}
            replyTo={reply}
            replyToSenderName={reply?.senderDisplayName ?? undefined}
            onClearReply={() => setReply(null)}
            onSend={async (content, replyToId) => {
              setPending(true);
              setError('');
              try {
                await sendMessage(chatId, { content, ...(replyToId ? { replyToId } : {}) });
                setReply(null);
                follow.current = true;
                await refresh();
              } catch {
                setError('Сообщение не отправилось. Попробуй ещё раз.');
                throw new Error('send failed');
              } finally {
                setPending(false);
              }
            }}
          />
        </div>
        <MessageActionsMenu
          open={!!target}
          anchorRect={target?.rect ?? null}
          isOwn={target?.message.senderId === meId}
          onClose={() => setTarget(null)}
          onReply={() => {
            if (target) setReply(target.message);
            setTarget(null);
          }}
          onPickEmoji={(emoji) => {
            if (target) void react(target.message.id, emoji);
            setTarget(null);
          }}
          onMoreEmoji={() => {
            setPicker(target);
            setTarget(null);
          }}
          onDelete={() => {
            if (target)
              void deleteMessage(target.message.id)
                .then(refresh)
                .catch(() => setError('Не удалось удалить сообщение'));
            setTarget(null);
          }}
        />
        <ReactionPicker
          open={!!picker}
          anchorRect={picker?.rect ?? null}
          onClose={() => setPicker(null)}
          onPick={(emoji) => {
            if (picker) void react(picker.message.id, emoji);
            setPicker(null);
          }}
        />
      </section>
    </>
  );
}
