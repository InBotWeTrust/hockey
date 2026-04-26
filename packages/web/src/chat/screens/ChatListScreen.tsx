import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ArrowLeft } from 'lucide-react';
import { fetchChatList, type ChatDTO } from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { ChatListItem } from '../components/ChatListItem.js';
import { UserPickerModal } from '../components/UserPickerModal.js';
import { NAV_HEIGHT } from '../../components/BottomNav.js';

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
        className="header-bar glass"
        style={{
          marginTop: 'calc(10px + env(safe-area-inset-top, 0px) / 2)',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Назад"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="header-bar__title">Чаты</div>
        <button
          type="button"
          className="icon-btn icon-btn--dark"
          aria-label="Новый чат"
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

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '4px 14px 14px',
        }}
      >
        {(data ?? []).map((chat) => (
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
