import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from '../screens/LoginScreen.js';
import { PrivateRoute } from '../auth/PrivateRoute.js';
import { useAuthStore } from '../auth/authStore.js';
import { useBonusGameStore } from '../stores/bonusGameStore.js';
import { App } from './App.js';

vi.mock('../game/PlayView.js', () => ({
  PlayView: () => <div data-testid="play-view" />,
}));

function renderAt(path: string): void {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <main>home content</main>
              </PrivateRoute>
            }
          />
          <Route
            path="/duel/:goalieId"
            element={
              <PrivateRoute>
                <main>duel content</main>
              </PrivateRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App routing + auth', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
    useBonusGameStore.setState({
      attempt: null,
      loading: false,
      error: null,
      errorCode: null,
      inFlight: false,
      needsReconcile: false,
      requestEpoch: 0,
      receivedAtPerformanceMs: null,
    });
  });

  it('redirects unauthenticated users from / to /login', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /ультимейт хоккей/i })).toBeInTheDocument();
  });

  it('shows home content when authenticated', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    renderAt('/');
    expect(screen.getByText('home content')).toBeInTheDocument();
  });

  it('guards /duel/:goalieId as well', () => {
    renderAt('/duel/rookie');
    expect(screen.queryByText('duel content')).toBeNull();
    expect(screen.getByRole('heading', { name: /ультимейт хоккей/i })).toBeInTheDocument();
  });

  it('loads the authenticated bonus games route', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    window.history.replaceState({}, '', '/bonus-games');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ games: [], active_attempt: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Бонусные игры' })).toBeInTheDocument();
  });

  it('loads a bonus attempt detail on the authenticated play route', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    window.history.replaceState({}, '', '/bonus-games/game-1/play?attempt=attempt-1');
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/bonus-games/attempts/attempt-1')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              attempt: {
                id: 'attempt-1',
                game_id: 'game-1',
                game_slug: 'beach',
                game_title: 'Пляж',
                status: 'active',
                state: 'idle',
                current_period: 0,
                period_started_at: null,
                period_ends_at: null,
                break_started_at: null,
                break_ends_at: null,
                closed_at: null,
                shots_taken: 0,
                current_period_shots_taken: 0,
                goals: 0,
                reward_granted: false,
                attempt_seed: 'seed',
                game_core_version: 1,
                definition_revision: 1,
                server_now: '2026-08-24T10:00:00.000Z',
                rules: {
                  game_id: 'game-1',
                  slug: 'beach',
                  title: 'Пляж',
                  revision: 1,
                  target_goals: 18,
                  total_periods: 1,
                  break_duration_ms: 30_000,
                  periods: [
                    {
                      period_number: 1,
                      duration_ms: 240_000,
                      shots_limit: 30,
                      goal_frequency: 0.45,
                      goalie_frequency: 0.5,
                      shooter_frequency: 0.65,
                      puck_speed_per_ms: 1.2,
                      goalie_pattern: 'linear',
                      goalie_amplitude: 1,
                      goal_amplitude: 220,
                    },
                  ],
                },
                reward: { coins: 100, stars: 1, experience: 50 },
                arena: {
                  id: 'arena-1',
                  slug: 'beach',
                  title: 'Пляж',
                  artwork_url: '/bonus-games/arenas/beach.webp',
                  thumbnail_url: '/bonus-games/arenas/beach.webp',
                },
                goalkeeper_ready_url: '/bonus-games/goalkeepers/beach-ready.webp',
                goalkeeper_save_url: '/bonus-games/goalkeepers/beach-save.webp',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    render(<App />);

    expect(await screen.findByTestId('play-view')).toBeInTheDocument();
  });
});
