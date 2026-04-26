import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { fetchChatList, type ChatDTO } from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { ChatListItem } from '../components/ChatListItem.js';
import { UserPickerModal } from '../components/UserPickerModal.js';
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

  const [filter, setFilter] = useState('');
  const filteredChats = useMemo<ChatDTO[]>(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) => chatHaystack(c).includes(q));
  }, [data, filter]);

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
      <header
        className="glass"
        style={{
          margin: '10px 14px 10px',
          marginTop: 'calc(10px + env(safe-area-inset-top, 0px) / 2)',
          padding: '6px 8px 6px 14px',
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Search size={16} color="var(--muted)" aria-hidden />
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
            padding: '8px 0',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          className="icon-btn icon-btn--dark"
          aria-label="Новый диалог"
          onClick={openPicker}
        >
          <Plus size={16} />
        </button>
      </header>

      {isLoading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Загрузка...
        </div>
      )}

      {isError && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>
            Не удалось загрузить чаты
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => void refetch()}>
            Повторить
          </button>
        </div>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Здесь пока пусто. Начните диалог через «+».
        </div>
      )}

      {!isLoading &&
        !isError &&
        (data?.length ?? 0) > 0 &&
        filteredChats.length === 0 &&
        filter.trim().length > 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Ничего не найдено
          </div>
        )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '4px 14px 14px',
        }}
      >
        {filteredChats.map((chat) => (
          <ChatListItem key={chat.id} chat={chat} onOpen={openChat} />
        ))}
      </div>

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
