import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatListScreen } from '../screens/ChatListScreen.js';
import { ChatOverlay } from '../ChatOverlay.js';
import { FloatingChatShortcut } from '../../components/FloatingChatShortcut.js';
import { useAuthStore, type AuthUser } from '../../auth/authStore.js';
import * as api from '../api.js';
import * as pushApi from '../../api/push.js';
import { useChatStore } from '../chatStore.js';
import { socialApi } from '../../social/api.js';

function renderScreen(entry='/chat',embedded=false): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/sections" element={<div>district map</div>} />
          <Route path="/chat" element={<ChatListScreen embedded={embedded} />} />
          <Route path="/chat/:chatId" element={<div>room</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ChatListScreen — global search dropdown', () => {
  beforeEach(() => {
    const user: AuthUser = {
      id: '00000000-0000-0000-0000-00000000aaaa',
      displayName: 'Me',
      grip: 'right',
    };
    useAuthStore.setState({ accessToken: 'tok', refreshToken: 'rtok', user });
    useChatStore.setState({unreadByChat:{}});
    vi.spyOn(api, 'fetchChatList').mockResolvedValue([]);
    vi.spyOn(socialApi,'feedUnread').mockResolvedValue({hasUnread:true,unreadCount:2,asOf:'2026-10-14T00:00:00Z'});
    vi.spyOn(api, 'searchMessagesApi').mockResolvedValue([]);
    vi.spyOn(pushApi, 'fetchPushPreferences').mockResolvedValue({
      chatNewDialogMessage: true,
      dailyGame: true,
      trainingAvailable: true,
      duelEvents: true,
      tournamentEvents: true,
      gameNews: true,
    });
    vi.spyOn(pushApi, 'updatePushPreferences').mockResolvedValue({
      chatNewDialogMessage: true,
      dailyGame: true,
      trainingAvailable: true,
      duelEvents: true,
      tournamentEvents: true,
      gameNews: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows chat title and returns to the district map',()=>{renderScreen();expect(screen.getByRole('heading',{name:'Чат'})).toBeVisible();expect(screen.queryByRole('button',{name:'Назад'})).toBeNull();expect(screen.queryByRole('tablist')).toBeNull();fireEvent.click(screen.getByRole('link',{name:'Назад'}));expect(screen.getByText('district map')).toBeInTheDocument();});

  it('keeps the map feed separate from the chat list', async () => {
    vi.spyOn(socialApi, 'feed').mockResolvedValue({items:[],nextCursor:null});
    renderScreen('/chat?view=feed');
    expect(screen.getByRole('heading',{name:'Лента'})).toBeVisible();
    expect(screen.getByRole('button',{name:/^Чат/})).toHaveAttribute('aria-pressed','false');
    fireEvent.click(screen.getByRole('button',{name:/^Чат/}));
    expect(screen.getByLabelText('Поиск чатов')).toBeVisible();
    expect(screen.getByRole('button',{name:/^Чат/})).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('button',{name:/^Лента/}));
    expect(screen.queryByLabelText('Поиск чатов')).toBeNull();
  });

  it('switches booth tabs with counters without opening the floating chat sheet', async () => {
    vi.spyOn(socialApi, 'feed').mockResolvedValue({items:[],nextCursor:null});
    useChatStore.setState({unreadByChat:{one:3}});
    const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
    render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/chat?view=feed']}>
      <ChatOverlay><ChatListScreen/><FloatingChatShortcut owner="booth" unreadCount={3}/></ChatOverlay>
    </MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('button',{name:'Лента, непрочитанных: 2'})).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('button',{name:'Чат, непрочитанных: 3'}));
    expect(screen.getByRole('heading',{name:'Чат'})).toBeVisible();
    expect(screen.queryByRole('dialog',{name:'Чат'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Открыть чат'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Новый диалог'}));
    await waitFor(() => expect(screen.getByRole('dialog',{name:'Новый чат'})).toBeVisible());
    expect(screen.queryByRole('dialog',{name:'Чат'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Закрыть'}));
    expect(screen.getByRole('button',{name:'Чат, непрочитанных: 3'})).toHaveAttribute('aria-pressed','true');
    expect(screen.queryByRole('dialog',{name:'Чат'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:/^Лента/}));
    expect(screen.getByRole('heading',{name:'Лента'})).toBeVisible();
    expect(screen.queryByRole('button',{name:'Открыть чат'})).toBeNull();
  });

  it('embeds only the chat list without feed navigation or a duplicate heading', async () => {
    renderScreen('/chat',true);
    expect(await screen.findByLabelText('Поиск чатов')).toBeVisible();
    expect(screen.queryByRole('heading',{name:'Чат'})).toBeNull();
    expect(screen.queryByRole('button',{name:/Лента/})).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('does not render the dropdown when filter has fewer than 2 chars', async () => {
    renderScreen();
    const input = await screen.findByLabelText(/Поиск чатов/);
    expect(input.closest('.glass-edge-fade')).toBeNull();
    fireEvent.change(input, { target: { value: 'a' } });
    expect(screen.queryByText('Сообщения')).toBeNull();
    expect(api.searchMessagesApi).not.toHaveBeenCalled();
  });

  it('keeps the retry action inside a readable error state when chat loading fails', async () => {
    vi.mocked(api.fetchChatList).mockRejectedValue(new TypeError('Network unavailable'));

    renderScreen();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('chat-list-error');
    expect(alert).toHaveTextContent('Не удалось загрузить чаты');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('renders the dropdown when filter reaches 2 chars and debounces /chat/search', async () => {
    renderScreen();
    const input = await screen.findByLabelText(/Поиск чатов/);

    fireEvent.change(input, { target: { value: 'ab' } });
    // Heading mounts synchronously because dropdownOpen is computed from filter (no debounce).
    // Loader spinner with aria-label may be inside the h3, so match by text not by accessible name.
    await waitFor(() => expect(screen.getByText('Сообщения')).toBeInTheDocument());

    // Eventually, after the 300ms debounce, /chat/search fires with the trimmed query.
    await waitFor(() => expect(api.searchMessagesApi).toHaveBeenCalledWith('ab', 50), {
      timeout: 1500,
    });
  });

  it('lets admins create a group chat from the chat list', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: {
        id: '00000000-0000-0000-0000-00000000aaaa',
        displayName: 'Admin',
        role: 'admin',
        grip: 'right',
      },
    });
    vi.spyOn(api, 'searchUsers').mockResolvedValue([
      { userId: 'u1', displayName: 'Player One', avatarUrl: null },
      { userId: 'u2', displayName: 'Player Two', avatarUrl: null },
    ]);
    const createSpy = vi
      .spyOn(api, 'createGroupChat')
      .mockResolvedValue({ chatId: 'group-1', created: true });

    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Новый групповой чат' }));
    fireEvent.change(screen.getByLabelText('Название группового чата'), {
      target: { value: 'Команда теста' },
    });
    fireEvent.change(screen.getByLabelText('Поиск участников'), { target: { value: 'pla' } });

    fireEvent.click(await screen.findByRole('button', { name: /Player One/ }));
    fireEvent.click(screen.getByRole('button', { name: /Player Two/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Команда теста',
        memberUserIds: ['u1', 'u2'],
      }),
    );
  });

  it('closes the group chat modal with Escape', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: {
        id: '00000000-0000-0000-0000-00000000aaaa',
        displayName: 'Admin',
        role: 'admin',
        grip: 'right',
      },
    });

    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Новый групповой чат' }));
    expect(screen.getByRole('dialog', { name: 'Групповой чат' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Групповой чат' })).not.toBeInTheDocument();
  });
});
