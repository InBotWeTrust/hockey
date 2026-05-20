import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { UserProfileScreen } from '../screens/UserProfileScreen.js';
import { useAuthStore } from '../../auth/authStore.js';
import * as api from '../api.js';
import * as amateurDuelApi from '../../api/amateurDuel.js';

function renderPublicProfile(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/users/u2']}>
        <Routes>
          <Route path="/users/:userId" element={<UserProfileScreen />} />
          <Route path="/chat/:chatId" element={<div>chat screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UserProfileScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Me' },
    });
    vi.spyOn(api, 'fetchUserProfile').mockResolvedValue({
      id: 'u2',
      displayName: 'Иван Петров',
      avatarUrl: null,
      competitionLevel: 'amateur',
      stats: {
        shots: 128,
        goals: 64,
        accuracy: 50,
        playStreakDays: 7,
        bestPlayStreakDays: 12,
      },
      achievements: [
        {
          id: 'first-goal',
          photoUrl: '/sprites/gate.webp',
          title: 'Первая шайба',
          description: 'Первый гол всегда самый шумный.',
          requirement: 'Забить 1 гол в дневной игре.',
          isUnlocked: true,
          unlockedAt: '2026-05-02T08:00:00.000Z',
        },
      ],
      createdAt: '2026-05-01T08:00:00.000Z',
      lastSeenAt: null,
    });
    vi.spyOn(api, 'findOrCreateDM').mockResolvedValue({ chatId: 'dm1', created: false });
    vi.spyOn(amateurDuelApi, 'fetchAmateurMatches').mockResolvedValue({ matches: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows public stats and achievements for a player opened from chat', async () => {
    renderPublicProfile();

    expect(await screen.findByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('Любитель')).toBeInTheDocument();
    expect(screen.getByText('Статистика')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
    expect(screen.getByText('Достижения (1/1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Первая шайба.*получено/i }));
    expect(screen.getByRole('dialog', { name: 'Первая шайба' })).toBeInTheDocument();
    expect(screen.getByText('Первый гол всегда самый шумный.')).toBeInTheDocument();
  });
});
