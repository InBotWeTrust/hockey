import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import {
  fetchPushPreferences,
  updatePushPreferences,
  type PushPreferences,
} from '../../api/push.js';
import {
  fetchChatList,
  createGroupChat,
  pinChat,
  unpinChat,
  PinLimitError,
  PIN_LIMIT,
  type ChatDTO,
  type UserPickerItem,
  searchUsers,
} from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { useAuthStore } from '../../auth/authStore.js';
import { ChatListItem } from '../components/ChatListItem.js';
import { ChatListActionsMenu } from '../components/ChatListActionsMenu.js';
import { UserPickerModal } from '../components/UserPickerModal.js';
import { UserAvatar } from '../components/UserAvatar.js';
import { SearchResultsDropdown } from '../components/SearchResultsDropdown.js';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { NAV_HEIGHT } from '../../components/BottomNav.js';

const PUSH_PREFERENCES_QUERY_KEY = ['push', 'preferences'] as const;

function chatHaystack(chat: ChatDTO): string {
  const parts: string[] = [];
  if (chat.type === 'direct' && chat.dmCounterpart) parts.push(chat.dmCounterpart.displayName);
  if (chat.name) parts.push(chat.name);
  if (chat.lastMessage && !chat.lastMessage.isDeleted) parts.push(chat.lastMessage.content);
  return parts.join(' ').toLowerCase();
}

export function ChatListScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const setActive = useChatStore((s) => s.setActive);
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');

  // Leaving any active chat as we land on the list.
  useEffect(() => {
    setActive(null);
  }, [setActive]);

  const { data, isLoading, isError, refetch } = useQuery<ChatDTO[]>({
    queryKey: chatKeys.list(),
    queryFn: fetchChatList,
    staleTime: 30_000,
  });
  const { data: pushPreferences } = useQuery<PushPreferences>({
    queryKey: PUSH_PREFERENCES_QUERY_KEY,
    queryFn: fetchPushPreferences,
    staleTime: 60_000,
  });

  const [actionTarget, setActionTarget] = useState<{ chatId: string; anchorRect: DOMRect } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((label: string) => {
    setToast(label);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Optimistic pin/unpin: rewrite the cached list on mutate, roll back on
  // server error. The server is the source of truth for the pinned_at value
  // — refetch on settled keeps client and server in sync.
  function patchPinned(chatId: string, pinnedAtIso: string | null): void {
    queryClient.setQueryData<ChatDTO[] | undefined>(chatKeys.list(), (old) => {
      if (!old) return old;
      return old.map((c) => (c.id === chatId ? { ...c, pinnedAt: pinnedAtIso } : c));
    });
  }

  const pinMut = useMutation<void, Error, string, { prev: ChatDTO[] | undefined }>({
    mutationFn: (chatId) => pinChat(chatId),
    onMutate: (chatId) => {
      const prev = queryClient.getQueryData<ChatDTO[]>(chatKeys.list());
      patchPinned(chatId, new Date().toISOString());
      return { prev };
    },
    onError: (err, _chatId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(chatKeys.list(), ctx.prev);
      if (err instanceof PinLimitError) {
        showToast(`Можно закрепить не более ${PIN_LIMIT} чатов`);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });

  const unpinMut = useMutation<void, Error, string, { prev: ChatDTO[] | undefined }>({
    mutationFn: (chatId) => unpinChat(chatId),
    onMutate: (chatId) => {
      const prev = queryClient.getQueryData<ChatDTO[]>(chatKeys.list());
      patchPinned(chatId, null);
      return { prev };
    },
    onError: (_err, _chatId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(chatKeys.list(), ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });

  function patchGameNewsPreference(enabled: boolean): void {
    queryClient.setQueryData<PushPreferences | undefined>(PUSH_PREFERENCES_QUERY_KEY, (old) => {
      if (!old) return old;
      return { ...old, gameNews: enabled };
    });
  }

  const pushPreferenceMut = useMutation<
    PushPreferences,
    Error,
    boolean,
    { prev: PushPreferences | undefined }
  >({
    mutationFn: (enabled) => updatePushPreferences({ gameNews: enabled }),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: PUSH_PREFERENCES_QUERY_KEY });
      const prev = queryClient.getQueryData<PushPreferences>(PUSH_PREFERENCES_QUERY_KEY);
      patchGameNewsPreference(enabled);
      return { prev };
    },
    onError: (_err, _enabled, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(PUSH_PREFERENCES_QUERY_KEY, ctx.prev);
      showToast('Не удалось обновить уведомления');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PUSH_PREFERENCES_QUERY_KEY });
    },
  });

  const onRequestActions = useCallback((chatId: string, anchorRect: DOMRect) => {
    setActionTarget({ chatId, anchorRect });
  }, []);

  const targetChat = actionTarget ? data?.find((c) => c.id === actionTarget.chatId) : undefined;
  const targetIsPinned = targetChat?.pinnedAt !== null && targetChat !== undefined;
  const targetIsChannel = targetChat?.type === 'channel';
  const targetNotificationsMuted = targetIsChannel && pushPreferences?.gameNews === false;

  const onTogglePin = useCallback((): void => {
    if (!actionTarget || !targetChat) return;
    if (targetChat.pinnedAt !== null) {
      unpinMut.mutate(actionTarget.chatId);
    } else {
      pinMut.mutate(actionTarget.chatId);
    }
  }, [actionTarget, targetChat, pinMut, unpinMut]);

  const onToggleChannelNotifications = useCallback((): void => {
    if (!targetIsChannel) return;
    const currentEnabled = pushPreferences?.gameNews ?? true;
    pushPreferenceMut.mutate(!currentEnabled);
  }, [targetIsChannel, pushPreferences?.gameNews, pushPreferenceMut]);

  const [filter, setFilter] = useState('');
  const debouncedFilter = useDebouncedValue(filter, 300);
  const filteredChats = useMemo<ChatDTO[]>(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) => chatHaystack(c).includes(q));
  }, [data, filter]);
  const dropdownOpen = filter.trim().length >= 2;

  const pickerOpen = searchParams.get('new') === '1';
  const groupPickerOpen = searchParams.get('group') === '1';

  function openChat(chatId: string): void {
    navigate(`/chat/${chatId}`);
  }

  function openPicker(): void {
    if (isAdmin) {
      setSearchParams({ group: '1' });
      return;
    }
    setSearchParams({ new: '1' });
  }

  function closePicker(): void {
    setSearchParams({});
  }

  return (
    <main
      className="screen"
      style={{
        paddingBottom: 16,
      }}
    >
      <div
        className="chat-edge-top glass-edge-fade glass-edge-fade--top"
        style={{ paddingTop: 'calc(10px + var(--app-safe-top))' }}
      >
        <div
          className="chat-dock-header glass-dock-surface"
          style={{
            gap: 8,
          }}
        >
          <div
            className="glass-dock-field"
            style={{
              flex: 1,
            }}
          >
            <Search size={14} color="var(--muted)" aria-hidden />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Поиск чатов"
              aria-label="Поиск чатов"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 14,
                color: 'var(--ink)',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <button
            type="button"
            className="icon-btn icon-btn--dark"
            aria-label={isAdmin ? 'Новый групповой чат' : 'Новый диалог'}
            onClick={openPicker}
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
            <Plus size={16} />
          </button>
        </div>
      </div>

      {dropdownOpen && <SearchResultsDropdown query={debouncedFilter} chatHits={filteredChats} />}

      {!dropdownOpen && isLoading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Загрузка...
        </div>
      )}

      {!dropdownOpen && isError && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>
            Не удалось загрузить чаты
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => void refetch()}>
            Повторить
          </button>
        </div>
      )}

      {!dropdownOpen && !isLoading && !isError && (data?.length ?? 0) === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Здесь пока пусто. Начните диалог через «+».
        </div>
      )}

      {!dropdownOpen && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '4px 14px 14px',
          }}
        >
          {filteredChats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              onOpen={openChat}
              onRequestActions={onRequestActions}
              notificationsMuted={chat.type === 'channel' && pushPreferences?.gameNews === false}
            />
          ))}
        </div>
      )}

      <ChatListActionsMenu
        open={actionTarget !== null}
        anchorRect={actionTarget?.anchorRect ?? null}
        isPinned={targetIsPinned}
        showPinAction={targetChat !== undefined && targetChat.type !== 'channel'}
        showNotificationAction={targetIsChannel}
        notificationsMuted={targetNotificationsMuted}
        notificationPending={pushPreferenceMut.isPending}
        onTogglePin={onTogglePin}
        onToggleNotifications={onToggleChannelNotifications}
        onClose={() => setActionTarget(null)}
      />

      {toast !== null && (
        <div
          role="status"
          aria-live="polite"
          className="glass-dark"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: `calc(${NAV_HEIGHT + 24}px + var(--app-safe-bottom))`,
            transform: 'translateX(-50%)',
            padding: '10px 16px',
            borderRadius: 999,
            fontSize: 13,
            color: '#ffffff',
            zIndex: 900,
            pointerEvents: 'none',
            // Single-line toast — keeps the pill shape readable. Cap at the
            // viewport width so a longer message gets ellipsized rather than
            // overflowing horizontally.
            whiteSpace: 'nowrap',
            maxWidth: 'calc(100vw - 32px)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {toast}
        </div>
      )}

      <UserPickerModal
        open={pickerOpen}
        onClose={closePicker}
        onPicked={(chatId) => {
          closePicker();
          navigate(`/chat/${chatId}`);
        }}
      />
      <GroupChatCreateModal
        open={groupPickerOpen}
        onClose={closePicker}
        onCreated={(chatId) => {
          closePicker();
          navigate(`/chat/${chatId}`);
        }}
      />
    </main>
  );
}

interface GroupChatCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (chatId: string) => void;
}

function GroupChatCreateModal({
  open,
  onClose,
  onCreated,
}: GroupChatCreateModalProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<UserPickerItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setQuery(raw.trim()), 300);
    return () => window.clearTimeout(t);
  }, [raw, open]);

  useEffect(() => {
    if (!open) {
      setName('');
      setRaw('');
      setQuery('');
      setSelected([]);
      setError(null);
    }
  }, [open]);

  const users = useQuery<UserPickerItem[]>({
    queryKey: chatKeys.users(query),
    queryFn: () => searchUsers(query),
    enabled: open && query.length >= 1,
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createGroupChat({
        name: name.trim(),
        memberUserIds: selected.map((user) => user.userId),
      }),
    onSuccess: async ({ chatId }) => {
      await queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      onCreated(chatId);
    },
    onError: () => setError('Не удалось создать чат'),
  });

  if (!open) return null;

  const selectedIds = new Set(selected.map((user) => user.userId));
  const canCreate = name.trim().length > 0 && selected.length > 0 && !createMut.isPending;

  function toggleUser(user: UserPickerItem): void {
    setSelected((current) =>
      current.some((item) => item.userId === user.userId)
        ? current.filter((item) => item.userId !== user.userId)
        : [...current, user],
    );
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ alignItems: 'flex-start', paddingTop: 'calc(48px + var(--app-safe-top))' }}
    >
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(420px, calc(100vw - 28px))', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="modal-title">Групповой чат</div>
            <div className="modal-copy">Создать чат и добавить игроков.</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Название группового чата"
          placeholder="Название чата"
          maxLength={80}
          style={{
            width: '100%',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.85)',
            background: 'rgba(255,255,255,0.55)',
            padding: '12px 14px',
            font: 'inherit',
            fontWeight: 800,
            color: 'var(--ink)',
            outline: 'none',
          }}
        />

        <div
          className="glass"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 16,
            padding: '8px 12px',
          }}
        >
          <Search size={14} color="var(--muted)" />
          <input
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            aria-label="Поиск участников"
            placeholder="Найти игрока"
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              font: 'inherit',
              color: 'var(--ink)',
            }}
          />
        </div>

        {selected.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {selected.map((user) => (
              <button
                key={user.userId}
                type="button"
                className="pill"
                onClick={() => toggleUser(user)}
                style={{ border: 'none', cursor: 'pointer' }}
              >
                {user.displayName} ×
              </button>
            ))}
          </div>
        )}

        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 6 }}>
          {query.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Введите имя игрока.</div>
          )}
          {query.length > 0 && users.isFetching && (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Поиск...</div>
          )}
          {(users.data ?? []).map((user) => {
            const picked = selectedIds.has(user.userId);
            return (
              <button
                key={user.userId}
                type="button"
                className={picked ? 'glass-dark' : 'glass'}
                onClick={() => toggleUser(user)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 16,
                  color: picked ? '#ffffff' : 'var(--ink)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <UserAvatar
                  avatarUrl={user.avatarUrl}
                  name={user.displayName}
                  size={32}
                  fontSize={13}
                />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>
                  {user.displayName}
                </span>
                <span style={{ fontSize: 12, color: picked ? '#ffffff' : 'var(--muted)' }}>
                  {picked ? 'Добавлен' : 'Добавить'}
                </span>
              </button>
            );
          })}
        </div>

        {error && <div style={{ color: 'var(--red-deep)', fontSize: 12 }}>{error}</div>}

        <button
          type="button"
          className="modal-primary btn--cta"
          disabled={!canCreate}
          onClick={() => createMut.mutate()}
        >
          Создать чат
        </button>
      </div>
    </div>
  );
}
