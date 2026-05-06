import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import {
  clearChannelPollVote,
  deleteChannelPost,
  deleteMessage,
  fetchChatList,
  fetchMessages,
  markChatAsRead,
  sendMessage,
  updateChannelPost,
  addReaction,
  removeReaction,
  voteChannelPoll,
  type ChatDTO,
  type ChatMessageDTO,
  type AmateurDuelInviteMessageMetadata,
  type UserPickerItem,
} from '../api.js';
import { acceptAmateurDuel, declineAmateurDuel } from '../../api/amateurDuel.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { useAuthStore } from '../../auth/authStore.js';
import { ChatBubble } from '../components/ChatBubble.js';
import { ChatInput } from '../components/ChatInput.js';
import { ChatRoomHeader } from '../components/ChatRoomHeader.js';
import { ChatRoomSearchBar } from '../components/ChatRoomSearchBar.js';
import { MessageActionsMenu } from '../components/MessageActionsMenu.js';
import { ReactionPicker } from '../components/ReactionPicker.js';
import { UserProfileSheet } from '../components/UserProfileSheet.js';
import { ChannelPostCard } from '../components/ChannelPostCard.js';
import { ChannelPostEditorSheet } from '../components/ChannelPostEditorSheet.js';
import { ChannelPollComposerSheet } from '../components/ChannelPollComposerSheet.js';
import { formatLastSeen } from '../lastSeen.js';
import { switchMyReactionTo, removeMyReaction } from '../reactionsState.js';

const PAGE_SIZE = 50;

function formatMemberCount(n: number): string {
  // Russian plural rules for "участник".
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} участника`;
  return `${n} участников`;
}

function formatSubscriberCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} подписчик`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} подписчика`;
  return `${n} подписчиков`;
}

interface InfinitePages {
  pages: ChatMessageDTO[][];
  pageParams: unknown[];
}

interface ActionTarget {
  message: ChatMessageDTO;
  anchorRect: DOMRect;
}

type DuelInviteResolution = 'accepted' | 'declined' | 'unavailable';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseDuelInviteMetadata(
  metadata: ChatMessageDTO['metadata'],
): AmateurDuelInviteMessageMetadata | null {
  if (!isRecord(metadata) || metadata.type !== 'amateur_duel_invite') return null;
  const strings = [
    metadata.matchId,
    metadata.templateTitle,
    metadata.challengerName,
    metadata.startsAt,
    metadata.endsAt,
  ];
  const numbers = [
    metadata.totalPeriods,
    metadata.shotsPerPeriod,
    metadata.periodDurationMs,
    metadata.breakDurationMs,
    metadata.stakeAmount,
    metadata.entryFeeAmount,
    metadata.bankAmount,
  ];
  if (!strings.every((value) => typeof value === 'string' && value.length > 0)) return null;
  if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  return metadata as AmateurDuelInviteMessageMetadata;
}

function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatInviteMoney(amount: number): string {
  return amount > 0 ? String(amount) : 'нет';
}

function DuelInviteMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        minWidth: 0,
        padding: '7px 8px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.5)',
        border: '1px solid rgba(148, 163, 184, 0.28)',
      }}
    >
      <div
        style={{
          color: 'rgba(71, 85, 105, 0.72)',
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: 0,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function DuelInviteActions({
  invite,
  resolution,
  pending,
  onAccept,
  onDecline,
}: {
  invite: AmateurDuelInviteMessageMetadata;
  resolution: DuelInviteResolution | undefined;
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
}): JSX.Element {
  const status =
    resolution === 'accepted'
      ? 'Дуэль принята'
      : resolution === 'declined'
        ? 'Вы отказались'
        : resolution === 'unavailable'
          ? 'Вызов уже недоступен'
          : null;

  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        paddingTop: 8,
        borderTop: '1px solid rgba(148, 163, 184, 0.24)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <DuelInviteMetric
          label="Формат"
          value={`${invite.totalPeriods}×${invite.shotsPerPeriod}`}
        />
        <DuelInviteMetric label="Банк" value={formatInviteMoney(invite.bankAmount)} />
        <DuelInviteMetric label="До" value={formatInviteDate(invite.endsAt)} />
        <DuelInviteMetric label="Взнос" value={formatInviteMoney(invite.entryFeeAmount)} />
      </div>
      {status ? (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 999,
            background: 'rgba(15, 23, 42, 0.08)',
            color: 'var(--ink)',
            fontSize: 12,
            fontWeight: 900,
            textAlign: 'center',
          }}
        >
          {status}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button
            type="button"
            className="btn btn--cta"
            disabled={pending}
            onClick={onAccept}
            style={{ minHeight: 36, padding: '8px 10px', fontSize: 12 }}
          >
            Принять
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={pending}
            onClick={onDecline}
            style={{ minHeight: 36, padding: '8px 10px', fontSize: 12 }}
          >
            Отказаться
          </button>
        </div>
      )}
    </div>
  );
}

export function ChatRoomScreen(): JSX.Element {
  const params = useParams<{ chatId: string }>();
  const chatId = params.chatId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const goto = searchParams.get('goto');
  const me = useAuthStore((s) => s.user);
  const meId = me?.id ?? null;
  const isAdmin = me?.role === 'admin';
  const setActive = useChatStore((s) => s.setActive);
  const resetUnread = useChatStore((s) => s.resetUnread);

  const [replyTo, setReplyTo] = useState<ChatMessageDTO | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{
    messageId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [previewSender, setPreviewSender] = useState<UserPickerItem | null>(null);
  const [editingPost, setEditingPost] = useState<ChatMessageDTO | null>(null);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [gotoError, setGotoError] = useState<string | null>(null);
  const [duelInviteResolutionByMatch, setDuelInviteResolutionByMatch] = useState<
    Record<string, DuelInviteResolution>
  >({});
  const gotoRef = useRef<string | null>(null);
  const messagesListRef = useRef<HTMLDivElement | null>(null);
  // Android (especially MIUI WebView) and some iOS Safari builds don't shrink
  // `100dvh` when the soft keyboard opens, so the composer ends up beneath
  // the keyboard. visualViewport.height is the source of truth — track it
  // and pin the screen height to it so the layout adapts in real time.
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = (): void => setViewportHeight(vv.height);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  // Auto-follow only when the user is already near the bottom; pagination
  // (loading older messages) keeps the viewport stable instead of jumping.
  const isNearBottomRef = useRef(true);

  // Lazy-fetch the chat list when entering by direct URL: without this the
  // header would render the "Чат" fallback until the user visits /chat.
  // Reuses the same key as ChatListScreen, so the cache stays consistent.
  const chatListQuery = useQuery<ChatDTO[]>({
    queryKey: chatKeys.list(),
    queryFn: fetchChatList,
    staleTime: 30_000,
  });
  const chatMeta = chatListQuery.data?.find((c) => c.id === chatId);
  const isChannel = chatMeta?.type === 'channel';
  const dmCounterpart = chatMeta?.type === 'direct' ? chatMeta.dmCounterpart : null;
  const chatTitle =
    chatMeta?.type === 'direct'
      ? (dmCounterpart?.displayName ?? 'Диалог')
      : (chatMeta?.name ??
        (chatMeta?.type === 'channel'
          ? 'Канал'
          : chatMeta?.type === 'system'
            ? 'Системный канал'
            : 'Чат'));
  const chatAvatarUrl = dmCounterpart?.avatarUrl ?? null;
  const chatSubtitle =
    chatMeta?.type === 'direct'
      ? formatLastSeen(dmCounterpart?.lastSeenAt ?? null)
      : chatMeta
        ? chatMeta.type === 'channel'
          ? `Канал · ${formatSubscriberCount(chatMeta.memberCount)}`
          : formatMemberCount(chatMeta.memberCount)
        : undefined;
  // Show avatar + author name on every foreign bubble in non-DM chats so
  // members can tell who said what. DMs keep the cleaner layout (header
  // already names the counterpart). Default to false until chatMeta loads,
  // so the bubble structure stays stable while tests/cold-loads warm up.
  const showAuthorOnBubbles =
    chatMeta !== undefined && chatMeta.type !== 'direct' && chatMeta.type !== 'channel';
  const counterpartLastReadAt =
    chatMeta?.type === 'direct' ? (chatMeta.dmCounterpart?.lastReadAt ?? null) : null;

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
    queryFn: async ({ pageParam }) => {
      // First fetch with ?goto=<id>: try around-mode; on failure (404 etc.) fall back
      // to the default last-page load and surface a non-blocking error banner.
      if (pageParam === undefined && goto) {
        try {
          const res = await fetchMessages(chatId, { around: goto, radius: 25 });
          return res;
        } catch {
          setGotoError('Сообщение недоступно');
          setSearchParams({}, { replace: true });
          return await fetchMessages(chatId, { limit: PAGE_SIZE });
        }
      }
      return await fetchMessages(chatId, {
        limit: PAGE_SIZE,
        ...(pageParam ? { before: pageParam } : {}),
      });
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      // For the around first-page (asc order), `oldest` is the FIRST element.
      // For default before-paginated pages (desc order), oldest is the LAST.
      // Both cases: pick whichever createdAt is earliest in the page.
      let oldest = lastPage[0]?.createdAt;
      for (const m of lastPage) {
        if (oldest === undefined || m.createdAt < oldest) oldest = m.createdAt;
      }
      return oldest;
    },
    staleTime: Infinity,
  });

  // When ?goto changes (or appears), wipe the cache for this chat so the queryFn
  // re-runs with the new goto branch. Same cache-key keeps WS patches consistent.
  useEffect(() => {
    if (goto !== gotoRef.current) {
      gotoRef.current = goto;
      if (goto !== null) {
        setGotoError(null);
        void queryClient.resetQueries({ queryKey: chatKeys.messages(chatId), exact: true });
      }
    }
  }, [goto, chatId, queryClient]);

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

  // After the goto-page is loaded, scroll to the target bubble, flash it,
  // then strip ?goto from the URL so a refresh doesn't re-trigger.
  useEffect(() => {
    if (!goto || gotoError || !query.data) return;
    const node = document.querySelector<HTMLElement>(`[data-message-id="${goto}"]`);
    if (!node) return;
    node.scrollIntoView({ block: 'center' });
    node.classList.add('chat-bubble--flash');
    const handle = window.setTimeout(() => {
      node.classList.remove('chat-bubble--flash');
      setSearchParams({}, { replace: true });
    }, 1200);
    return () => window.clearTimeout(handle);
  }, [goto, gotoError, query.data, setSearchParams]);

  const messages = useMemo<ChatMessageDTO[]>(() => {
    if (!query.data) return [];
    const all = query.data.pages.flat();
    return [...all].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }, [query.data]);

  // Track whether the user is "near the bottom" so we can auto-follow new
  // messages without yanking the viewport while they read older history.
  useEffect(() => {
    const el = messagesListRef.current;
    if (!el) return;
    const onScroll = (): void => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = dist < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll to bottom when the latest message changes — covers initial load,
  // incoming WS message:new, and our own onSuccess insert. Pagination keeps
  // lastMessageId stable (older messages prepend), so the viewport stays put.
  // `goto`-mode owns its own scroll (PR 7), so skip there.
  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  useLayoutEffect(() => {
    if (goto) return;
    if (lastMessageId === null) return;
    if (!isNearBottomRef.current) return;
    const el = messagesListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lastMessageId, goto]);

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
    mutationFn: (vars: { content: string; replyToId: string | null; pollOptions?: string[] }) => {
      const body: { content: string; replyToId?: string; pollOptions?: string[] } = {
        content: vars.content,
      };
      if (vars.replyToId !== null) body.replyToId = vars.replyToId;
      if (vars.pollOptions !== undefined) body.pollOptions = vars.pollOptions;
      return sendMessage(chatId, body);
    },
    onSuccess: (msg) => {
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) {
          // Same race as in useChatSocket.applyMessageNew: a {pages:[[msg]]}
          // shell here gets overwritten when the in-flight initial fetch
          // resolves. Refetch instead so the user sees what they sent.
          void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
          return old;
        }
        // Dedup: the WS publishMessageNew runs before the HTTP reply on the
        // server, so the WS frame can land first and applyMessageNew will have
        // already inserted this message. Skip if its id is already present.
        if (old.pages.some((page) => page.some((m) => m.id === msg.id))) return old;
        const firstPage = old.pages[0] ?? [];
        const nextFirst = [msg, ...firstPage];
        return { ...old, pages: [nextFirst, ...old.pages.slice(1)] };
      });
      // Force scroll past any "user is reading older history" guard — they
      // just sent the message, they expect to see it above the input.
      requestAnimationFrame(() => {
        const el = messagesListRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
  });

  const replacePostInCaches = useCallback(
    (post: ChatMessageDTO): void => {
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return old;
        let touched = false;
        const pages = old.pages.map((page) =>
          page.map((message) => {
            if (message.id !== post.id) return message;
            touched = true;
            return post;
          }),
        );
        return touched ? { ...old, pages } : old;
      });
      queryClient.setQueryData<ChatMessageDTO | undefined>(chatKeys.channelPost(post.id), (old) =>
        old ? post : old,
      );
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
    [queryClient, chatId],
  );

  const editChannelPostMut = useMutation({
    mutationFn: ({ postId, content }: { postId: string; content: string }) =>
      updateChannelPost(postId, content),
    onSuccess: (post) => {
      replacePostInCaches(post);
      setEditingPost(null);
    },
  });

  const votePollMut = useMutation({
    mutationFn: ({ postId, optionId }: { postId: string; optionId: string }) =>
      voteChannelPoll(postId, optionId),
    onSuccess: replacePostInCaches,
  });

  const clearPollVoteMut = useMutation({
    mutationFn: (postId: string) => clearChannelPollVote(postId),
    onSuccess: replacePostInCaches,
  });

  const deleteChannelPostMut = useMutation({
    mutationFn: (postId: string) => deleteChannelPost(postId),
    onMutate: (postId) => {
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => page.filter((message) => message.id !== postId)),
        };
      });
      queryClient.setQueryData<ChatMessageDTO | undefined>(chatKeys.channelPost(postId), undefined);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      setEditingPost(null);
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

  const addMut = useMutation<
    Awaited<ReturnType<typeof addReaction>>,
    Error,
    { messageId: string; emoji: string },
    { prev: InfinitePages | undefined }
  >({
    mutationFn: ({ messageId, emoji }) => addReaction(messageId, emoji),
    onMutate: ({ messageId, emoji }) => {
      const prev = queryClient.getQueryData<InfinitePages>(chatKeys.messages(chatId));
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return old;
        let touched = false;
        const pages = old.pages.map((page) =>
          page.map((m) => {
            if (m.id !== messageId) return m;
            const next = switchMyReactionTo(m, emoji);
            if (next === m) return m;
            touched = true;
            return next;
          }),
        );
        return touched ? { ...old, pages } : old;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(chatKeys.messages(chatId), ctx.prev);
    },
  });

  const removeMut = useMutation<
    void,
    Error,
    { messageId: string; emoji: string },
    { prev: InfinitePages | undefined }
  >({
    mutationFn: ({ messageId, emoji }) => removeReaction(messageId, emoji),
    onMutate: ({ messageId, emoji }) => {
      const prev = queryClient.getQueryData<InfinitePages>(chatKeys.messages(chatId));
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return old;
        let touched = false;
        const pages = old.pages.map((page) =>
          page.map((m) => {
            if (m.id !== messageId) return m;
            const next = removeMyReaction(m, emoji);
            if (next === m) return m;
            touched = true;
            return next;
          }),
        );
        return touched ? { ...old, pages } : old;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(chatKeys.messages(chatId), ctx.prev);
    },
  });

  const acceptDuelInviteMut = useMutation({
    mutationFn: (matchId: string) => acceptAmateurDuel(matchId),
    onSuccess: (_data, matchId) => {
      setDuelInviteResolutionByMatch((prev) => ({ ...prev, [matchId]: 'accepted' }));
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
      navigate('/?view=amateur');
    },
    onError: (_err, matchId) => {
      setDuelInviteResolutionByMatch((prev) => ({ ...prev, [matchId]: 'unavailable' }));
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });

  const declineDuelInviteMut = useMutation({
    mutationFn: (matchId: string) => declineAmateurDuel(matchId),
    onSuccess: (_data, matchId) => {
      setDuelInviteResolutionByMatch((prev) => ({ ...prev, [matchId]: 'declined' }));
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
    onError: (_err, matchId) => {
      setDuelInviteResolutionByMatch((prev) => ({ ...prev, [matchId]: 'unavailable' }));
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });

  const onRequestActions = useCallback((message: ChatMessageDTO, anchorRect: DOMRect): void => {
    setActionTarget({ message, anchorRect });
  }, []);
  const onCloseActions = useCallback(() => setActionTarget(null), []);

  const onOpenProfile = useCallback(
    (sender: UserPickerItem): void => {
      // Defensive guard: never open the sheet for self. Own bubbles already
      // hide their author UI, but a future regression shouldn't open a "DM
      // myself" path.
      if (sender.userId === meId) return;
      setPreviewSender(sender);
    },
    [meId],
  );
  const onCloseProfile = useCallback(() => setPreviewSender(null), []);

  const onReplyTo = useCallback((m: ChatMessageDTO) => setReplyTo(m), []);
  // TanStack Query v5 returns a fresh result-object identity every render but
  // the .mutate function itself is memoized — depend on it directly so our
  // useCallback returns a stable ref that React.memo on ChatBubble can rely on.
  const deleteMutate = deleteMut.mutate;
  const addMutate = addMut.mutate;
  const removeMutate = removeMut.mutate;
  const onDeleteId = useCallback((id: string) => deleteMutate(id), [deleteMutate]);

  const onToggleReaction = useCallback(
    (messageId: string, emoji: string): void => {
      const all = queryClient.getQueryData<InfinitePages>(chatKeys.messages(chatId));
      const msg = all?.pages.flat().find((m) => m.id === messageId);
      const existing = msg?.reactions.find((r) => r.emoji === emoji);
      if (existing?.reactedByMe) {
        removeMutate({ messageId, emoji });
      } else {
        addMutate({ messageId, emoji });
      }
    },
    [queryClient, chatId, addMutate, removeMutate],
  );

  const onPickEmojiFromMenu = useCallback(
    (emoji: string): void => {
      if (actionTarget) addMutate({ messageId: actionTarget.message.id, emoji });
    },
    [actionTarget, addMutate],
  );

  const onMoreEmoji = useCallback((): void => {
    if (!actionTarget) return;
    setPickerTarget({ messageId: actionTarget.message.id, anchorRect: actionTarget.anchorRect });
    setActionTarget(null);
  }, [actionTarget]);

  const onPickFromPicker = useCallback(
    (emoji: string): void => {
      if (pickerTarget) addMutate({ messageId: pickerTarget.messageId, emoji });
      setPickerTarget(null);
    },
    [pickerTarget, addMutate],
  );

  const handleSend = useCallback(
    (content: string, replyToId: string | null): void => {
      sendMut.mutate({ content, replyToId });
    },
    [sendMut],
  );

  const handleSendPoll = useCallback(
    (question: string, pollOptions: string[]): void => {
      sendMut.mutate({ content: question, replyToId: null, pollOptions });
    },
    [sendMut],
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const visibleMessages = useMemo<ChatMessageDTO[]>(() => {
    const base = isChannel ? messages.filter((message) => !message.isDeleted) : messages;
    if (trimmedQuery.length === 0) return base;
    return base.filter((m) => !m.isDeleted && m.content.toLowerCase().includes(trimmedQuery));
  }, [isChannel, messages, trimmedQuery]);

  const actionMessage = actionTarget?.message ?? null;
  const actionIsOwn = actionMessage ? actionMessage.senderId === meId : false;
  const showComposer = chatMeta === undefined || !isChannel || isAdmin;

  const onOpenChannelComments = useCallback(
    (postId: string): void => {
      navigate(`/chat/${chatId}/posts/${postId}/comments`);
    },
    [navigate, chatId],
  );

  const onOpenChannelReactionPicker = useCallback((postId: string, anchorRect: DOMRect): void => {
    setPickerTarget({ messageId: postId, anchorRect });
  }, []);

  const onSaveChannelPost = useCallback(
    (postId: string, content: string): void => {
      editChannelPostMut.mutate({ postId, content });
    },
    [editChannelPostMut],
  );

  const onDeleteChannelPost = useCallback(
    (postId: string): void => {
      deleteChannelPostMut.mutate(postId);
    },
    [deleteChannelPostMut],
  );

  const onVoteChannelPoll = useCallback(
    (postId: string, optionId: string): void => {
      votePollMut.mutate({ postId, optionId });
    },
    [votePollMut],
  );

  const onClearChannelPollVote = useCallback(
    (postId: string): void => {
      clearPollVoteMut.mutate(postId);
    },
    [clearPollVoteMut],
  );

  return (
    <main
      className="screen"
      style={{
        // `position: fixed` was previously used to pin the chat to the viewport,
        // but `app-shell` has `transform: translateZ(0)` which turns any
        // descendant `fixed` element into a containing-block-relative `absolute`
        // — so the document scroll dragged the header up and pushed the input
        // below the screen. Sizing exactly to the visual viewport + clipping
        // overflow keeps the header pinned and the messages list owning its
        // own scroll. visualViewport.height adapts to the soft keyboard
        // (where 100dvh on Android often does not), so the composer stays
        // visible while typing. Fallback to 100dvh on browsers without
        // visualViewport.
        position: 'relative',
        height: viewportHeight !== null ? `${viewportHeight}px` : '100dvh',
        overflow: 'hidden',
      }}
    >
      <div className="chat-edge-top chat-edge-top--overlay glass-edge-fade glass-edge-fade--top">
        <ChatRoomHeader
          title={chatTitle}
          {...(chatSubtitle !== undefined ? { subtitle: chatSubtitle } : {})}
          avatarUrl={chatAvatarUrl}
          onBack={() => navigate('/chat')}
          {...(dmCounterpart
            ? {
                onTitleClick: () => setPreviewSender(dmCounterpart),
                onTitleClickLabel: 'Открыть профиль игрока',
              }
            : chatMeta && chatMeta.type !== 'direct'
              ? { onTitleClick: () => navigate(`/chat/${chatId}/info`) }
              : {})}
          searchOpen={searchOpen}
          onToggleSearch={() => setSearchOpen((o) => !o)}
        />
        <ChatRoomSearchBar
          open={searchOpen}
          value={searchQuery}
          placeholder={`Поиск в «${chatTitle}»`}
          onChange={setSearchQuery}
        />

        {gotoError && (
          <div
            className="glass-dark"
            role="alert"
            style={{
              margin: '6px 14px 0',
              padding: '6px 12px',
              borderRadius: 10,
              fontSize: 13,
            }}
          >
            {gotoError}
          </div>
        )}
      </div>

      <div
        ref={messagesListRef}
        data-testid="messages-list"
        className="no-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          padding: `${searchOpen ? 'calc(158px + var(--app-safe-top))' : 'calc(112px + var(--app-safe-top))'} 14px ${
            showComposer
              ? isChannel && isAdmin
                ? 'calc(140px + var(--app-safe-bottom))'
                : 'calc(96px + var(--app-safe-bottom))'
              : '24px'
          }`,
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
          if (isChannel) {
            return (
              <ChannelPostCard
                key={m.id}
                post={m}
                showViews={isAdmin}
                canEdit={isAdmin}
                onReact={onToggleReaction}
                onOpenReactionPicker={onOpenChannelReactionPicker}
                onOpenComments={onOpenChannelComments}
                onPollVote={onVoteChannelPoll}
                onPollClearVote={onClearChannelPollVote}
                onEdit={setEditingPost}
                pollDisabled={votePollMut.isPending || clearPollVoteMut.isPending}
              />
            );
          }
          const isOwn = m.senderId === meId;
          const duelInvite = parseDuelInviteMetadata(m.metadata);
          const inviteActionSlot =
            duelInvite && !isOwn && !m.isDeleted ? (
              <DuelInviteActions
                invite={duelInvite}
                resolution={duelInviteResolutionByMatch[duelInvite.matchId]}
                pending={
                  (acceptDuelInviteMut.isPending &&
                    acceptDuelInviteMut.variables === duelInvite.matchId) ||
                  (declineDuelInviteMut.isPending &&
                    declineDuelInviteMut.variables === duelInvite.matchId)
                }
                onAccept={() => acceptDuelInviteMut.mutate(duelInvite.matchId)}
                onDecline={() => declineDuelInviteMut.mutate(duelInvite.matchId)}
              />
            ) : undefined;
          const isReadByCounterpart =
            counterpartLastReadAt !== null &&
            Date.parse(counterpartLastReadAt) >= Date.parse(m.createdAt);
          const replyParent = m.replyToId ? messageById.get(m.replyToId) : undefined;
          const replyTo = replyParent
            ? { senderName: senderNameOf(replyParent), content: replyParent.content }
            : null;
          return (
            <ChatBubble
              key={m.id}
              message={m}
              isOwn={isOwn}
              showAuthor={showAuthorOnBubbles}
              deliveryStatus={
                chatMeta?.type === 'direct' && isOwn
                  ? isReadByCounterpart
                    ? 'read'
                    : 'delivered'
                  : undefined
              }
              replyTo={replyTo}
              onRequestActions={onRequestActions}
              onReact={onToggleReaction}
              actionSlot={inviteActionSlot}
              onOpenProfile={onOpenProfile}
            />
          );
        })}
      </div>

      {showComposer && (
        <div className="chat-edge-bottom chat-edge-bottom--overlay glass-edge-fade glass-edge-fade--bottom">
          <ChatInput
            replyTo={isChannel ? null : replyTo}
            replyToSenderName={replyTo ? senderNameOf(replyTo) : undefined}
            placeholder={isChannel ? 'Новость...' : 'Сообщение...'}
            formattingTools={isChannel && isAdmin}
            extraTools={
              isChannel && isAdmin ? (
                <button
                  type="button"
                  className="icon-btn"
                  title="Опрос"
                  aria-label="Опрос"
                  disabled={sendMut.isPending}
                  onClick={() => setPollComposerOpen(true)}
                  style={{
                    width: 32,
                    height: 32,
                    minWidth: 32,
                    minHeight: 32,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.88)',
                    color: 'var(--ink)',
                  }}
                >
                  <ListChecks size={16} />
                </button>
              ) : undefined
            }
            onClearReply={() => setReplyTo(null)}
            disabled={sendMut.isPending}
            onSend={handleSend}
          />
        </div>
      )}

      <MessageActionsMenu
        open={actionTarget !== null}
        anchorRect={actionTarget?.anchorRect ?? null}
        isOwn={actionIsOwn}
        onReply={() => actionMessage && onReplyTo(actionMessage)}
        onDelete={() => actionMessage && onDeleteId(actionMessage.id)}
        onPickEmoji={onPickEmojiFromMenu}
        onMoreEmoji={onMoreEmoji}
        onClose={onCloseActions}
      />
      <ReactionPicker
        open={pickerTarget !== null}
        anchorRect={pickerTarget?.anchorRect ?? null}
        onPick={onPickFromPicker}
        onClose={() => setPickerTarget(null)}
      />
      <UserProfileSheet sender={previewSender} onClose={onCloseProfile} />
      <ChannelPostEditorSheet
        post={editingPost}
        disabled={editChannelPostMut.isPending || deleteChannelPostMut.isPending}
        deleteDisabled={deleteChannelPostMut.isPending}
        onSave={onSaveChannelPost}
        onDelete={onDeleteChannelPost}
        onClose={() => setEditingPost(null)}
      />
      <ChannelPollComposerSheet
        open={pollComposerOpen}
        disabled={sendMut.isPending}
        onSubmit={handleSendPoll}
        onClose={() => setPollComposerOpen(false)}
      />
    </main>
  );
}
