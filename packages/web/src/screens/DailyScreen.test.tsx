import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DailyScreen } from './DailyScreen.js';
import { useAuthStore } from '../auth/authStore.js';
import { useDailyStore } from '../stores/dailyStore.js';
import type { DailyStateResponse } from '../api/duel.js';

vi.mock('../game/PixiStage.js', () => ({
  PixiStage: () => <div data-testid="pixi-stage-stub" />,
}));
vi.mock('../game/RinkSvg.js', () => ({
  RinkSvg: () => <div data-testid="rink-svg-stub" />,
}));

const baseState: DailyStateResponse = {
  state: 'idle',
  current_period: 0,
  current_period_shots: 0,
  current_period_goals: 0,
  daily_total_shots: 0,
  daily_total_goals: 0,
  lifetime_total_shots: 0,
  lifetime_total_goals: 0,
  period_ends_at: null,
  break_ends_at: null,
  day_date: '2026-04-25',
  next_day_starts_at: '2026-04-26T00:00:00.000Z',
  daily_seed: null,
  goalie_id: 'rookie',
  shots_per_period: 30,
  total_periods: 3,
  recent_periods: [],
};

function renderWith() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DailyScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuthStore.getState().setSession({
    accessToken: 'token',
    refreshToken: 'r',
    user: { id: 'u1', displayName: 'Tester' },
  });
  useDailyStore.setState({ data: null, loading: false, inFlight: false, error: null });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(baseState), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
});

describe('DailyScreen', () => {
  it('shows loader while fetching state', () => {
    renderWith();
    expect(screen.getByText(/Загрузка/)).toBeInTheDocument();
  });

  it('renders idle view with start button after fetch', async () => {
    renderWith();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Начать 1-й период/ })).toBeInTheDocument();
    });
    expect(screen.getByText(/Сегодняшняя игра/)).toBeInTheDocument();
  });

  it('renders break view with countdown', async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    useDailyStore.setState({
      data: {
        ...baseState,
        state: 'break_active',
        current_period: 1,
        break_ends_at: future,
      },
    });
    renderWith();
    await waitFor(() => {
      expect(screen.getByText(/Перерыв/)).toBeInTheDocument();
    });
  });

  it('renders closed view', async () => {
    useDailyStore.setState({
      data: {
        ...baseState,
        state: 'closed',
        current_period: 3,
        daily_total_shots: 90,
        daily_total_goals: 42,
      },
    });
    renderWith();
    await waitFor(() => {
      expect(screen.getByText(/Игровой день окончен/)).toBeInTheDocument();
    });
  });

  it('exposes speed controls through the rink settings button', async () => {
    const activeState: DailyStateResponse = {
      ...baseState,
      state: 'period_active',
      current_period: 1,
      daily_seed: 'seed-abc',
      period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(activeState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    useDailyStore.setState({ data: activeState });

    renderWith();

    fireEvent.click(screen.getByRole('button', { name: /настройки скоростей/i }));

    expect(screen.getByText(/ворота/i)).toBeInTheDocument();
    expect(screen.getByText(/вратарь/i)).toBeInTheDocument();
    expect(screen.getByText(/хоккеист/i)).toBeInTheDocument();
    expect(screen.getByText(/шайба/i)).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole('slider')[0]!, { target: { value: '1' } });
    expect(screen.getByText('1.00')).toBeInTheDocument();
  });

  it('clicking start period triggers POST /duel/daily/period/start', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'period_active',
          current_period: 1,
          daily_seed: 'seed-abc',
          period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith();
    const btn = await screen.findByRole('button', { name: /Начать 1-й период/ });
    fireEvent.click(btn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(true);
    });
  });
});
