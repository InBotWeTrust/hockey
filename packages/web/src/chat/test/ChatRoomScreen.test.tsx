import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ChatRoomScreen } from '../screens/ChatRoomScreen.js';
import { useAuthStore, type AuthUser } from '../../auth/authStore.js';
import { chatKeys } from '../../lib/queryKeys.js';
import * as api from '../api.js';
import * as amateurDuelApi from '../../api/amateurDuel.js';
import type { ChatMessageDTO } from '../api.js';

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <div data-testid="duel-location">{`${location.pathname}${location.search}`}</div>;
}

function renderRoom(
  chatId: string,
  search = '',
  configure?: (queryClient: QueryClient) => void,
): { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  configure?.(queryClient);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/chat/${chatId}${search}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<ChatRoomScreen />} />
          <Route path="/chat" element={<div>list</div>} />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient };
}

const SELF_ID = '00000000-0000-0000-0000-00000000aaaa';
const OTHER_ID = '00000000-0000-0000-0000-00000000bbbb';

const msgFromOther: ChatMessageDTO = {
  id: 'm1',
  chatId: 'c1',
  senderId: OTHER_ID,
  senderDisplayName: 'Иван',
  senderAvatarUrl: null,
  content: 'привет',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T10:00:00.000Z',
  reactions: [],
};

const msgFromSelf: ChatMessageDTO = {
  id: 'm2',
  chatId: 'c1',
  senderId: SELF_ID,
  senderDisplayName: null,
  senderAvatarUrl: null,
  content: 'хай',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T10:01:00.000Z',
  reactions: [],
};

function longPressBubble(messageId: string): void {
  const bubble = screen
    .getAllByTestId('chat-bubble')
    .find((el) => el.getAttribute('data-message-id') === messageId);
  if (!bubble) throw new Error(`bubble ${messageId} not in DOM`);
  // The long-press handlers are on the inner wrapper (first child of the bubble div).
  const wrapper = bubble.querySelector<HTMLElement>('div');
  if (!wrapper) throw new Error('bubble inner wrapper missing');
  fireEvent.pointerDown(wrapper, { pointerId: 1, clientX: 0, clientY: 0, isPrimary: true });
  act(() => {
    vi.advanceTimersByTime(500);
  });
  fireEvent.pointerUp(wrapper, { pointerId: 1, clientX: 0, clientY: 0 });
}

describe('ChatRoomScreen', () => {
  beforeEach(() => {
    const user: AuthUser = { id: SELF_ID, displayName: 'Me', grip: 'right' };
    useAuthStore.setState({ accessToken: 'tok', refreshToken: 'rtok', user });
    vi.spyOn(api, 'fetchMessages').mockResolvedValue([msgFromSelf, msgFromOther]); // server DESC
    vi.spyOn(api, 'markChatAsRead').mockResolvedValue(undefined);
    vi.spyOn(api, 'fetchChatList').mockResolvedValue([]);
    vi.spyOn(api, 'fetchUserProfile').mockResolvedValue({
      id: OTHER_ID,
      displayName: 'Иван',
      avatarUrl: null,
      competitionLevel: 'beginner',
      stats: {
        shots: 0,
        goals: 0,
        accuracy: 0,
        playStreakDays: 0,
        bestPlayStreakDays: 0,
      },
      achievements: [],
      createdAt: '2026-04-26T10:00:00.000Z',
      lastSeenAt: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders messages from REST in chronological order', async () => {
    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));
    const bubbles = screen.getAllByTestId('chat-bubble');
    expect(bubbles[0]?.getAttribute('data-message-id')).toBe('m1');
    expect(bubbles[1]?.getAttribute('data-message-id')).toBe('m2');
    expect(screen.getByText('привет')).toBeInTheDocument();
    expect(screen.getByText('хай')).toBeInTheDocument();
  });

  it('renders duel invite actions and declines from the message card', async () => {
    const decline = vi.spyOn(amateurDuelApi, 'declineAmateurDuel').mockResolvedValue({
      match: {} as Awaited<ReturnType<typeof amateurDuelApi.declineAmateurDuel>>['match'],
    });
    vi.spyOn(amateurDuelApi, 'acceptAmateurDuel').mockResolvedValue({
      match: {} as Awaited<ReturnType<typeof amateurDuelApi.acceptAmateurDuel>>['match'],
    });
    vi.mocked(api.fetchMessages).mockResolvedValue([
      {
        ...msgFromOther,
        id: 'duel-invite',
        content: 'Иван вызывает вас на дуэль «Классическая дуэль».',
        metadata: {
          type: 'amateur_duel_invite',
          matchId: '11111111-1111-1111-1111-111111111111',
          templateTitle: 'Классическая дуэль',
          challengerName: 'Иван',
          startsAt: '2026-05-04T10:00:00.000Z',
          endsAt: '2026-05-04T12:00:00.000Z',
          totalPeriods: 3,
          shotsPerPeriod: 30,
          periodDurationMs: 1_200_000,
          breakDurationMs: 900_000,
          stakeAmount: 5,
          entryFeeAmount: 1,
          bankAmount: 10,
        },
      },
    ]);

    renderRoom('c1');

    expect(await screen.findByRole('button', { name: 'Принять' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отклонить' }));

    await waitFor(() =>
      expect(decline).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111'),
    );
    expect(await screen.findByText('Вы отклонили')).toBeInTheDocument();
  });

  it('accepts a duel invite and opens the duel room', async () => {
    const matchId = '11111111-1111-1111-1111-111111111111';
    const accept = vi.spyOn(amateurDuelApi, 'acceptAmateurDuel').mockResolvedValue({
      match: {} as Awaited<ReturnType<typeof amateurDuelApi.acceptAmateurDuel>>['match'],
    });
    vi.spyOn(amateurDuelApi, 'declineAmateurDuel').mockResolvedValue({
      match: {} as Awaited<ReturnType<typeof amateurDuelApi.declineAmateurDuel>>['match'],
    });
    vi.mocked(api.fetchMessages).mockResolvedValue([
      {
        ...msgFromOther,
        id: 'duel-invite',
        content: 'Иван вызывает вас на дуэль «Классическая дуэль».',
        metadata: {
          type: 'amateur_duel_invite',
          matchId,
          templateTitle: 'Классическая дуэль',
          challengerName: 'Иван',
          startsAt: '2026-05-04T10:00:00.000Z',
          endsAt: '2026-05-04T12:00:00.000Z',
          totalPeriods: 3,
          shotsPerPeriod: 30,
          periodDurationMs: 1_200_000,
          breakDurationMs: 900_000,
          stakeAmount: 0,
          entryFeeAmount: 0,
          bankAmount: 0,
        },
      },
    ]);

    renderRoom('c1');

    fireEvent.click(await screen.findByRole('button', { name: 'Принять' }));

    await waitFor(() => expect(accept).toHaveBeenCalledWith(matchId));
    expect(await screen.findByTestId('duel-location')).toHaveTextContent(
      `/?view=amateur&match=${matchId}`,
    );
  });

  it('uses subscribers wording in channel header', async () => {
    vi.mocked(api.fetchChatList).mockResolvedValue([
      {
        id: 'c1',
        type: 'channel',
        name: 'Новости игры',
        entityType: null,
        entityId: null,
        channelSlug: 'news',
        lastMessageAt: null,
        unreadCount: 0,
        lastMessage: null,
        lastMessageSenderName: null,
        dmCounterpart: null,
        memberCount: 10,
        pinnedAt: null,
      },
    ]);

    renderRoom('c1');

    expect(await screen.findByText('Канал · 10 подписчиков')).toBeInTheDocument();
  });

  it('opens the direct counterpart profile from the header avatar or name', async () => {
    vi.mocked(api.fetchChatList).mockResolvedValue([
      {
        id: 'c1',
        type: 'direct',
        name: null,
        entityType: null,
        entityId: null,
        lastMessageAt: null,
        unreadCount: 0,
        lastMessage: null,
        lastMessageSenderName: null,
        dmCounterpart: {
          userId: OTHER_ID,
          displayName: 'Иван',
          avatarUrl: null,
          lastSeenAt: null,
          lastReadAt: null,
        },
        memberCount: 2,
        pinnedAt: null,
      },
    ]);

    renderRoom('c1');

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть профиль игрока' }));

    expect(await screen.findByTestId('profile-sheet-backdrop')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /написать в личку/i })).toBeInTheDocument();
  });

  it('shows delivered/read ticks only on own messages in direct chats', async () => {
    vi.mocked(api.fetchChatList).mockResolvedValue([
      {
        id: 'c1',
        type: 'direct',
        name: null,
        entityType: null,
        entityId: null,
        lastMessageAt: null,
        unreadCount: 0,
        lastMessage: null,
        lastMessageSenderName: null,
        dmCounterpart: {
          userId: OTHER_ID,
          displayName: 'Иван',
          avatarUrl: null,
          lastSeenAt: null,
          lastReadAt: '2026-04-26T10:01:30.000Z',
        },
        memberCount: 2,
        pinnedAt: null,
      },
    ]);

    renderRoom('c1');

    expect(await screen.findByLabelText('Прочитано')).toBeInTheDocument();
    expect(screen.queryByLabelText('Доставлено')).toBeNull();
  });

  it('marks the chat as read on mount once messages have loaded', async () => {
    renderRoom('c1');
    await waitFor(() => expect(api.markChatAsRead).toHaveBeenCalledWith('c1'));
  });

  it('shows a loading state while the first page is still fetching', () => {
    vi.mocked(api.fetchMessages).mockImplementation(() => new Promise<ChatMessageDTO[]>(() => {}));

    renderRoom('c1');

    expect(screen.getByText('Загрузка сообщений...')).toBeInTheDocument();
    expect(api.markChatAsRead).not.toHaveBeenCalled();
  });

  it('retries an empty first page before clearing an unread counter', async () => {
    vi.mocked(api.fetchMessages).mockResolvedValue([]);
    vi.mocked(api.fetchChatList).mockResolvedValue([
      {
        id: 'c1',
        type: 'direct',
        name: null,
        entityType: null,
        entityId: null,
        lastMessageAt: '2026-04-26T10:02:00.000Z',
        unreadCount: 1,
        lastMessage: msgFromOther,
        lastMessageSenderName: 'Иван',
        dmCounterpart: {
          userId: OTHER_ID,
          displayName: 'Иван',
          avatarUrl: null,
          lastSeenAt: null,
          lastReadAt: null,
        },
        memberCount: 2,
        pinnedAt: null,
      },
    ]);

    renderRoom('c1');

    await waitFor(() => expect(api.fetchMessages).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Сообщений пока нет')).toBeInTheDocument();
    expect(api.markChatAsRead).not.toHaveBeenCalled();
  });

  it('pins the room to the very bottom on the initial load', async () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const originalClientHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    );
    const originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    let assignedScrollTop = 0;
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'messages-list' ? 1200 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'messages-list' ? 400 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return assignedScrollTop;
      },
      set(value: number) {
        assignedScrollTop = value;
      },
    });

    try {
      renderRoom('c1');

      await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));
      expect(assignedScrollTop).toBe(1200);
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
      }
      if (originalClientHeight) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
      }
      if (originalScrollTop) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', originalScrollTop);
      }
    }
  });

  it('refetches a stale room cache before marking the chat read', async () => {
    const fetchSpy = vi.mocked(api.fetchMessages);

    renderRoom('c1', '', (queryClient) => {
      queryClient.setQueryData(chatKeys.messages('c1'), {
        pages: [[{ ...msgFromSelf, id: 'stale', content: 'старое' }]],
        pageParams: [undefined],
      });
    });

    expect(screen.getByText('старое')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('привет')).toBeInTheDocument());
    await waitFor(() => expect(api.markChatAsRead).toHaveBeenCalledWith('c1'));
    expect(fetchSpy.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.markChatAsRead).mock.invocationCallOrder[0]!,
    );
  });

  it('search toggle: header search button reveals the input below; typing filters messages', async () => {
    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));

    // Two elements share aria-label "Поиск по чату" — the header toggle <button>
    // and the search <input>. Pick the input by tagName.
    const findInput = (): HTMLInputElement => {
      const els = screen.getAllByLabelText('Поиск по чату');
      const input = els.find((el): el is HTMLInputElement => el.tagName === 'INPUT');
      if (!input) throw new Error('search input not in DOM');
      return input;
    };

    // Closed by default — input is in DOM but not in the tab order.
    expect(findInput().tabIndex).toBe(-1);

    fireEvent.click(screen.getByRole('button', { name: 'Поиск по чату' }));
    const input = findInput();
    expect(input.tabIndex).toBe(0);

    fireEvent.change(input, { target: { value: 'привет' } });
    await waitFor(() => expect(screen.queryByText('хай')).toBeNull());
    expect(screen.getByText('привет')).toBeInTheDocument();
  });

  it('sends a message and prepends it to the cache', async () => {
    const newMsg: ChatMessageDTO = {
      id: 'm3',
      chatId: 'c1',
      senderId: SELF_ID,
      senderDisplayName: null,
      senderAvatarUrl: null,
      content: 'тест',
      replyToId: null,
      isDeleted: false,
      createdAt: '2026-04-26T10:02:00.000Z',
      reactions: [],
    };
    const sendSpy = vi.spyOn(api, 'sendMessage').mockResolvedValue(newMsg);

    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'тест' } });
    fireEvent.click(screen.getByLabelText('Отправить'));

    await waitFor(() => expect(sendSpy).toHaveBeenCalledWith('c1', { content: 'тест' }));
    await waitFor(() => expect(screen.getByText('тест')).toBeInTheDocument());
  });

  it('keeps an attached image pending and sends it together with message text', async () => {
    const media = {
      id: 'att-1',
      url: 'https://cdn.example/photo.webp',
      kind: 'image' as const,
      contentType: 'image/webp',
      size: 1234,
      originalName: 'photo.png',
    };
    const uploadSpy = vi.spyOn(api, 'uploadChatAttachment').mockResolvedValue({ media });
    const sendSpy = vi.spyOn(api, 'sendMessage').mockResolvedValue({
      ...msgFromSelf,
      id: 'm-with-image',
      content: 'смотри',
      metadata: { attachments: [media] },
    });

    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith('c1', file));
    expect(await screen.findByText('photo.png')).toBeInTheDocument();
    expect(sendSpy).not.toHaveBeenCalled();

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'смотри' } });
    fireEvent.click(screen.getByLabelText('Отправить'));

    await waitFor(() =>
      expect(sendSpy).toHaveBeenCalledWith('c1', {
        content: 'смотри',
        attachmentIds: ['att-1'],
      }),
    );
  });

  it('opens image attachments in a modal viewer from the chat bubble', async () => {
    vi.mocked(api.fetchMessages).mockResolvedValue([
      {
        ...msgFromOther,
        id: 'm-image',
        content: 'картинка',
        metadata: {
          attachments: [
            {
              id: 'att-1',
              url: 'https://cdn.example/photo.webp',
              kind: 'image',
              contentType: 'image/webp',
              size: 1234,
              originalName: 'photo.webp',
            },
          ],
        },
      },
    ]);

    renderRoom('c1');

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть изображение: photo.webp' }));

    const dialog = await screen.findByRole('dialog', { name: 'photo.webp' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByAltText('photo.webp')).toHaveAttribute(
      'src',
      'https://cdn.example/photo.webp',
    );
    expect(screen.getByAltText('photo.webp')).toHaveStyle({
      maxWidth: '100%',
      objectFit: 'contain',
      margin: '0 auto',
    });
    expect(screen.queryByText('photo.webp')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть просмотр изображения' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'photo.webp' })).not.toBeInTheDocument(),
    );
  });

  it('regression: double-tap on send only fires sendMessage once', async () => {
    const newMsg: ChatMessageDTO = {
      id: 'm-dt',
      chatId: 'c1',
      senderId: SELF_ID,
      senderDisplayName: null,
      senderAvatarUrl: null,
      content: 'тест',
      replyToId: null,
      isDeleted: false,
      createdAt: '2026-04-26T10:02:00.000Z',
      reactions: [],
    };
    // Keep the send unresolved so `disabled` (sendMut.isPending) stays true
    // for the entire window we double-tap inside.
    const sendSpy = vi
      .spyOn(api, 'sendMessage')
      .mockImplementation(() => new Promise<ChatMessageDTO>(() => undefined));

    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'тест' } });
    const button = screen.getByLabelText('Отправить');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(1));
    sendSpy.mockResolvedValue(newMsg);
  });

  it('regression: WS message:new arriving before HTTP onSuccess does not duplicate the bubble', async () => {
    const newMsg: ChatMessageDTO = {
      id: 'm3-race',
      chatId: 'c1',
      senderId: SELF_ID,
      senderDisplayName: null,
      senderAvatarUrl: null,
      content: 'гонка',
      replyToId: null,
      isDeleted: false,
      createdAt: '2026-04-26T10:02:00.000Z',
      reactions: [],
    };
    // Hold the POST resolver so we can simulate the WS frame landing first.
    let resolveSend: (msg: ChatMessageDTO) => void = () => {};
    vi.spyOn(api, 'sendMessage').mockImplementation(
      () =>
        new Promise<ChatMessageDTO>((res) => {
          resolveSend = res;
        }),
    );

    const { queryClient } = renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'гонка' } });
    fireEvent.click(screen.getByLabelText('Отправить'));

    // WS publishMessageNew lands first (server awaits publish before reply, so on
    // higher-latency HTTP paths the WS frame can beat the response). Simulate by
    // patching the cache directly the way useChatSocket.applyMessageNew would.
    act(() => {
      queryClient.setQueryData<{ pages: ChatMessageDTO[][]; pageParams: unknown[] }>(
        chatKeys.messages('c1'),
        (old) => {
          if (!old) return { pages: [[newMsg]], pageParams: [undefined] };
          if (old.pages.some((p) => p.some((m) => m.id === newMsg.id))) return old;
          const firstPage = old.pages[0] ?? [];
          return { ...old, pages: [[newMsg, ...firstPage], ...old.pages.slice(1)] };
        },
      );
    });

    // Now HTTP reply lands.
    await act(async () => {
      resolveSend(newMsg);
    });

    await waitFor(() => expect(screen.getAllByText('гонка').length).toBe(1));
    expect(screen.getAllByTestId('chat-bubble').length).toBe(3);
  });

  it('long-press on a foreign bubble surfaces a Reply action; using it sets replyToId on the next send', async () => {
    vi.useFakeTimers();
    const sendSpy = vi.spyOn(api, 'sendMessage').mockResolvedValue({
      ...msgFromSelf,
      id: 'm4',
      content: 'отвечаю',
      replyToId: 'm1',
    });

    renderRoom('c1');
    // Run pending timers from React's effects (mark-as-read + initial render),
    // then move on to the synchronous test interactions.
    await vi.runAllTimersAsync();

    longPressBubble('m1');
    expect(screen.getByRole('menuitem', { name: 'Ответить' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ответить' }));

    // Switch back to real timers so waitFor polling actually advances.
    vi.useRealTimers();

    await waitFor(() => expect(screen.getByLabelText('Снять ответ')).toBeInTheDocument());

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'отвечаю' } });
    fireEvent.click(screen.getByLabelText('Отправить'));

    await waitFor(() =>
      expect(sendSpy).toHaveBeenCalledWith('c1', { content: 'отвечаю', replyToId: 'm1' }),
    );
    await waitFor(() => expect(screen.queryByLabelText('Снять ответ')).toBeNull());
  });

  it('long-press on own bubble surfaces a Delete action; using it optimistically marks the message deleted', async () => {
    vi.useFakeTimers();
    const delSpy = vi.spyOn(api, 'deleteMessage').mockResolvedValue(undefined);

    renderRoom('c1');
    await vi.runAllTimersAsync();

    longPressBubble('m2');
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));

    vi.useRealTimers();

    await waitFor(() => expect(delSpy).toHaveBeenCalledWith('m2'));
    await waitFor(() => expect(screen.getByText('Сообщение удалено')).toBeInTheDocument());
  });

  it('long-press on own bubble can edit the message and shows the edited marker', async () => {
    vi.useFakeTimers();
    const edited: ChatMessageDTO = {
      ...msgFromSelf,
      content: 'исправлено',
      updatedAt: '2026-04-26T10:03:00.000Z',
      isEdited: true,
    };
    const updateSpy = vi.spyOn(api, 'updateMessage').mockResolvedValue(edited);

    renderRoom('c1');
    await vi.runAllTimersAsync();

    longPressBubble('m2');
    fireEvent.click(screen.getByRole('menuitem', { name: /редактировать/i }));
    vi.useRealTimers();

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    expect(textarea.value).toBe('хай');
    fireEvent.change(textarea, { target: { value: 'исправлено' } });
    fireEvent.click(screen.getByLabelText('Отправить'));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('m2', 'исправлено'));
    await waitFor(() => expect(screen.getByText('изменено')).toBeInTheDocument());
  });

  it('long-press → menu shelf → tap favorite → POST sent + optimistic count+1', async () => {
    vi.useFakeTimers();
    const addSpy = vi
      .spyOn(api, 'addReaction')
      .mockResolvedValue({ messageId: 'm1', emoji: '👍', removed: null });

    const { queryClient } = renderRoom('c1');
    await vi.runAllTimersAsync();

    longPressBubble('m1');
    // The favorite shelf renders FAVORITE_EMOJI as <button aria-label="<emoji>">.
    const favorite = screen.getByRole('button', { name: '👍' });
    fireEvent.click(favorite);

    vi.useRealTimers();

    await waitFor(() => expect(addSpy).toHaveBeenCalledWith('m1', '👍'));

    // Optimistic patch present in cache.
    const data = queryClient.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    const patched = data?.pages.flat().find((m) => m.id === 'm1');
    expect(patched?.reactions).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);
  });

  it('tap on own pill → DELETE + optimistic count-1', async () => {
    const removeSpy = vi.spyOn(api, 'removeReaction').mockResolvedValue(undefined);
    // Pre-seed messages so msgFromSelf carries my reaction.
    vi.spyOn(api, 'fetchMessages').mockResolvedValue([
      {
        ...msgFromSelf,
        reactions: [{ emoji: '👍', count: 1, reactedByMe: true }],
      },
      msgFromOther,
    ]);

    const { queryClient } = renderRoom('c1');
    const pill = await screen.findByRole('button', { name: /👍 1/ });
    fireEvent.click(pill);

    await waitFor(() => expect(removeSpy).toHaveBeenCalledWith('m2', '👍'));

    const data = queryClient.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    const patched = data?.pages.flat().find((m) => m.id === 'm2');
    expect(patched?.reactions).toEqual([]);
  });

  it('POST failure rolls back optimistic patch', async () => {
    vi.useFakeTimers();
    const addSpy = vi.spyOn(api, 'addReaction').mockRejectedValue(new Error('boom'));

    const { queryClient } = renderRoom('c1');
    await vi.runAllTimersAsync();

    longPressBubble('m1');
    const favorite = screen.getByRole('button', { name: '👍' });
    fireEvent.click(favorite);

    vi.useRealTimers();

    // Wait for the rejection + onError rollback.
    await waitFor(() => expect(addSpy).toHaveBeenCalled());
    await waitFor(() => {
      const data = queryClient.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
      const patched = data?.pages.flat().find((m) => m.id === 'm1');
      expect(patched?.reactions).toEqual([]);
    });
  });
});

describe('ChatRoomScreen — ?goto=<messageId>', () => {
  beforeEach(() => {
    const user: AuthUser = { id: SELF_ID, displayName: 'Me', grip: 'right' };
    useAuthStore.setState({ accessToken: 'tok', refreshToken: 'rtok', user });
    vi.spyOn(api, 'markChatAsRead').mockResolvedValue(undefined);
    if (typeof Element.prototype.scrollIntoView !== 'function') {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
      });
    } else {
      vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('loads messages with around=<id>&radius=25 when ?goto is present', async () => {
    const target: ChatMessageDTO = {
      id: 'gtarget',
      chatId: 'c1',
      senderId: OTHER_ID,
      senderDisplayName: null,
      senderAvatarUrl: null,
      content: 'target',
      replyToId: null,
      isDeleted: false,
      createdAt: '2026-04-26T10:00:00.000Z',
      reactions: [],
    };
    const fetchSpy = vi.spyOn(api, 'fetchMessages').mockResolvedValue([target]);

    renderRoom('c1', '?goto=gtarget');

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('c1', { around: 'gtarget', radius: 25 }),
    );
  });

  it('adds .chat-bubble--flash to the target bubble and removes it after 1200ms', async () => {
    vi.useFakeTimers();
    const target: ChatMessageDTO = {
      id: 'gtarget',
      chatId: 'c1',
      senderId: OTHER_ID,
      senderDisplayName: null,
      senderAvatarUrl: null,
      content: 'target',
      replyToId: null,
      isDeleted: false,
      createdAt: '2026-04-26T10:00:00.000Z',
      reactions: [],
    };
    vi.spyOn(api, 'fetchMessages').mockResolvedValue([target]);

    renderRoom('c1', '?goto=gtarget');

    // Let the queryFn promise resolve and the flash effect run.
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    let node = document.querySelector('[data-message-id="gtarget"]');
    expect(node?.classList.contains('chat-bubble--flash')).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    node = document.querySelector('[data-message-id="gtarget"]');
    expect(node?.classList.contains('chat-bubble--flash')).toBe(false);
  });

  it('scrolls to the original message when a reply preview is tapped', async () => {
    const parent: ChatMessageDTO = {
      id: 'parent-message',
      chatId: 'c1',
      senderId: OTHER_ID,
      senderDisplayName: null,
      senderAvatarUrl: null,
      content: 'исходное сообщение',
      replyToId: null,
      isDeleted: false,
      createdAt: '2026-04-26T10:00:00.000Z',
      reactions: [],
    };
    const reply: ChatMessageDTO = {
      id: 'reply-message',
      chatId: 'c1',
      senderId: SELF_ID,
      senderDisplayName: null,
      senderAvatarUrl: null,
      content: 'ответ',
      replyToId: 'parent-message',
      isDeleted: false,
      createdAt: '2026-04-26T10:01:00.000Z',
      reactions: [],
    };
    vi.spyOn(api, 'fetchMessages').mockResolvedValue([reply, parent]);

    renderRoom('c1');

    const preview = await screen.findByTestId('reply-preview');
    vi.useFakeTimers();
    fireEvent.click(preview);

    const node = document.querySelector('[data-message-id="parent-message"]');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(node?.classList.contains('chat-bubble--flash')).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(node?.classList.contains('chat-bubble--flash')).toBe(false);
  });

  it('falls back to default load and shows "Сообщение недоступно" banner on 404', async () => {
    const fallback: ChatMessageDTO = {
      id: 'm-existing',
      chatId: 'c1',
      senderId: OTHER_ID,
      senderDisplayName: null,
      senderAvatarUrl: null,
      content: 'existing',
      replyToId: null,
      isDeleted: false,
      createdAt: '2026-04-26T11:00:00.000Z',
      reactions: [],
    };
    const fetchSpy = vi.spyOn(api, 'fetchMessages');
    fetchSpy.mockRejectedValueOnce(new Error('not found'));
    fetchSpy.mockResolvedValueOnce([fallback]);

    renderRoom('c1', '?goto=gone');

    expect(await screen.findByText('Сообщение недоступно')).toBeInTheDocument();
    await waitFor(() => {
      const defaultCall = fetchSpy.mock.calls.find(([, opts]) => opts && !('around' in opts));
      expect(defaultCall).toBeDefined();
    });
  });
});

describe('ChatRoomScreen — profile preview', () => {
  beforeEach(() => {
    const user: AuthUser = { id: SELF_ID, displayName: 'Me', grip: 'right' };
    useAuthStore.setState({ accessToken: 'tok', refreshToken: 'rtok', user });
    vi.spyOn(api, 'fetchMessages').mockResolvedValue([msgFromOther]);
    vi.spyOn(api, 'markChatAsRead').mockResolvedValue(undefined);
    vi.spyOn(api, 'fetchChatList').mockResolvedValue([
      {
        id: 'c1',
        type: 'group',
        name: 'Командный чат',
        entityType: null,
        entityId: null,
        lastMessageAt: null,
        unreadCount: 0,
        lastMessage: null,
        lastMessageSenderName: null,
        dmCounterpart: null,
        memberCount: 5,
        pinnedAt: null,
      },
    ]);
    vi.spyOn(api, 'findOrCreateDM').mockResolvedValue({ chatId: 'dm-new', created: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens UserProfileSheet on author tap and navigates to DM after "Написать"', async () => {
    renderRoom('c1');
    const nameBtn = await screen.findByRole('button', { name: 'Профиль: Иван' });
    fireEvent.click(nameBtn);
    const writeBtn = await screen.findByRole('button', { name: /написать в личку/i });
    fireEvent.click(writeBtn);
    await waitFor(() => expect(api.findOrCreateDM).toHaveBeenCalledWith(OTHER_ID));
  });
});
