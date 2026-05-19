import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DAILY_PERIOD_SPEED_PRESETS, STICK_NEUTRAL } from '@hockey/game-core';
import { DailyScreen } from './DailyScreen.js';
import { useAuthStore } from '../auth/authStore.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import type { DailyStateResponse } from '../api/duel.js';
import type { TrainingStateResponse } from '../api/training.js';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';

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
  period_started_at: null,
  period_ends_at: null,
  break_ends_at: null,
  day_date: '2026-04-25',
  next_day_starts_at: '2026-04-26T00:00:00.000Z',
  server_now: '2026-04-25T12:00:00.000Z',
  daily_seed: null,
  goalie_id: 'rookie',
  shots_per_period: 30,
  total_periods: 3,
  period_speed_presets: [...DAILY_PERIOD_SPEED_PRESETS],
  recent_periods: [],
  previous_game: null,
  training_cooldown_ends_at: null,
};

const trainingIdleState: TrainingStateResponse = {
  state: 'idle',
  selected_period: null,
  shots_taken: 0,
  goals: 0,
  shots_limit: 500,
  day_date: '2026-04-25',
  next_day_starts_at: '2026-04-26T00:00:00.000Z',
  training_seed: null,
  started_at: null,
  server_now: '2026-04-25T12:00:00.000Z',
  goalie_id: 'rookie',
  period_speed_presets: [...DAILY_PERIOD_SPEED_PRESETS],
};

const trainingActiveState: TrainingStateResponse = {
  ...trainingIdleState,
  state: 'active',
  selected_period: 2,
  shots_taken: 12,
  goals: 5,
  training_seed: 'a'.repeat(64),
  started_at: '2026-04-25T11:55:00.000Z',
};

const settledDuelMatch: AmateurDuelMatchState = {
  id: 'match-1',
  template_id: 'template-1',
  status: 'settled',
  source: 'challenge',
  ranked: true,
  season_key: '2026-05',
  duel_kind: 'express',
  starts_at: '2026-05-16T10:00:00.000Z',
  ends_at: '2026-05-16T12:00:00.000Z',
  ready_expires_at: null,
  cooldown_user_id: null,
  cooldown_until: null,
  stake_amount: 0,
  entry_fee_amount: 0,
  bank_amount: 0,
  winner_user_id: 'u1',
  outcome: 'challenger_win',
  settled_reason: 'completed',
  accepted_at: '2026-05-16T10:00:00.000Z',
  settled_at: '2026-05-16T10:03:00.000Z',
  created_at: '2026-05-16T09:55:00.000Z',
  server_now: '2026-05-16T10:03:00.000Z',
  period_started_at: null,
  period_ends_at: null,
  break_ends_at: null,
  rules: {
    templateId: 'template-1',
    title: 'Экспресс',
    description: '',
    difficulty: 'easy',
    duelKind: 'express',
    duelVariant: 'time_attack',
    rankedEnabled: true,
    matchmakingEnabled: true,
    totalPeriods: 1,
    shotsPerPeriod: 30,
    periodDurationMs: 180000,
    breakDurationMs: 0,
    periodRules: [{ periodNumber: 1, mode: 'time_attack', durationMs: 180000, shotsLimit: null }],
    challengeTtlMs: 1800000,
    readyDurationMs: 300000,
    readyNoShowCooldownMs: 900000,
    matchmakingTimeoutMs: 180000,
    rankedDailyLimit: 100,
    rankedSameOpponentLimit: 100,
    powerCap: 100,
    goalieId: 'rookie',
    periodSpeedPresets: [...DAILY_PERIOD_SPEED_PRESETS],
    stakeAmount: 0,
    entryFeeAmount: 0,
    requiredInventoryItemId: null,
    inventoryChargesPerPeriod: 0,
    winPoints: 3,
    drawPoints: 1,
    winCurrencyReward: 0,
    drawCurrencyReward: 0,
    winStarReward: 0,
  },
  me: {
    user_id: 'u1',
    display_name: 'Tester',
    avatar_url: null,
    side: 'challenger',
    state: 'completed',
    current_period: 1,
    shots_taken: 12,
    goals: 3,
    accuracy: 25,
    active_duration_ms: 180000,
    active_duration_seconds: 180,
    result_points: 3,
    current_period_shots: 0,
    current_period_goals: 0,
    ready_at: null,
    period_started_at: null,
    period_ends_at: null,
    break_ends_at: null,
    loadout: { items: [], powerScore: 0, powerCap: 100 },
    inventory_available: [],
    inventory_report: [],
  },
  opponent: {
    user_id: 'u2',
    display_name: 'Duel Opponent',
    avatar_url: null,
    side: 'opponent',
    state: 'completed',
    current_period: 1,
    shots_taken: 10,
    goals: 1,
    accuracy: 10,
    active_duration_ms: 180000,
    active_duration_seconds: 180,
    result_points: 0,
    current_period_shots: 0,
    current_period_goals: 0,
    ready_at: null,
    period_started_at: null,
    period_ends_at: null,
    break_ends_at: null,
    loadout: { items: [], powerScore: 0, powerCap: 100 },
    inventory_available: [],
    inventory_report: [],
  },
  match_seed: 'seed',
  current_period_shots: 12,
  current_period_goals: 3,
  period_speed_presets: [...DAILY_PERIOD_SPEED_PRESETS],
  stick_effects: STICK_NEUTRAL,
  recent_periods: [
    {
      period_number: 1,
      shots_taken: 12,
      goals: 3,
      duration_ms: 180000,
      closed_reason: 'quota',
      ended_at: '2026-05-16T10:03:00.000Z',
    },
  ],
  opponent_recent_periods: [
    {
      period_number: 1,
      shots_taken: 10,
      goals: 1,
      duration_ms: 180000,
      closed_reason: 'quota',
      ended_at: '2026-05-16T10:03:00.000Z',
    },
  ],
};

function renderWith(initialEntries: string[] = ['/']) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <DailyScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function findArenaCta(articleName: string): Promise<HTMLElement> {
  const article = await screen.findByRole('article', { name: articleName });
  return within(article).getByRole('button', { name: 'На площадку' });
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().setSession({
    accessToken: 'token',
    refreshToken: 'r',
    user: { id: 'u1', displayName: 'Tester' },
  });
  useDailyStore.setState({ data: null, loading: false, inFlight: false, error: null });
  useTrainingSessionStore.setState({ data: null, loading: false, inFlight: false, error: null });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    return new Response(
      JSON.stringify(url.includes('/duel/training/state') ? trainingIdleState : baseState),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  });
});

describe('DailyScreen', () => {
  it('shows loader while fetching state', () => {
    renderWith();
    expect(screen.getByText(/Загрузка/)).toBeInTheDocument();
  });

  it('renders idle view with start button after fetch', async () => {
    renderWith();
    expect(await findArenaCta('Ежедневная игра: 1-й период доступен')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Игровая арена' })).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Ежедневная игра: 1-й период доступен' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ежедневная игра')).toBeInTheDocument();
    expect(screen.getByText('1-й период доступен')).toBeInTheDocument();
    expect(screen.getByText('Время')).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByText('Период')).toBeInTheDocument();
    expect(
      screen.getByLabelText('1-й период доступен. Время периода 20:00. Период 1'),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Тренировка: Тренировка' })).toBeInTheDocument();
    expect(screen.getByText('0/500 бросков сегодня')).toBeInTheDocument();
    expect(screen.queryByText('Любители')).not.toBeInTheDocument();
    expect(screen.queryByText('Профессионалы')).not.toBeInTheDocument();
  });

  it('names the next available daily period on the hub', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...baseState, current_period: 2 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWith();

    expect(await screen.findByText('3-й период доступен')).toBeInTheDocument();
    expect(
      screen.getByLabelText('3-й период доступен. Время периода 20:00. Период 3'),
    ).toBeInTheDocument();
  });

  it('keeps amateur and pro sections out of the arena after 1000 lifetime goals', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWith();

    expect(await screen.findByRole('region', { name: 'Игровая арена' })).toBeInTheDocument();
    expect(screen.queryByText('Любители')).not.toBeInTheDocument();
    expect(screen.queryByText('Профессионалы')).not.toBeInTheDocument();
    expect(screen.queryByText('Открыт')).not.toBeInTheDocument();
    expect(screen.queryByText('1000 шайб')).not.toBeInTheDocument();
    expect(screen.queryByText('Скоро')).not.toBeInTheDocument();
  });

  it('prioritizes active duels before daily and training on the arena', async () => {
    const activeMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      server_now: new Date().toISOString(),
      me: {
        ...settledDuelMatch.me,
        state: 'accepted',
        current_period: 0,
        shots_taken: 0,
        goals: 0,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'accepted',
        current_period: 0,
        shots_taken: 0,
        goals: 0,
      },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/events')) {
        return new Response(JSON.stringify({ events: [activeMatch] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=arena']);

    await screen.findByRole('article', { name: 'Активная дуэль: Duel Opponent' });
    const cards = screen.getAllByRole('article');
    expect(cards[0]).toHaveAttribute('aria-label', 'Активная дуэль: Duel Opponent');
    expect(cards[1]).toHaveAttribute('aria-label', 'Ежедневная игра: 1-й период доступен');
    expect(cards[2]).toHaveAttribute('aria-label', 'Тренировка: Тренировка');
    expect(screen.getByLabelText('Выбрать Активная дуэль')).toHaveStyle({ width: '20px' });
  });

  it('restores the last selected arena card after returning home', async () => {
    localStorage.setItem('hockey.arenaSelectedEntryId', 'training');

    renderWith(['/?view=arena']);

    expect(
      await screen.findByRole('article', { name: 'Тренировка: Тренировка' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Выбрать Тренировка')).toHaveStyle({ width: '20px' });
    expect(screen.getByLabelText('Выбрать Ежедневная игра')).toHaveStyle({ width: '7px' });
  });

  it('falls back to daily when the saved duel card is no longer available', async () => {
    localStorage.setItem('hockey.arenaSelectedEntryId', 'duel-match-1');

    renderWith(['/?view=arena']);

    expect(
      await screen.findByRole('article', { name: 'Ежедневная игра: 1-й период доступен' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Выбрать Ежедневная игра')).toHaveStyle({ width: '20px' });
    await waitFor(() => {
      expect(localStorage.getItem('hockey.arenaSelectedEntryId')).toBeNull();
    });
  });

  it('opens waiting amateur duel on the rink from the arena', async () => {
    const waitingMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      server_now: new Date().toISOString(),
      me: { ...settledDuelMatch.me, state: 'completed' },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'accepted',
        current_period: 0,
        shots_taken: 0,
        goals: 0,
      },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches/match-1')) {
        return new Response(JSON.stringify({ match: waitingMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/events')) {
        return new Response(JSON.stringify({ events: [waitingMatch] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches')) {
        return new Response(JSON.stringify({ matches: [waitingMatch] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=arena']);

    const duelCard = await screen.findByRole('article', { name: 'Активная дуэль: Duel Opponent' });
    fireEvent.click(within(duelCard).getByRole('button', { name: 'Ждём соперника' }));

    expect(await screen.findByLabelText('Соперник: Duel Opponent')).toBeInTheDocument();
    expect(screen.getByText('ЖДЁМ СОПЕРНИКА')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Дуэль' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Эта дуэль сейчас не на площадке/)).not.toBeInTheDocument();
  });

  it('opens the rink directly instead of playing a separate arena launch', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/daily/period/start')) {
        return new Response(
          JSON.stringify({
            ...baseState,
            state: 'period_active',
            current_period: 1,
            daily_seed: 'seed-abc',
            period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=arena']);

    const rinkButton = await findArenaCta('Ежедневная игра: 1-й период доступен');
    fireEvent.click(rinkButton);

    expect(await screen.findByRole('button', { name: 'К режимам' })).toBeInTheDocument();
    expect(screen.queryByTestId('arena-rink-backdrop')).not.toBeInTheDocument();
  });

  it('keeps an active daily period on the modes hub until the user opens it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'period_active',
          current_period: 1,
          current_period_shots: 4,
          current_period_goals: 2,
          daily_seed: 'seed-abc',
          period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith();

    const resume = await findArenaCta('Ежедневная игра: 1-й период');
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
    expect(screen.getByText('1-й период')).toBeInTheDocument();
    expect(screen.getByText('До конца')).toBeInTheDocument();
    expect(screen.getByText('Период')).toBeInTheDocument();
    expect(screen.queryByText('Броски')).not.toBeInTheDocument();

    fireEvent.click(resume);
    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
  });

  it('returns from an active daily period to the modes hub', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'period_active',
          current_period: 1,
          current_period_shots: 4,
          current_period_goals: 2,
          daily_seed: 'seed-abc',
          period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith(['/?view=daily']);

    const back = await screen.findByRole('button', { name: 'К режимам' });
    fireEvent.click(back);

    expect(await findArenaCta('Ежедневная игра: 1-й период')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
  });

  it('keeps the third period playable instead of showing the closed-day modal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'period_active',
          current_period: 3,
          current_period_shots: 0,
          current_period_goals: 0,
          daily_total_shots: 60,
          daily_total_goals: 24,
          daily_seed: 'seed-abc',
          period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith(['/?view=daily']);

    const shotButton = await screen.findByRole('button', { name: 'БРОСОК' });
    expect(shotButton).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Звук в разработке' }));
    expect(screen.getByRole('status')).toHaveTextContent('Звук в разработке');
    expect(screen.getByText('00/30')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'День завершён' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ИГРА ЗАВЕРШЕНА' })).not.toBeInTheDocument();
  });

  it('renders break view with countdown', async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'break_active',
          current_period: 1,
          break_ends_at: future,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith();
    await waitFor(() => {
      expect(screen.getByText(/Перерыв/)).toBeInTheDocument();
    });
    expect(screen.getByText('Период')).toBeInTheDocument();
    expect(screen.queryByText(/Следующий/)).not.toBeInTheDocument();
    const breakButton = await findArenaCta('Ежедневная игра: Перерыв');
    expect(breakButton).toBeEnabled();
  });

  it('opens the rink during a break so the timer surface remains visible', async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'break_active',
          current_period: 1,
          daily_total_shots: 10,
          daily_total_goals: 4,
          break_ends_at: future,
          daily_seed: 'seed-abc',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith();

    const breakButton = await findArenaCta('Ежедневная игра: Перерыв');
    fireEvent.click(breakButton);

    await waitFor(() => {
      expect(screen.getAllByText('ПЕРЕРЫВ').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('10/90')).toBeInTheDocument();
    const breakControl = screen.getByRole('button', { name: 'ЛЁД ГОТОВИТСЯ' });
    expect(breakControl).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'К режимам' })).toBeEnabled();
    });
    expect(screen.getByTestId('pixi-stage-stub')).toBeInTheDocument();
  });

  it('shows the shared game stats modal on the rink for an unseen finished period', async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'break_active',
          current_period: 1,
          daily_total_shots: 30,
          daily_total_goals: 12,
          break_ends_at: future,
          daily_seed: 'seed-abc',
          recent_periods: [
            {
              period_number: 1,
              shots_taken: 30,
              goals: 12,
              closed_reason: 'quota' as const,
              duration_ms: 1_200_000,
              ended_at: '2026-04-25T12:20:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderWith(['/?view=daily']);

    expect(
      await screen.findByRole('dialog', { name: 'Итоги ежедневной игры' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '1-й период завершён' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Итого: 12 голов из 30 бросков')).toBeInTheDocument();
    expect(
      screen.getByLabelText('1-й период: 12 голов из 30 бросков за 20:00'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pixi-stage-stub')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Итоги ежедневной игры' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'ЛЁД ГОТОВИТСЯ' })).toBeDisabled();
  });

  it('returns to the hub after dismissing fresh period stats and shows them again on break re-entry', async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const activeState: DailyStateResponse = {
      ...baseState,
      state: 'period_active',
      current_period: 1,
      current_period_shots: 30,
      current_period_goals: 14,
      daily_total_shots: 30,
      daily_total_goals: 14,
      daily_seed: 'seed-abc',
      period_ends_at: future,
    };
    const breakState: DailyStateResponse = {
      ...baseState,
      state: 'break_active',
      current_period: 1,
      current_period_shots: 0,
      current_period_goals: 0,
      daily_total_shots: 30,
      daily_total_goals: 14,
      daily_seed: 'seed-abc',
      period_ends_at: null,
      break_ends_at: future,
      recent_periods: [
        {
          period_number: 1,
          shots_taken: 30,
          goals: 14,
          closed_reason: 'quota' as const,
          duration_ms: 1_200_000,
          ended_at: '2026-04-25T12:20:00.000Z',
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      return new Response(
        JSON.stringify(url.includes('/duel/training/state') ? trainingIdleState : activeState),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    renderWith(['/?view=daily']);

    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();

    act(() => {
      useDailyStore.getState().setDeferredState(breakState);
    });

    expect(
      await screen.findByRole('dialog', { name: 'Итоги ежедневной игры' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));

    expect(await findArenaCta('Ежедневная игра: Перерыв')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Итоги ежедневной игры' })).not.toBeInTheDocument();

    fireEvent.click(await findArenaCta('Ежедневная игра: Перерыв'));

    expect(
      await screen.findByRole('dialog', { name: 'Итоги ежедневной игры' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pixi-stage-stub')).toBeInTheDocument();
  });

  it('shows the full game stats modal after the final period instead of a period-only summary', async () => {
    const previousGame = {
      day_date: '2026-04-25',
      total_shots: 90,
      total_goals: 42,
      total_duration_ms: 3_600_000,
      periods: [
        {
          period_number: 1,
          shots_taken: 30,
          goals: 14,
          closed_reason: 'quota' as const,
          duration_ms: 1_200_000,
          ended_at: '2026-04-25T12:20:00.000Z',
        },
        {
          period_number: 2,
          shots_taken: 30,
          goals: 13,
          closed_reason: 'quota' as const,
          duration_ms: 1_200_000,
          ended_at: '2026-04-25T12:55:00.000Z',
        },
        {
          period_number: 3,
          shots_taken: 30,
          goals: 15,
          closed_reason: 'quota' as const,
          duration_ms: 1_200_000,
          ended_at: '2026-04-25T13:30:00.000Z',
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'closed',
          current_period: 3,
          daily_total_shots: 90,
          daily_total_goals: 42,
          daily_seed: 'seed-abc',
          recent_periods: previousGame.periods,
          previous_game: previousGame,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderWith(['/?view=daily']);

    expect(await screen.findByRole('dialog', { name: 'Игра завершена' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '3-й период завершён' })).not.toBeInTheDocument();
    expect(screen.getByText('Дата: 25.04.2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Итого: 42 голов из 90 бросков')).toBeInTheDocument();
    expect(
      screen.getByLabelText('3-й период: 15 голов из 30 бросков за 20:00'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));

    expect(await screen.findByRole('button', { name: 'ИГРА ЗАВЕРШЕНА' })).toBeDisabled();
    expect(screen.queryByRole('dialog', { name: 'Игра завершена' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'День завершён' })).not.toBeInTheDocument();
  });

  it('can leave the daily rink after starting a period from the arena', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/daily/period/start')) {
        return new Response(
          JSON.stringify({
            ...baseState,
            state: 'period_active',
            current_period: 1,
            daily_seed: 'seed-abc',
            period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWith();

    const rinkButton = await findArenaCta('Ежедневная игра: 1-й период доступен');
    fireEvent.click(rinkButton);

    const homeButton = await screen.findByRole('button', { name: 'К режимам' });
    await waitFor(() => expect(homeButton).toBeEnabled());
    fireEvent.click(homeButton);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Игровая арена' })).toBeInTheDocument();
    });
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(true);
  });

  it('renders closed view', async () => {
    const previousGame = {
      day_date: '2026-04-25',
      total_shots: 48,
      total_goals: 19,
      total_duration_ms: 1_980_000,
      periods: [
        {
          period_number: 1,
          shots_taken: 30,
          goals: 14,
          closed_reason: 'quota' as const,
          duration_ms: 1_200_000,
          ended_at: '2026-04-25T12:20:00.000Z',
        },
        {
          period_number: 2,
          shots_taken: 18,
          goals: 5,
          closed_reason: 'day_end' as const,
          duration_ms: 780_000,
          ended_at: '2026-04-25T21:00:00.000Z',
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'closed',
          current_period: 3,
          daily_total_shots: 90,
          daily_total_goals: 42,
          previous_game: previousGame,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith();
    await waitFor(() => {
      expect(screen.getByText('Завершена')).toBeInTheDocument();
    });
    expect(screen.getByText('До обновления')).toBeInTheDocument();
    expect(screen.getByText('Период')).toBeInTheDocument();
    expect(screen.getByLabelText(/Периоды не активны/)).toBeInTheDocument();
    expect(screen.queryByText(/Ждём следующий день/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/\d{2}:\d{2}:\d{2}/).length).toBeGreaterThan(0);
    expect(await findArenaCta('Ежедневная игра: Завершена')).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Статистика' }));
    expect(screen.getByRole('dialog', { name: 'Статистика последней игры' })).toBeInTheDocument();
    expect(screen.getByText('Статистика прошлой игры')).toBeInTheDocument();
    expect(screen.getByText('Дата: 25.04.2026')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByText('33:00')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(
      screen.getByLabelText('1-й период: 14 голов из 30 бросков за 20:00'),
    ).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByLabelText('2-й период: 5 голов из 18 бросков за 13:00')).toBeInTheDocument();
    expect(screen.getByText('13:00')).toBeInTheDocument();
    expect(screen.queryByText('лимит бросков')).not.toBeInTheDocument();
    expect(screen.queryByText('день закончился')).not.toBeInTheDocument();
    expect(screen.queryByText('время вышло')).not.toBeInTheDocument();
    expect(screen.getByLabelText('3-й период: не сыгран')).toBeInTheDocument();
    expect(screen.getByText('не сыгран')).toBeInTheDocument();
  });

  it('shows empty previous-game stats state before the first completed game', async () => {
    renderWith();

    const statsButton = await screen.findByRole('button', { name: 'Статистика' });
    fireEvent.click(statsButton);

    expect(screen.getByRole('dialog', { name: 'Статистика последней игры' })).toBeInTheDocument();
    expect(screen.getByText('Игр пока нет')).toBeInTheDocument();
    expect(screen.getByText(/После завершения первой ежедневной игры/)).toBeInTheDocument();
  });

  it('opens the rink for a closed day without starting a new period', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ...baseState,
          state: 'closed',
          current_period: 3,
          daily_total_shots: 90,
          daily_total_goals: 42,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    renderWith();

    const rinkButton = await findArenaCta('Ежедневная игра: Завершена');
    expect(rinkButton).toBeEnabled();
    fireEvent.click(rinkButton);

    expect(screen.queryByRole('dialog', { name: 'День завершён' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'ИГРА ЗАВЕРШЕНА' })).toBeDisabled();
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(false);
  });

  it('switches from daily game to the training placeholder', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWith(['/?view=training']);

    expect(await screen.findByRole('heading', { name: 'Тренировка' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Начать тренировку/ })).toBeInTheDocument();
    expect(screen.getByText('0/500')).toBeInTheDocument();
    expect(screen.getByText('ДО ОБНОВЛЕНИЯ')).toBeInTheDocument();
    expect(screen.getByText('Скорости 1-го периода')).toBeInTheDocument();
    expect(screen.getByText('0,50/с')).toBeInTheDocument();
  });

  it('opens the training rink with an ice car while the daily game is in progress', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ...baseState,
          state: 'period_active',
          current_period: 2,
          current_period_shots: 3,
          daily_seed: 'seed-abc',
          period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    renderWith();

    const trainingCard = await findArenaCta('Тренировка: Тренировка');
    expect(screen.getByText('Закрыта до завершения игры')).toBeInTheDocument();
    fireEvent.click(trainingCard);

    expect(await screen.findByRole('button', { name: 'ЛЁД ГОТОВИТСЯ' })).toBeDisabled();
    expect(screen.queryByRole('dialog', { name: 'Тренировка закрыта' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Тренировка', level: 1 })).not.toBeInTheDocument();
  });

  it('opens the daily rink with an ice car after a training shot', async () => {
    const cooldownEndsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify({ ...trainingIdleState, shots_taken: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ...baseState,
          training_cooldown_ends_at: cooldownEndsAt,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    renderWith();

    const dailyButton = await findArenaCta('Ежедневная игра: Восстановление');
    expect(screen.getByText('Восстановление')).toBeInTheDocument();
    expect(screen.getByText('До игры')).toBeInTheDocument();
    fireEvent.click(dailyButton);

    expect(await screen.findByRole('button', { name: 'ЛЁД ГОТОВИТСЯ' })).toBeDisabled();
    expect(screen.queryByRole('dialog', { name: 'Нужно восстановиться' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
  });

  it('keeps active training on the setup screen until the user continues it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingActiveState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/training/start')) {
        return new Response(JSON.stringify(trainingActiveState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWith(['/?view=training']);

    expect(
      await screen.findByRole('button', { name: /Продолжить тренировку/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '3 период' }));
    expect(screen.getByRole('tab', { name: '3 период' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Продолжить тренировку/ }));
    await waitFor(() => {
      const startCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes('/duel/training/start'),
      );
      expect(startCall?.[1]?.body).toBe(JSON.stringify({ period_number: 3 }));
    });
    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
    expect(screen.getByText('12/500')).toBeInTheDocument();
    expect(screen.getByText('ЛИМИТ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Звук в разработке' }));
    expect(screen.getByRole('status')).toHaveTextContent('Звук в разработке');
    expect(
      screen.queryByRole('group', { name: 'Дизайн тренировочной площадки' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('pixi-stage-stub')).toBeInTheDocument();
  });

  it('uses the perspective court in training and lets admins toggle hitboxes', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'token',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Tester', role: 'admin' },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingActiveState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/training/start')) {
        return new Response(JSON.stringify(trainingActiveState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWith(['/?view=training']);
    fireEvent.click(await screen.findByRole('button', { name: /Продолжить тренировку/ }));

    expect(
      await screen.findByRole('img', { name: 'Игровая площадка в перспективе' }),
    ).toBeInTheDocument();
    const hitboxesToggle = screen.getByRole('checkbox', { name: 'Хитбоксы' });
    expect(hitboxesToggle).not.toBeChecked();
    fireEvent.click(hitboxesToggle);
    expect(hitboxesToggle).toBeChecked();
    expect(localStorage.getItem('hockey.trainingHitboxesVisible')).toBe('true');
  });

  it('lets non-admin testers with the experimental flag toggle hitboxes', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'token',
      refreshToken: 'r',
      user: {
        id: 'u2',
        displayName: 'Dmitry Arkaim',
        role: 'player',
        experimentalTrainingCourt: true,
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingActiveState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/training/start')) {
        return new Response(JSON.stringify(trainingActiveState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWith(['/?view=training']);
    fireEvent.click(await screen.findByRole('button', { name: /Продолжить тренировку/ }));

    expect(
      await screen.findByRole('img', { name: 'Игровая площадка в перспективе' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Хитбоксы' })).toBeInTheDocument();
  });

  it('does not render amateur level as a first-tab card', async () => {
    renderWith();

    expect(await screen.findByRole('region', { name: 'Игровая арена' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Любители' })).not.toBeInTheDocument();
  });

  it('does not render pro level as a first-tab card', async () => {
    renderWith();

    expect(await screen.findByRole('region', { name: 'Игровая арена' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Профессионалы' })).not.toBeInTheDocument();
  });

  it('opens player profile from amateur duel rating row', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/templates')) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches')) {
        return new Response(JSON.stringify({ matches: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/rating')) {
        return new Response(
          JSON.stringify({
            season_key: '2026-05',
            rating: [
              {
                user_id: 'u2',
                display_name: 'Duel Opponent',
                avatar_url: '/avatars/opponent.webp',
                points: 7,
                wins: 2,
                draws: 1,
                losses: 0,
                goals_for: 12,
                goals_against: 8,
                matches_played: 3,
                active_duration_seconds: 540,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/users/u2')) {
        return new Response(
          JSON.stringify({
            id: 'u2',
            displayName: 'Duel Opponent',
            avatarUrl: null,
            competitionLevel: 'amateur',
            stats: { shots: 30, goals: 12, accuracy: 40, playStreakDays: 2, bestPlayStreakDays: 4 },
            achievements: [],
            createdAt: '2026-05-01T08:00:00.000Z',
            lastSeenAt: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/users/u1')) {
        return new Response(
          JSON.stringify({
            id: 'u1',
            displayName: 'Tester',
            avatarUrl: null,
            competitionLevel: 'amateur',
            stats: { shots: 10, goals: 5, accuracy: 50, playStreakDays: 1, bestPlayStreakDays: 1 },
            achievements: [],
            createdAt: '2026-05-01T08:00:00.000Z',
            lastSeenAt: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&section=duels']);

    fireEvent.click(await screen.findByRole('tab', { name: 'Рейтинг' }));
    expect(await screen.findByAltText('Аватар Duel Opponent')).toHaveAttribute(
      'src',
      '/avatars/opponent.webp',
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть профиль Duel Opponent' }));

    expect(await screen.findByTestId('profile-sheet-backdrop')).toBeInTheDocument();
    expect(await screen.findByText('Любитель')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /написать в личку/i })).toBeInTheDocument();
  });

  it('uses only concrete duel formats for matchmaking filters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/templates')) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches')) {
        return new Response(JSON.stringify({ matches: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/rating')) {
        return new Response(JSON.stringify({ season_key: '2026-05', rating: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matchmaking/join')) {
        return new Response(
          JSON.stringify({
            ticket: {
              user_id: 'u1',
              duel_kinds: ['express', 'classic'],
              created_at: '2026-05-16T10:00:00.000Z',
              expires_at: '2026-05-16T10:02:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&section=duels']);

    expect(screen.queryByRole('button', { name: 'Все' })).not.toBeInTheDocument();

    const express = await screen.findByRole('button', { name: 'Экспресс' });
    const expressPlus = await screen.findByRole('button', { name: 'Экспресс+' });
    const classic = await screen.findByRole('button', { name: 'Классика' });
    expect(express).toHaveAttribute('aria-pressed', 'true');
    expect(expressPlus).toHaveAttribute('aria-pressed', 'true');
    expect(classic).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(expressPlus);
    expect(expressPlus).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Начать поиск' }));

    await waitFor(() => {
      const joinCall = fetchMock.mock.calls.find(([input]) =>
        String(input).includes('/duel/amateur/matchmaking/join'),
      );
      expect(joinCall).toBeTruthy();
      expect(JSON.parse(String(joinCall?.[1]?.body))).toEqual({
        duel_kinds: ['express', 'classic'],
      });
    });
  });

  it('lets a challenger cancel an unanswered duel invite from the current duels list', async () => {
    const invitedMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'invited',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      ready_expires_at: '2026-05-16T10:25:00.000Z',
      me: { ...settledDuelMatch.me, side: 'challenger', state: 'loadout_pending' },
      opponent: { ...settledDuelMatch.opponent, side: 'opponent', state: 'invited' },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/templates')) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches/match-1/cancel')) {
        return new Response(
          JSON.stringify({
            match: { ...invitedMatch, status: 'cancelled', settled_reason: 'cancelled_by_challenger' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/duel/amateur/matches')) {
        return new Response(JSON.stringify({ matches: [invitedMatch] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/rating')) {
        return new Response(JSON.stringify({ season_key: '2026-05', rating: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&section=duels']);

    fireEvent.click(await screen.findByRole('button', { name: 'Отменить вызов Duel Opponent' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('/duel/amateur/matches/match-1/cancel'),
        ),
      ).toBe(true);
    });
  });

  it('highlights the current user in amateur duel rating with a filled row', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/templates')) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches')) {
        return new Response(JSON.stringify({ matches: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/rating')) {
        return new Response(
          JSON.stringify({
            season_key: '2026-05',
            rating: [
              {
                user_id: 'u1',
                display_name: 'Tester',
                avatar_url: null,
                points: 3,
                wins: 1,
                draws: 0,
                losses: 0,
                goals_for: 4,
                goals_against: 2,
                matches_played: 1,
                active_duration_seconds: 180,
              },
              {
                user_id: 'u2',
                display_name: 'Duel Opponent',
                avatar_url: null,
                points: 0,
                wins: 0,
                draws: 0,
                losses: 1,
                goals_for: 2,
                goals_against: 4,
                matches_played: 1,
                active_duration_seconds: 180,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&section=duels']);

    fireEvent.click(await screen.findByRole('tab', { name: 'Рейтинг' }));
    const myRow = await screen.findByRole('button', { name: 'Открыть профиль Tester' });
    expect(myRow.getAttribute('style')).toContain('rgba(15, 23, 42');
    expect(myRow.getAttribute('style')).not.toContain('245, 158, 11');
  });

  it('clicking start period triggers POST /duel/daily/period/start', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/daily/period/start')) {
        return new Response(
          JSON.stringify({
            ...baseState,
            state: 'period_active',
            current_period: 1,
            daily_seed: 'seed-abc',
            period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWith();
    const rinkButton = await findArenaCta('Ежедневная игра: 1-й период доступен');
    fireEvent.click(rinkButton);
    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(true);
    });
  });

  it('shows a result modal for a settled amateur duel', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches/match-1')) {
        return new Response(JSON.stringify({ match: settledDuelMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&match=match-1']);

    const dialog = await screen.findByRole('dialog', { name: 'Результат дуэли' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Победа')).toBeInTheDocument();
    expect(within(dialog).getByText('3:1')).toBeInTheDocument();
    expect(within(dialog).getByText('+3')).toBeInTheDocument();
    expect(within(dialog).getByText('1-й период')).toBeInTheDocument();
    expect(within(dialog).getByText('25%')).toBeInTheDocument();
    expect(within(dialog).getByText('10%')).toBeInTheDocument();
  });

  it('polls an unfinished amateur duel and shows result when it settles', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    let matchFetches = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches/match-1')) {
        matchFetches += 1;
        const waitingMatch: AmateurDuelMatchState = {
          ...settledDuelMatch,
          status: 'active',
          outcome: null,
          winner_user_id: null,
          settled_at: null,
          settled_reason: null,
          me: { ...settledDuelMatch.me, state: 'completed' },
          opponent: { ...settledDuelMatch.opponent, state: 'accepted', goals: 0, shots_taken: 0 },
        };
        return new Response(
          JSON.stringify({ match: matchFetches >= 2 ? settledDuelMatch : waitingMatch }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&match=match-1']);

    try {
      expect(await screen.findByText('Ждём соперника')).toBeInTheDocument();
      await waitFor(() => {
        expect(matchFetches).toBeGreaterThanOrEqual(2);
      });
      expect(await screen.findByRole('dialog', { name: 'Результат дуэли' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
