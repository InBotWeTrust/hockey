import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatRoomScreen } from '../screens/ChatRoomScreen.js';
import { useAuthStore, type AuthUser } from '../../auth/authStore.js';
import * as api from '../api.js';
import type { ChatMessageDTO } from '../api.js';

function renderRoom(chatId: string, search = ''): { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/chat/${chatId}${search}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<ChatRoomScreen />} />
          <Route path="/chat" element={<div>list</div>} />
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
  content: 'хай',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T10:01:00.000Z',
  reactions: [],
};

function longPressBubble(messageId: string): void {
  const bubble = screen.getAllByTestId('chat-bubble').find(
    (el) => el.getAttribute('data-message-id') === messageId,
  );
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

  it('marks the chat as read on mount once messages have loaded', async () => {
    renderRoom('c1');
    await waitFor(() => expect(api.markChatAsRead).toHaveBeenCalledWith('c1'));
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

  it('falls back to default load and shows "Сообщение недоступно" banner on 404', async () => {
    const fallback: ChatMessageDTO = {
      id: 'm-existing',
      chatId: 'c1',
      senderId: OTHER_ID,
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
      const defaultCall = fetchSpy.mock.calls.find(
        ([, opts]) => opts && !('around' in opts),
      );
      expect(defaultCall).toBeDefined();
    });
  });
});
