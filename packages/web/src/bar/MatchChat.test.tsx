import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchChat } from './MatchChat.js';
import type { ChatMessageDTO } from '../chat/api.js';
const api = vi.hoisted(() => ({ join: vi.fn(), fetch: vi.fn(), send: vi.fn(), react: vi.fn() }));
vi.mock('./chatApi.js', () => ({
  joinMatchChat: api.join,
  fetchMessages: api.fetch,
  sendMessage: api.send,
  addReaction: api.react,
  removeReaction: vi.fn(),
  deleteMessage: vi.fn(),
  markChatAsRead: vi.fn(async () => {}),
}));
const message: ChatMessageDTO = {
  id: 'message',
  chatId: 'room',
  senderId: 'spectator',
  senderDisplayName: 'Зритель',
  senderAvatarUrl: null,
  content: 'Хороший бросок!',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-10-07T12:00:00Z',
  reactions: [{ emoji: '🔥', count: 2, reactedByMe: false }],
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function setup(viewerId?: string) {
  api.join.mockResolvedValue({ chatId: 'room' });
  api.fetch.mockResolvedValue([message]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MatchChat kind="duel" id="match" {...(viewerId ? { viewerId } : {})} />
    </QueryClientProvider>,
  );
}
describe('embedded match chat', () => {
  it('uses author avatars and reactions from the existing chat components', async () => {
    setup();
    await screen.findByText('Хороший бросок!');
    expect(screen.getByText('Зритель')).toBeInTheDocument();
    expect(document.querySelector('.user-avatar')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /🔥/ }));
    await waitFor(() => expect(api.react).toHaveBeenCalledWith('message', '🔥'));
  });
  it('aligns the viewer messages to the right', async () => {
    setup('spectator');
    await screen.findByText('Хороший бросок!');
    expect(screen.getByTestId('chat-bubble')).toHaveStyle({ alignItems: 'flex-end' });
  });
  it('keeps the draft after failure and sends only once on a double tap', async () => {
    setup();
    await screen.findByText('Хороший бросок!');
    api.send.mockRejectedValueOnce(new Error('offline'));
    const input = screen.getByRole('textbox', { name: 'Текст сообщения' });
    fireEvent.change(input, { target: { value: 'Гол!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    await screen.findByRole('alert');
    expect(input).toHaveValue('Гол!');
    api.send.mockResolvedValue(message);
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(api.send).toHaveBeenCalledTimes(2);
    expect(api.send).toHaveBeenLastCalledWith('room', { content: 'Гол!' });
  });
});
