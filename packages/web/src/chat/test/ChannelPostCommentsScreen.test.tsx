import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChannelPostCommentsScreen } from '../screens/ChannelPostCommentsScreen.js';
import type { ChannelPostCommentDTO, ChatMessageDTO } from '../api.js';
import * as api from '../api.js';
import { useAuthStore } from '../../auth/authStore.js';

const post: ChatMessageDTO = {
  id: 'post-1',
  chatId: 'chat-1',
  senderId: 'admin',
  senderDisplayName: 'Admin',
  senderAvatarUrl: null,
  content: '**Пост** канала',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-05-03T12:00:00.000Z',
  reactions: [],
  commentCount: 2,
  viewCount: 1,
};

const parentComment: ChannelPostCommentDTO = {
  id: 'comment-1',
  postId: 'post-1',
  authorId: 'user-1',
  authorDisplayName: 'Alice',
  authorAvatarUrl: null,
  replyToId: null,
  content: 'Первый комментарий',
  isDeleted: false,
  createdAt: '2026-05-03T12:10:00.000Z',
  reactions: [],
};

const childComment: ChannelPostCommentDTO = {
  id: 'comment-2',
  postId: 'post-1',
  authorId: 'user-2',
  authorDisplayName: 'Bob',
  authorAvatarUrl: null,
  replyToId: 'comment-1',
  content: 'Ответ на первый',
  isDeleted: false,
  createdAt: '2026-05-03T12:11:00.000Z',
  reactions: [{ emoji: '🔥', count: 1, reactedByMe: true }],
};

function renderScreen(): QueryClient {
  useAuthStore.setState({
    accessToken: 'tok',
    refreshToken: 'rtok',
    user: { id: 'user-1', displayName: 'Alice', role: 'player' },
  });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/chat/chat-1/posts/post-1/comments']}>
        <Routes>
          <Route
            path="/chat/:chatId/posts/:postId/comments"
            element={<ChannelPostCommentsScreen />}
          />
          <Route path="/chat/:chatId" element={<div>chat room</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

describe('ChannelPostCommentsScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('sends replies to comments with replyToId', async () => {
    vi.spyOn(api, 'fetchChannelPost').mockResolvedValue(post);
    vi.spyOn(api, 'fetchChannelPostComments').mockResolvedValue([parentComment, childComment]);
    const sendSpy = vi.spyOn(api, 'sendChannelPostComment').mockResolvedValue({
      ...childComment,
      id: 'comment-3',
      content: 'Ответ из теста',
      replyToId: 'comment-1',
      reactions: [],
    });

    renderScreen();

    expect(await screen.findByText('Ответ на первый')).toBeInTheDocument();
    expect(screen.getAllByText('Первый комментарий').length).toBeGreaterThanOrEqual(2);

    fireEvent.doubleClick(screen.getAllByText('Первый комментарий')[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ответить' }));
    expect(screen.getByLabelText('Снять ответ')).toBeInTheDocument();

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Ответ из теста' } });
    fireEvent.click(screen.getByLabelText('Отправить'));

    await waitFor(() =>
      expect(sendSpy).toHaveBeenCalledWith('post-1', 'Ответ из теста', 'comment-1'),
    );
  });

  it('adds a reaction from the picker and removes my existing reaction', async () => {
    vi.spyOn(api, 'fetchChannelPost').mockResolvedValue(post);
    vi.spyOn(api, 'fetchChannelPostComments').mockResolvedValue([parentComment, childComment]);
    const addSpy = vi.spyOn(api, 'addChannelCommentReaction').mockResolvedValue({
      commentId: 'comment-1',
      emoji: '👍',
      removed: null,
    });
    const removeSpy = vi.spyOn(api, 'removeChannelCommentReaction').mockResolvedValue();

    renderScreen();

    expect((await screen.findAllByText('Первый комментарий')).length).toBeGreaterThanOrEqual(2);

    fireEvent.doubleClick(screen.getAllByText('Первый комментарий')[0]!);
    fireEvent.click(screen.getByRole('button', { name: '👍' }));
    await waitFor(() => expect(addSpy).toHaveBeenCalledWith('comment-1', '👍'));

    fireEvent.click(screen.getByRole('button', { name: '🔥 1' }));
    await waitFor(() => expect(removeSpy).toHaveBeenCalledWith('comment-2', '🔥'));
  });

  it('deletes own comments from the action menu', async () => {
    vi.spyOn(api, 'fetchChannelPost').mockResolvedValue(post);
    vi.spyOn(api, 'fetchChannelPostComments').mockResolvedValue([parentComment, childComment]);
    const deleteSpy = vi.spyOn(api, 'deleteChannelPostComment').mockResolvedValue();

    renderScreen();

    expect((await screen.findAllByText('Первый комментарий')).length).toBeGreaterThanOrEqual(2);
    fireEvent.doubleClick(screen.getAllByText('Первый комментарий')[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('comment-1'));
  });
});
