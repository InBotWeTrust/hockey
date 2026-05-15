import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatInfoScreen } from '../screens/ChatInfoScreen.js';
import * as api from '../api.js';
import * as adminApi from '../../admin/api.js';
import { useAuthStore } from '../../auth/authStore.js';

function renderScreen(): HTMLElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/chat/chat-1/info']}>
        <Routes>
          <Route path="/chat/:chatId/info" element={<ChatInfoScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const main = container.querySelector('main');
  if (!main) throw new Error('ChatInfoScreen main element was not rendered');
  return main;
}

describe('ChatInfoScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
  });

  it('keeps long member lists scrollable above the bottom navigation', async () => {
    vi.spyOn(api, 'fetchChatInfo').mockResolvedValue({
      id: 'chat-1',
      type: 'channel',
      name: 'Новости игры',
      description: null,
      avatarUrl: null,
      memberCount: 12,
      members: Array.from({ length: 12 }, (_, index) => ({
        userId: `user-${index + 1}`,
        displayName: `Player ${index + 1}`,
        avatarUrl: null,
      })),
    });

    const main = renderScreen();

    expect(await screen.findByText('Участники')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Player 12' })).toBeInTheDocument();
    expect(main).toHaveStyle({
      height: '100%',
      minHeight: '0',
      overflowY: 'auto',
      paddingBottom: '24px',
    });
  });

  it('opens member profile in the shared profile sheet', async () => {
    vi.spyOn(api, 'fetchChatInfo').mockResolvedValue({
      id: 'chat-1',
      type: 'group',
      name: 'Командный чат',
      description: null,
      avatarUrl: null,
      memberCount: 1,
      members: [{ userId: 'user-12', displayName: 'Player 12', avatarUrl: null }],
    });
    vi.spyOn(api, 'fetchUserProfile').mockResolvedValue({
      id: 'user-12',
      displayName: 'Player 12',
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
      createdAt: '2026-05-04T09:00:00.000Z',
      lastSeenAt: null,
    });

    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Player 12' }));

    expect(await screen.findByTestId('profile-sheet-backdrop')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /написать в личку/i })).toBeInTheDocument();
  });

  it('renders the channel avatar from chat info instead of a generated initial', async () => {
    vi.spyOn(api, 'fetchChatInfo').mockResolvedValue({
      id: 'chat-1',
      type: 'channel',
      name: 'Новости игры',
      description: null,
      avatarUrl: 'https://cdn.example/channel.webp',
      memberCount: 15,
      members: [],
    });

    renderScreen();

    expect(await screen.findByAltText('Новости игры')).toHaveAttribute(
      'src',
      'https://cdn.example/channel.webp',
    );
  });

  it('lets admins upload a channel avatar from the info screen', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: { id: 'admin-1', displayName: 'Admin', role: 'admin', grip: 'right' },
    });
    vi.spyOn(api, 'fetchChatInfo').mockResolvedValue({
      id: 'chat-1',
      type: 'channel',
      name: 'Новости игры',
      description: null,
      avatarUrl: null,
      memberCount: 15,
      members: [],
    });
    const uploadSpy = vi
      .spyOn(adminApi, 'uploadAdminChatAvatar')
      .mockResolvedValue({ chatId: 'chat-1', avatarUrl: 'https://cdn.example/new.webp' });

    renderScreen();

    expect(
      await screen.findByRole('button', { name: 'Загрузить аватар канала' }),
    ).toBeInTheDocument();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(['avatar'], 'channel.webp', { type: 'image/webp' });
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith('chat-1', file));
  });
});
