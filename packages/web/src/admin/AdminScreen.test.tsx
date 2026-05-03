import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminScreen } from './AdminScreen.js';
import { useAuthStore } from '../auth/authStore.js';

function renderAdmin(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminScreen />
    </QueryClientProvider>,
  );
}

describe('AdminScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('renders summary, users and game settings for admins', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'admin', displayName: 'Egor', role: 'admin' },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/admin/summary')) {
        return new Response(
          JSON.stringify({
            users: { total: 2, admins: 1 },
            lifetime: { shots: 120, goals: 60 },
            active: { daily: 1, training: 0 },
            last24h: { shots: 12, goals: 6, mismatches: 0 },
            gameCoreVersion: 3,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/users')) {
        return new Response(
          JSON.stringify({
            users: [
              {
                id: 'u1',
                displayName: 'Regular Player',
                avatarUrl: null,
                role: 'player',
                grip: 'right',
                level: 1,
                xp: 0,
                timezone: 'Europe/Moscow',
                createdAt: '2026-05-01T10:00:00.000Z',
                lastSeenAt: null,
                lifetimeShotsTotal: 12,
                lifetimeGoalsTotal: 6,
                providers: { telegram: { id: '42', username: 'regular' }, vk: null },
                wallet: {
                  shotsCurrent: 25,
                  shotsMax: 25,
                  shotsBonus: 0,
                  pucks: 0,
                  goldPucks: 0,
                  wheelSpins: 2,
                  trainingEnergy: 0,
                },
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/game-settings')) {
        return new Response(
          JSON.stringify({
            gameCoreVersion: 3,
            settings: [
              {
                key: 'training.shots_limit',
                label: 'Лимит тренировки',
                description: '',
                type: 'number',
                defaultValue: 500,
                min: 1,
                max: 1000,
                value: 500,
                updatedAt: null,
                updatedBy: null,
              },
            ],
            balance: { goalies: [], sticks: [], dailyPeriodSpeedPresets: [] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    renderAdmin();

    expect(await screen.findByText('Админка')).toBeInTheDocument();
    expect(await screen.findAllByText('Игроки')).not.toHaveLength(0);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /игроки/i }));
    expect(await screen.findByText('Regular Player')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /параметры/i }));
    expect(await screen.findByText('Лимит тренировки')).toBeInTheDocument();
  });

  it('shows access denial for players', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'Player', role: 'player' },
    });

    renderAdmin();

    expect(screen.getByText('Нет доступа')).toBeInTheDocument();
  });
});
