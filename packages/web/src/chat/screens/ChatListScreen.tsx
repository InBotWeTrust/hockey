import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import {
  fetchChatList,
  pinChat,
  unpinChat,
  PinLimitError,
  PIN_LIMIT,
  type ChatDTO,
} from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { ChatListItem } from '../components/ChatListItem.js';
import { ChatListActionsMenu } from '../components/ChatListActionsMenu.js';
import { UserPickerModal } from '../components/UserPickerModal.js';
import { SearchResultsDropdown } from '../components/SearchResultsDropdown.js';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { NAV_HEIGHT } from '../../components/BottomNav.js';

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

  // Leaving any active chat as we land on the list.
  useEffect(() => {
    setActive(null);
  }, [setActive]);

  const { data, isLoading, isError, refetch } = useQuery<ChatDTO[]>({
    queryKey: chatKeys.list(),
    queryFn: fetchChatList,
    staleTime: 30_000,
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

  const onRequestActions = useCallback((chatId: string, anchorRect: DOMRect) => {
    setActionTarget({ chatId, anchorRect });
  }, []);

  const targetChat = actionTarget ? data?.find((c) => c.id === actionTarget.chatId) : undefined;
  const targetIsPinned = targetChat?.pinnedAt !== null && targetChat !== undefined;

  const onTogglePin = useCallback((): void => {
    if (!actionTarget || !targetChat) return;
    if (targetChat.pinnedAt !== null) {
      unpinMut.mutate(actionTarget.chatId);
    } else {
      pinMut.mutate(actionTarget.chatId);
    }
  }, [actionTarget, targetChat, pinMut, unpinMut]);

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

  function openChat(chatId: string): void {
    navigate(`/chat/${chatId}`);
  }

  function openPicker(): void {
    setSearchParams({ new: '1' });
  }

  function closePicker(): void {
    setSearchParams({});
  }

  return (
    <main
      className="screen"
      style={{
        paddingBottom: `calc(${NAV_HEIGHT + 16}px + env(safe-area-inset-bottom, 0px) / 2)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: 'calc(10px + env(safe-area-inset-top, 0px) / 2) 14px 10px',
        }}
      >
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
          aria-label="Новый диалог"
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

      {dropdownOpen && (
        <SearchResultsDropdown query={debouncedFilter} chatHits={filteredChats} />
      )}

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
            />
          ))}
        </div>
      )}

      <ChatListActionsMenu
        open={actionTarget !== null}
        anchorRect={actionTarget?.anchorRect ?? null}
        isPinned={targetIsPinned}
        onTogglePin={onTogglePin}
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
            bottom: `calc(${NAV_HEIGHT + 24}px + env(safe-area-inset-bottom, 0px) / 2)`,
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
    </main>
  );
}
