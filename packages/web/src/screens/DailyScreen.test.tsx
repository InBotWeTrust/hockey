import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  const prototype = globalThis.HTMLCanvasElement?.prototype;
  if (prototype === undefined) return;
  Object.defineProperty(prototype, 'getContext', {
    configurable: true,
    value: () => null,
  });
});
import { render, screen, waitFor, fireEvent, act, within, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  DAILY_PERIOD_SPEED_PRESETS,
  DEFAULT_DUEL_INVENTORY_TIMING,
  STICK_NEUTRAL,
} from '@hockey/game-core';
import {
  DailyScreen,
  duelBackLabel,
  duelEquipmentEffectLabel,
  duelEventTiming,
  duelInventoryBadgeLabel,
  duelInventoryItemRemaining,
  duelScoreboardOpponent,
  duelRinkReadyPresenceForMatch,
  initialGameRouteState,
  isDuelInventoryLow,
  isDuelReadyPresenceState,
  tournamentDuelBackPath,
} from './DailyScreen.js';
import { PlayView, duelFatigueNoticeLabel, duelPrimaryButtonLabel } from '../game/PlayView.js';
import { useAuthStore } from '../auth/authStore.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { useClassicTournamentStore } from '../stores/classicTournamentStore.js';
import type { DailyStateResponse, PeriodLogEntry } from '../api/duel.js';
import type { TrainingStateResponse } from '../api/training.js';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
import type { BonusGameCard } from '../api/bonusGames.js';
import type { ClassicTournamentState } from '../api/tournamentClassic.js';

vi.mock('../game/PixiStage.js', () => ({
  PixiStage: () => <div data-testid="pixi-stage-stub" />,
}));
vi.mock('../game/RinkSvg.js', () => ({
  RinkSvg: () => <div data-testid="rink-svg-stub" />,
}));

const refreshAfterGameExit = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../onboarding/OnboardingGate.js', () => ({
  useOnboardingGate: () => ({ refreshAfterGameExit }),
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

const challengeTemplates = [
  {
    id: 'classic-template',
    title: 'Классика',
    duel_kind: 'classic',
    total_periods: 3,
    shots_per_period: 30,
    period_duration_ms: 1_200_000,
    period_rules: [1, 2, 3].map((periodNumber) => ({
      periodNumber,
      mode: 'quota',
      durationMs: 1_200_000,
      shotsLimit: 30,
    })),
  },
  {
    id: 'mix-template',
    title: 'Микс',
    duel_kind: 'express_plus',
    total_periods: 2,
    shots_per_period: 30,
    period_duration_ms: 180_000,
    period_rules: [
      { periodNumber: 1, mode: 'quota', durationMs: 180_000, shotsLimit: 30 },
      { periodNumber: 2, mode: 'time_attack', durationMs: 180_000, shotsLimit: null },
    ],
  },
  {
    id: 'express-template',
    title: 'Экспресс',
    duel_kind: 'express',
    total_periods: 1,
    shots_per_period: 30,
    period_duration_ms: 180_000,
    period_rules: [{ periodNumber: 1, mode: 'time_attack', durationMs: 180_000, shotsLimit: null }],
  },
];

const classicIdleState: ClassicTournamentState = {
  ...baseState,
  tournament_id: 'classic-1',
  tournament_title: 'Кубок классики',
  tournament_day: 1,
  session_id: 'classic-session-1',
  expired: false,
  closes_at: '2030-09-01T21:00:00.000Z',
  period_duration_ms: 1_200_000,
  break_duration_ms: 900_000,
  daily_seed: 'classic-seed',
  result: null,
};

const settledDuelMatch: AmateurDuelMatchState = {
  id: 'match-1',
  template_id: 'template-1',
  status: 'settled',
  source: 'challenge',
  venue_role: 'neutral',
  ranked: true,
  season_key: '2026-05',
  duel_kind: 'express',
  home_user_id: 'u1',
  venue_policy: 'direct_challenge',
  arena: {
    id: 'arena-beach',
    slug: 'beach',
    title: 'Пляж',
    artwork_url: '/bonus-games/arenas/beach.webp',
    thumbnail_url: '/bonus-games/arenas/beach.webp',
  },
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
    noInventoryTiming: {
      skates: DEFAULT_DUEL_INVENTORY_TIMING,
      nutrition: DEFAULT_DUEL_INVENTORY_TIMING,
    },
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

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <div aria-label="location">{`${location.pathname}${location.search}`}</div>;
}

function renderWith(initialEntries: string[] = ['/']) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={initialEntries}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <DailyScreen />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function findArenaCta(articleName: string): Promise<HTMLElement> {
  await screen.findByRole('article', { name: articleName });
  return screen.getByRole('button', { name: 'На лёд' });
}

beforeEach(() => {
  refreshAfterGameExit.mockClear();
  localStorage.clear();
  useAuthStore.getState().setSession({
    accessToken: 'token',
    refreshToken: 'r',
    user: { id: 'u1', displayName: 'Tester' },
  });
  useDailyStore.setState({
    data: null,
    deferredState: null,
    loading: false,
    inFlight: false,
    error: null,
  });
  useTrainingSessionStore.setState({ data: null, loading: false, inFlight: false, error: null });
  useClassicTournamentStore.setState({
    tournamentId: null,
    data: null,
    loading: false,
    inFlight: false,
    error: null,
  });
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DailyScreen', () => {
  it('does not load the ordinary daily game from a completed tournament URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/daily-1/game-context')
        ? {
            action: 'waiting_playoff',
            tournamentDay: 1,
            result: { goals: 24, shots: 90, accuracy: 0.26667, completed: true },
            message: 'Регулярный сезон завершён. Ожидаем начала плей-офф.',
          }
        : baseState;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=daily&section=tournaments&tournament=daily-1&tab=schedule']);

    expect(
      await screen.findByText('Регулярный сезон завершён. Ожидаем начала плей-офф.'),
    ).toBeInTheDocument();
    expect(screen.getByText('24 шайбы · 90 бросков · точность 26,67%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /брос/i })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/duel/daily/state')),
    ).toBe(false);
  });

  it('opens a classic tournament game after the context guard without loading daily state', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/classic-1/game-context')
        ? { action: 'play_classic', tournamentDay: 1, result: null, message: null }
        : url.includes('/tournaments/classic-1/classic/state')
          ? classicIdleState
          : baseState;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=classic&section=tournaments&tournament=classic-1&tab=schedule']);

    expect(await screen.findByText('Кубок классики · 1-й тур')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'НАЧАТЬ' })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/duel/daily/state')),
    ).toBe(false);
  });

  it('shows classic period results before the resurfacing break', async () => {
    const breakState: ClassicTournamentState = {
      ...classicIdleState,
      state: 'break_active',
      current_period: 1,
      daily_total_shots: 30,
      daily_total_goals: 28,
      break_ends_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      recent_periods: [
        {
          period_number: 1,
          shots_taken: 30,
          goals: 28,
          closed_reason: 'quota',
          duration_ms: 180_000,
          ended_at: '2026-09-02T18:03:00.000Z',
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(breakState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWith(['/?view=classic&tournament=classic-1']);

    expect(await screen.findByRole('dialog', { name: '1-й период завершён' })).toBeInTheDocument();
    expect(screen.getByLabelText('Итого: 28 голов из 30 бросков')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(screen.queryByRole('dialog', { name: '1-й период завершён' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ЛЁД ГОТОВИТСЯ' })).toBeDisabled();
  });

  it('refreshes classic state when the break timer reaches zero', async () => {
    const expiredBreak: ClassicTournamentState = {
      ...classicIdleState,
      state: 'break_active',
      current_period: 1,
      daily_total_shots: 30,
      daily_total_goals: 28,
      break_ends_at: new Date(Date.now() - 1_000).toISOString(),
      recent_periods: [],
    };
    const nextPeriod: ClassicTournamentState = {
      ...classicIdleState,
      state: 'idle',
      current_period: 1,
      daily_total_shots: 30,
      daily_total_goals: 28,
    };
    let stateRequests = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      stateRequests += 1;
      return new Response(JSON.stringify(stateRequests === 1 ? expiredBreak : nextPeriod), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=classic&tournament=classic-1']);

    expect(await screen.findByRole('button', { name: 'ПРОДОЛЖИТЬ' })).toBeEnabled();
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the complete classic game result after the third period', async () => {
    const periods = [
      { period_number: 1, goals: 28, ended_at: '2026-09-02T18:03:00.000Z' },
      { period_number: 2, goals: 25, ended_at: '2026-09-02T18:09:00.000Z' },
      { period_number: 3, goals: 25, ended_at: '2026-09-02T18:15:00.000Z' },
    ].map((period) => ({
      ...period,
      shots_taken: 30,
      closed_reason: 'quota' as const,
      duration_ms: 180_000,
    }));
    const closedState: ClassicTournamentState = {
      ...classicIdleState,
      state: 'closed',
      current_period: 3,
      daily_total_shots: 90,
      daily_total_goals: 78,
      recent_periods: periods,
      result: {
        goals: 78,
        shots: 90,
        accuracy: 78 / 90,
        counted: true,
        game_completed: true,
      },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(closedState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWith(['/?view=classic&tournament=classic-1']);

    expect(await screen.findByRole('dialog', { name: 'Игра завершена' })).toBeInTheDocument();
    expect(screen.getByLabelText('Итого: 78 голов из 90 бросков')).toBeInTheDocument();
    expect(screen.getByText('87%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(screen.queryByRole('dialog', { name: 'Игра завершена' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ИГРА ЗАВЕРШЕНА' })).toBeDisabled();
  });

  it('opens the daily tournament game when the URL incorrectly says classic', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/daily-1/game-context')
        ? { action: 'play_daily', tournamentDay: 1, result: null, message: null }
        : baseState;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=classic&section=tournaments&tournament=daily-1&tab=schedule']);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes('/duel/daily/state')),
      ).toBe(true);
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/tournaments/daily-1/classic/state'),
      ),
    ).toBe(false);
  });

  it('opens the classic tournament game when the URL incorrectly says daily', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/classic-1/game-context')
        ? { action: 'play_classic', tournamentDay: 1, result: null, message: null }
        : url.includes('/tournaments/classic-1/classic/state')
          ? classicIdleState
          : baseState;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=daily&section=tournaments&tournament=classic-1&tab=schedule']);

    expect(await screen.findByText('Кубок классики · 1-й тур')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/duel/daily/state')),
    ).toBe(false);
  });

  it('shows a credited incomplete tournament result', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/daily-incomplete/game-context')
        ? {
            action: 'waiting_playoff',
            tournamentDay: 1,
            result: { goals: 1, shots: 2, accuracy: 0.5, completed: false },
            message: 'Регулярный сезон завершён. Ожидаем начала плей-офф.',
          }
        : baseState;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=daily&section=tournaments&tournament=daily-incomplete&tab=schedule']);

    expect(
      await screen.findByText('Незавершённая игра зачтена по правилам турнира.'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 шайба · 2 броска · точность 50,00%')).toBeInTheDocument();
  });

  it('shows every active classic tournament on the arena and opens its own game', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/classic/active')
        ? {
            games: [
              {
                tournament_id: 'classic-1',
                tournament_title: 'Турнир с новой ежедневной игрой',
                tournament_day: 1,
                starts_at: '2030-09-01T00:00:00.000Z',
                closes_at: '2030-09-01T21:00:00.000Z',
                state: 'available',
                current_period: 0,
                total_shots: 0,
                total_goals: 0,
              },
            ],
          }
        : url.includes('/tournaments/classic-1/classic/state')
          ? classicIdleState
          : url.includes('/duel/training/state')
            ? trainingIdleState
            : baseState;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=arena']);
    const title = await screen.findByText('Турнир с новой ежедневной игрой');
    expect(title).toHaveClass('arena-cube-title--long');
    expect(title).toHaveStyle({ WebkitLineClamp: '3' });
    const classicDescription = screen.getByLabelText('Отдельная игра по правилам турнира');
    expect(classicDescription.querySelectorAll('br')).toHaveLength(1);
    expect(
      screen.getByLabelText(/Турнир с новой ежедневной игрой\. 1-й тур\. До закрытия/),
    ).toHaveStyle({
      gridTemplateColumns: 'max-content max-content',
      gap: 'clamp(14px, 2.2vh, 18px)',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

    expect(await screen.findByText('Кубок классики · 1-й тур')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'НАЧАТЬ' })).toBeInTheDocument();
  });

  it('shows the classic break countdown on the arena instead of the game deadline', async () => {
    const breakEndsAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/classic/active')
        ? {
            games: [
              {
                tournament_id: 'classic-break',
                tournament_title: 'Кубок перерыва',
                tournament_day: 2,
                starts_at: '2030-09-01T00:00:00.000Z',
                closes_at: '2030-09-01T21:00:00.000Z',
                break_ends_at: breakEndsAt,
                state: 'break_active',
                current_period: 1,
                total_shots: 30,
                total_goals: 12,
              },
            ],
          }
        : url.includes('/duel/training/state')
          ? trainingIdleState
          : baseState;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=arena']);

    expect(
      await screen.findByLabelText(/Кубок перерыва\. 2-й тур\. Перерыв\. До конца/),
    ).toBeInTheDocument();
    expect(screen.getByText('Перерыв')).toBeInTheDocument();
    expect(screen.queryByText('До закрытия')).not.toBeInTheDocument();
  });

  it('returns from a classic tournament game to its schedule', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/classic/active')
        ? {
            games: [
              {
                tournament_id: 'classic-1',
                tournament_title: 'Кубок классики',
                tournament_day: 1,
                starts_at: '2030-09-01T00:00:00.000Z',
                closes_at: '2030-09-01T21:00:00.000Z',
                break_ends_at: null,
                state: 'available',
                current_period: 0,
                total_shots: 0,
                total_goals: 0,
              },
            ],
          }
        : url.includes('/tournaments/classic-1/classic/state')
          ? classicIdleState
          : url.includes('/duel/training/state')
            ? trainingIdleState
            : baseState;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    function LocationProbe() {
      return <output aria-label="Текущий адрес">{useLocation().search}</output>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/?view=arena']}>
          <DailyScreen />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    fireEvent.click(await screen.findByRole('button', { name: 'К турниру' }));

    expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent(
      'view=amateur&section=tournaments&tournament=classic-1&tab=schedule',
    );
  });

  it('puts an already started classic game before a new one', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/classic/active')
        ? {
            games: [
              {
                tournament_id: 'new-classic',
                tournament_title: 'Новая классика',
                tournament_day: 1,
                starts_at: '2030-09-01T00:00:00.000Z',
                closes_at: '2030-09-01T21:00:00.000Z',
                state: 'available',
                current_period: 0,
                total_shots: 0,
                total_goals: 0,
              },
              {
                tournament_id: 'started-classic',
                tournament_title: 'Начатая классика',
                tournament_day: 2,
                starts_at: '2030-09-01T00:00:00.000Z',
                closes_at: '2030-09-01T21:00:00.000Z',
                state: 'period_active',
                current_period: 1,
                total_shots: 4,
                total_goals: 2,
              },
            ],
          }
        : url.includes('/duel/training/state')
          ? trainingIdleState
          : baseState;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=arena']);

    const selectors = await screen.findAllByRole('button', { name: /^Выбрать Турнир/ });
    expect(selectors.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Выбрать Турнир · 2-й тур',
      'Выбрать Турнир · 1-й тур',
    ]);
  });

  it('shows a completed classic result without an action button', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/classic/active')
        ? {
            games: [
              {
                tournament_id: 'completed-classic',
                tournament_title: 'Финишная классика',
                tournament_day: 3,
                starts_at: '2030-09-01T00:00:00.000Z',
                closes_at: '2030-09-01T21:00:00.000Z',
                state: 'closed',
                current_period: 3,
                total_shots: 90,
                total_goals: 36,
              },
            ],
          }
        : url.includes('/duel/training/state')
          ? trainingIdleState
          : baseState;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=arena']);

    expect(await screen.findByLabelText('Результат: 36 шайб, точность 40%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Начать|Продолжить/ })).toBeNull();
  });

  it('keeps tournament duel navigation tied to the tournament section', () => {
    expect(duelBackLabel('tournament', true)).toBe('К турниру');
    expect(duelBackLabel('challenge', true)).toBe('К арене');
    expect(duelBackLabel('matchmaking', false)).toBe('К дуэлям');
    expect(tournamentDuelBackPath(false)).toBe('/?view=amateur&section=tournaments');
    expect(tournamentDuelBackPath(true)).toBe('/?view=amateur&section=tournaments&from=sections');
    expect(tournamentDuelBackPath(false, 't1')).toBe(
      '/?view=amateur&section=tournaments&tournament=t1&tab=schedule',
    );
    expect(tournamentDuelBackPath(true, 'tournament with spaces')).toBe(
      '/?view=amateur&section=tournaments&tournament=tournament+with+spaces&tab=schedule&from=sections',
    );
  });

  it('formats duel inventory badges without showing exhausted zero', () => {
    expect(duelInventoryBadgeLabel('stick', 0, 'shot')).toBeNull();
    expect(duelInventoryBadgeLabel('stick', 1300, 'shot')?.replace(/\s/g, ' ')).toBe('1 300');
    expect(duelInventoryBadgeLabel('skates', 8500, 'distance')?.replace(/\s/g, ' ')).toBe('8 500');
    expect(duelInventoryBadgeLabel('nutrition', 300_000, 'energy_ms')).toBe('5 мин');
    expect(duelInventoryBadgeLabel('nutrition', 45_000, 'energy_ms')).toBe('45 сек');
  });

  it('detects low duel inventory for every equipment kind', () => {
    expect(isDuelInventoryLow('stick', 10, 10)).toBe(true);
    expect(isDuelInventoryLow('stick', 11, 10)).toBe(false);
    expect(isDuelInventoryLow('skates', 50, 50)).toBe(true);
    expect(isDuelInventoryLow('skates', 51, 50)).toBe(false);
    expect(isDuelInventoryLow('nutrition', 60_000, 60_000)).toBe(true);
    expect(isDuelInventoryLow('nutrition', 60_001, 60_000)).toBe(false);
    expect(isDuelInventoryLow('nutrition', 0, 60_000)).toBe(false);
  });

  it('subtracts live duel skates and energy usage from HUD inventory numbers', () => {
    const activeMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      period_started_at: '2026-05-16T10:00:00.000Z',
      period_ends_at: '2026-05-16T10:03:00.000Z',
      me: {
        ...settledDuelMatch.me,
        state: 'period_active',
        current_period: 1,
        loadout: {
          ...settledDuelMatch.me.loadout,
          items: [
            {
              id: 'skates-1',
              kind: 'skates',
              title: 'Коньки',
              rarity: 'common',
              powerScore: 0,
              duelPeriodCost: 0,
              chargesReserved: 0,
              resourceUnit: 'distance',
              resourceAvailable: 50,
              lowStockThreshold: 50,
            },
            {
              id: 'energy-1',
              kind: 'nutrition',
              title: 'Энергия',
              rarity: 'common',
              powerScore: 0,
              duelPeriodCost: 0,
              chargesReserved: 0,
              resourceUnit: 'energy_ms',
              resourceAvailable: 60_000,
              lowStockThreshold: 60_000,
            },
          ],
        },
      },
    };
    const liveCondition = {
      puckSpeedDelta: 0,
      shooterSpeedMultiplier: 1,
      canShoot: true,
      status: 'normal',
      fatigueLevel: 'none',
      stumbleActive: false,
      shooterXOffsetPx: 0,
      fatigueMs: 0,
      nutritionConsumed: 15_000,
      skatesConsumed: 11,
    } as const;

    expect(
      duelInventoryItemRemaining(activeMatch, activeMatch.me.loadout.items[0]!, liveCondition),
    ).toBe(39);
    expect(
      duelInventoryItemRemaining(activeMatch, activeMatch.me.loadout.items[1]!, liveCondition),
    ).toBe(45_000);
  });

  it('names blocked duel shot button states by condition', () => {
    const baseCondition = {
      puckSpeedDelta: 0,
      shooterSpeedMultiplier: 1,
      canShoot: true,
      status: 'normal',
      fatigueLevel: 'none',
      stumbleActive: false,
      shooterXOffsetPx: 0,
      fatigueMs: 0,
      nutritionConsumed: 0,
      skatesConsumed: 0,
    } as const;

    expect(duelPrimaryButtonLabel('БРОСОК', null)).toBe('БРОСОК');
    expect(
      duelPrimaryButtonLabel('БРОСОК', { ...baseCondition, canShoot: true, status: 'tired' }),
    ).toBe('БРОСОК');
    expect(
      duelPrimaryButtonLabel('БРОСОК', {
        ...baseCondition,
        canShoot: false,
        status: 'exhausted_stop',
      }),
    ).toBe('ОТДЫХ');
    expect(
      duelPrimaryButtonLabel('БРОСОК', { ...baseCondition, canShoot: false, status: 'stumble' }),
    ).toBe('БРОСОК');
  });

  it('shows one visible fatigue state while the shot button stays available', () => {
    const baseCondition = {
      puckSpeedDelta: 0,
      shooterSpeedMultiplier: 1,
      canShoot: true,
      status: 'normal',
      fatigueLevel: 'none',
      stumbleActive: false,
      shooterXOffsetPx: 0,
      fatigueMs: 0,
      nutritionConsumed: 0,
      skatesConsumed: 0,
    } as const;

    expect(duelFatigueNoticeLabel(null)).toBeNull();
    expect(duelFatigueNoticeLabel(baseCondition)).toBeNull();
    expect(
      duelFatigueNoticeLabel({
        ...baseCondition,
        status: 'tired',
        fatigueLevel: 'medium',
        shooterSpeedMultiplier: 0.9,
      }),
    ).toBe('Усталость');
    expect(
      duelFatigueNoticeLabel({
        ...baseCondition,
        status: 'tired',
        fatigueLevel: 'heavy',
        shooterSpeedMultiplier: 0.75,
      }),
    ).toBe('Усталость');
    expect(
      duelFatigueNoticeLabel({
        ...baseCondition,
        canShoot: false,
        status: 'exhausted_stop',
        fatigueLevel: 'resting',
        shooterSpeedMultiplier: 0,
      }),
    ).toBe('Надо отдышаться');
  });

  it('shows a rest notice while the exhausted shot button is blocked', () => {
    const restCondition = {
      puckSpeedDelta: 0,
      shooterSpeedMultiplier: 0,
      canShoot: false,
      status: 'exhausted_stop',
      fatigueLevel: 'resting',
      stumbleActive: false,
      shooterXOffsetPx: 0,
      fatigueMs: 90_000,
      nutritionConsumed: 60_000,
      skatesConsumed: 0,
    } as const;

    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="seed"
        goalieId="rookie"
        periodNumber={1}
        goals={0}
        shots={0}
        shotsTotal={30}
        sessionStartedAt="2026-04-25T12:00:00.000Z"
        serverNow="2026-04-25T12:00:00.000Z"
        receivedAtPerformanceMs={0}
        periodEndsAt={Date.now() + 10_000}
        optimisticAddShot={() => undefined}
        submitShot={async () => null}
        applyState={() => undefined}
        rinkLayer={<div data-testid="test-rink-layer" />}
        duelCondition={() => restCondition}
      />,
    );

    expect(screen.getByRole('button', { name: 'ОТДЫХ' })).toBeDisabled();
    expect(screen.getByText('Надо отдышаться')).toBeInTheDocument();
  });

  it('shows fatigue notice while keeping the duel shot button available', () => {
    const tiredCondition = {
      puckSpeedDelta: 0,
      shooterSpeedMultiplier: 0.9,
      canShoot: true,
      status: 'tired',
      fatigueLevel: 'medium',
      stumbleActive: false,
      shooterXOffsetPx: 0,
      fatigueMs: 45_000,
      nutritionConsumed: 60_000,
      skatesConsumed: 0,
    } as const;

    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="seed"
        goalieId="rookie"
        periodNumber={1}
        goals={0}
        shots={0}
        shotsTotal={30}
        sessionStartedAt="2026-04-25T12:00:00.000Z"
        serverNow="2026-04-25T12:00:00.000Z"
        receivedAtPerformanceMs={0}
        periodEndsAt={Date.now() + 10_000}
        optimisticAddShot={() => undefined}
        submitShot={async () => null}
        applyState={() => undefined}
        rinkLayer={<div data-testid="test-rink-layer" />}
        duelCondition={() => tiredCondition}
      />,
    );

    expect(screen.getByRole('button', { name: 'БРОСОК' })).toBeEnabled();
    expect(screen.getByText('Усталость')).toBeInTheDocument();
  });

  it('shows a short stumble notice near the player instead of renaming the shot button', () => {
    vi.useFakeTimers();
    const stumbleCondition = {
      puckSpeedDelta: 0,
      shooterSpeedMultiplier: 1,
      canShoot: false,
      status: 'stumble',
      fatigueLevel: 'none',
      stumbleActive: true,
      shooterXOffsetPx: 0,
      fatigueMs: 0,
      nutritionConsumed: 0,
      skatesConsumed: 0,
    } as const;

    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="seed"
        goalieId="rookie"
        periodNumber={1}
        goals={0}
        shots={0}
        shotsTotal={30}
        sessionStartedAt="2026-04-25T12:00:00.000Z"
        serverNow="2026-04-25T12:00:00.000Z"
        receivedAtPerformanceMs={0}
        periodEndsAt={Date.now() + 10_000}
        optimisticAddShot={() => undefined}
        submitShot={async () => null}
        applyState={() => undefined}
        rinkLayer={<div data-testid="test-rink-layer" />}
        duelCondition={() => stumbleCondition}
      />,
    );

    expect(screen.getByRole('button', { name: 'БРОСОК' })).toBeDisabled();
    expect(screen.getByText('Споткнулся')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.queryByText('Споткнулся')).not.toBeInTheDocument();
  });

  it('uses understandable duel equipment effect labels for skates and energy', () => {
    expect(duelEquipmentEffectLabel('skates', 20, 50, 'distance')).toBe('Защищают от спотыканий');
    expect(duelEquipmentEffectLabel('skates', 0)).toBe('Возможны спотыкания');
    expect(duelEquipmentEffectLabel('nutrition', 12, 60_000, 'energy_ms')).toBe(
      'Запас энергии: 1 мин',
    );
    expect(duelEquipmentEffectLabel('nutrition', 0)).toBe('Без дополнительной энергии');
  });

  it('shows loader while fetching state', () => {
    renderWith();
    expect(screen.getByRole('status')).toHaveClass('route-loading');
  });

  it('renders a high-contrast arena error state when the daily request fails', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network unavailable'));

    renderWith();

    const title = await screen.findByText('Не удалось загрузить');
    expect(title.parentElement).toHaveClass('arena-error-state');
    expect(title).toHaveClass('arena-error-state__title');
    expect(screen.getByText('Network unavailable')).toHaveClass('arena-error-state__copy');
    expect(screen.getByText(/Если ошибка повторяется/)).toHaveClass('arena-error-state__hint');
  });

  it('renders idle view with start button after fetch', async () => {
    renderWith();
    expect(await findArenaCta('Ежедневная игра: 1-й период доступен')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Игровая арена' })).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Ежедневная игра: 1-й период доступен' }),
    ).toBeInTheDocument();
    const previousTableauButton = screen.getByRole('button', {
      name: 'Предыдущий экран табло',
    });
    expect(previousTableauButton.parentElement).toHaveStyle({ left: '4%', right: '4%' });
    expect(
      screen.getByRole('article', { name: 'Ежедневная игра: 1-й период доступен' }),
    ).toHaveStyle({ padding: '0 clamp(38px, 11vw, 46px)' });
    expect(document.querySelector('.arena-video-cube__background')).toHaveAttribute(
      'src',
      '/sprites/app-arena-ice.webp',
    );
    expect(document.querySelector('.arena-video-cube__cube')).toHaveAttribute(
      'src',
      '/sprites/app-arena-cube.webp',
    );
    expect(document.querySelector('img[src="/sprites/arena-ice-tableau-v2.webp"]')).toBeNull();
    expect(screen.queryByRole('img', { name: 'Игровая площадка в перспективе' })).toBeNull();
    const tableau = screen.getByLabelText('Разделы на табло');
    expect(tableau).toHaveClass('arena-video-cube__screen');
    expect(tableau.parentElement).toHaveClass('arena-video-cube__plate');
    expect(screen.getByText('Ежедневная игра')).toBeInTheDocument();
    expect(screen.getByText('1-й период доступен')).toBeInTheDocument();
    expect(screen.getByText('Время')).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByText('Период')).toBeInTheDocument();
    expect(
      screen.getByLabelText('1-й период доступен. Время периода 20:00. Период 1'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Тренировка' }));
    expect(screen.getByRole('article', { name: 'Тренировка: Тренировка' })).toBeInTheDocument();
    expect(screen.getByText('0/500 бросков сегодня')).toBeInTheDocument();
    expect(screen.queryByText('Любители')).not.toBeInTheDocument();
    expect(screen.queryByText('Профессионалы')).not.toBeInTheDocument();
  });

  it('switches arena tableau cards with circular swipe gestures', async () => {
    renderWith(['/?view=arena']);

    expect(
      await screen.findByRole('article', { name: 'Ежедневная игра: 1-й период доступен' }),
    ).toBeInTheDocument();

    const tableau = screen.getByLabelText('Разделы на табло');
    fireEvent.pointerDown(tableau, { pointerId: 1, clientX: 320, clientY: 220 });
    fireEvent.pointerUp(tableau, { pointerId: 1, clientX: 210, clientY: 224 });

    expect(screen.getByRole('article', { name: 'Тренировка: Тренировка' })).toBeInTheDocument();

    fireEvent.pointerDown(tableau, { pointerId: 2, clientX: 210, clientY: 224 });
    fireEvent.pointerUp(tableau, { pointerId: 2, clientX: 320, clientY: 220 });

    expect(
      screen.getByRole('article', { name: 'Ежедневная игра: 1-й период доступен' }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(tableau, { pointerId: 3, clientX: 210, clientY: 224 });
    fireEvent.pointerUp(tableau, { pointerId: 3, clientX: 320, clientY: 220 });

    expect(screen.getByRole('article', { name: 'Тренировка: Тренировка' })).toBeInTheDocument();
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

  it('prioritizes active duels before saved daily and training cards on the arena', async () => {
    localStorage.setItem('hockey.arenaSelectedEntryId', 'training');
    const activeMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      rules: { ...settledDuelMatch.rules, duelKind: 'express_plus' },
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
    expect(screen.getByText('Активная дуэль (Ваш ход)')).toBeInTheDocument();
    expect(screen.queryByText('Ваш ход')).not.toBeInTheDocument();
    expect(screen.getByText('Duel Opponent')).toHaveClass('arena-duel-opponent-name');
    const formatHeading = screen.getByText('Микс');
    expect(formatHeading).toHaveClass('arena-duel-format-heading');
    expect(formatHeading).toHaveStyle({
      color: 'rgba(247, 254, 255, 0.92)',
      marginTop: '3px',
      textAlign: 'center',
    });
    expect(screen.getByLabelText('Площадка: Нейтральное поле')).toHaveClass(
      'arena-duel-venue-label',
    );
    expect(screen.getByLabelText('Площадка: Нейтральное поле')).not.toHaveClass('venue-badge');
    const duelIdentity = screen
      .getByRole('article', { name: 'Активная дуэль: Duel Opponent' })
      .querySelector('.arena-duel-identity');
    expect(duelIdentity).toHaveStyle({ gap: 'clamp(5px, 1vh, 8px)' });
    expect(duelIdentity).not.toContainElement(formatHeading);
    expect(screen.getByLabelText('Выбрать Активная дуэль')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByLabelText('Выбрать Ежедневная игра'));
    expect(
      await screen.findByRole('article', { name: 'Ежедневная игра: 1-й период доступен' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Выбрать Тренировка'));
    expect(
      await screen.findByRole('article', { name: 'Тренировка: Тренировка' }),
    ).toBeInTheDocument();
  });

  it('shows outgoing and incoming duel invites from the current player perspective', async () => {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const outgoingInvite: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'invited',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      ready_expires_at: expiresAt,
      server_now: new Date().toISOString(),
      me: { ...settledDuelMatch.me, side: 'challenger', state: 'loadout_pending' },
      opponent: { ...settledDuelMatch.opponent, side: 'opponent', state: 'invited' },
    };
    const incomingInvite: AmateurDuelMatchState = {
      ...outgoingInvite,
      id: 'match-2',
      me: { ...settledDuelMatch.me, side: 'opponent', state: 'invited' },
      opponent: { ...settledDuelMatch.opponent, side: 'challenger', state: 'loadout_pending' },
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
      if (url.includes('/duel/amateur/events')) {
        return new Response(JSON.stringify({ events: [outgoingInvite, incomingInvite] }), {
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

    expect(await screen.findByText('Активная дуэль (Ждём ответ соперника)')).toBeInTheDocument();
    expect(screen.queryByText('Ждём ответ соперника')).not.toBeInTheDocument();
    expect(screen.getByText('До автоотмены')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ждём ответ' })).toBeInTheDocument();

    const duelDots = await screen.findAllByLabelText('Выбрать Активная дуэль');
    fireEvent.click(duelDots[1] as HTMLElement);

    expect(await screen.findByText('Активная дуэль (Вас вызвали)')).toBeInTheDocument();
    expect(screen.queryByText('Вас вызвали')).not.toBeInTheDocument();
    expect(screen.getByText('До ответа')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отклонить' })).toHaveClass(
      'arena-duel-invite-action--decline',
    );
    expect(screen.getByRole('button', { name: 'Принять' })).toHaveClass(
      'arena-duel-invite-action--accept',
    );
  });

  it('restores the last selected arena card after returning home', async () => {
    localStorage.setItem('hockey.arenaSelectedEntryId', 'training');

    renderWith(['/?view=arena']);

    expect(
      await screen.findByRole('article', { name: 'Тренировка: Тренировка' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Выбрать Тренировка')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Выбрать Ежедневная игра')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('falls back to daily when the saved duel card is no longer available', async () => {
    localStorage.setItem('hockey.arenaSelectedEntryId', 'duel-match-1');

    renderWith(['/?view=arena']);

    expect(
      await screen.findByRole('article', { name: 'Ежедневная игра: 1-й период доступен' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Выбрать Ежедневная игра')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() => {
      expect(localStorage.getItem('hockey.arenaSelectedEntryId')).toBeNull();
    });
  });

  it('renders the immutable amateur duel arena snapshot on the rink', async () => {
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

    await screen.findByRole('article', { name: 'Активная дуэль: Duel Opponent' });
    fireEvent.click(screen.getByRole('button', { name: 'Вы сыграли' }));

    expect(await screen.findByRole('button', { name: 'К арене' })).toBeInTheDocument();
    expect(screen.getByText('До поражения соперника')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Дуэль' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Эта дуэль сейчас не на площадке/)).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/sprites/training-court.webp"]')).toBeTruthy();
    expect(document.querySelector('img[src="/bonus-games/arenas/beach.webp"]')).toBeFalsy();
  });

  it('opens an idle daily rink without starting the period from the arena', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/me')) {
        return new Response(JSON.stringify({ competitionLevel: 'beginner' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
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
    expect(screen.getByRole('button', { name: 'НАЧАТЬ' })).toBeInTheDocument();
    expect(screen.getByLabelText('Игровое табло')).toBeInTheDocument();
    expect(document.querySelector('img[src="/sprites/daily-tableau.webp"]')).toBeFalsy();
    expect(document.querySelector('img[src="/sprites/wide-tableau-led-dark-v2.webp"]')).toBeFalsy();
    expect(document.querySelector('img[src="/sprites/street-tableau.webp"]')).toBeFalsy();
    expect(document.querySelector('img[src="/sprites/training-court.webp"]')).toBeTruthy();
    expect(document.querySelector('img[src="/sprites/amateur-daily-court.webp"]')).toBeFalsy();
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(false);
    expect(screen.queryByTestId('arena-rink-backdrop')).not.toBeInTheDocument();
  });

  it('keeps the simple stadium for an amateur daily game', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/me')) {
        return new Response(JSON.stringify({ competitionLevel: 'amateur' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ...baseState,
          lifetime_total_goals: 0,
          amateur_unlock_goals_required: 300,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    renderWith(['/?view=daily']);

    expect(await screen.findByRole('button', { name: 'НАЧАТЬ' })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('img[src="/sprites/amateur-daily-court.webp"]')).toBeTruthy();
    });
    expect(document.querySelector('img[src="/sprites/training-court.webp"]')).toBeFalsy();
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

  it('blocks another daily shot while an ambiguous result is being reconciled', async () => {
    const activeState: DailyStateResponse = {
      ...baseState,
      state: 'period_active',
      current_period: 1,
      current_period_shots: 29,
      current_period_goals: 12,
      daily_total_shots: 29,
      daily_total_goals: 12,
      daily_seed: 'seed-abc',
      period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(activeState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    renderWith(['/?view=daily']);
    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeEnabled();

    vi.mocked(globalThis.fetch).mockImplementation(() => new Promise(() => undefined));
    act(() => {
      useDailyStore.setState({ needsReconcile: true });
    });

    expect(screen.getByRole('button', { name: 'ПРОВЕРЯЕМ...' })).toBeDisabled();
    expect(screen.getByText('Проверяем результат')).toBeInTheDocument();
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
    act(() => {
      useDailyStore.setState((state) => ({
        data: state.data ? { ...state.data, lifetime_total_goals: 1000 } : state.data,
      }));
    });
    expect(screen.getByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
    expect(refreshAfterGameExit).not.toHaveBeenCalled();
    fireEvent.click(back);
    fireEvent.click(back);

    expect(await findArenaCta('Ежедневная игра: 1-й период')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
    expect(refreshAfterGameExit).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('location')).toHaveTextContent('/?view=arena');
  });

  it('refreshes onboarding once after leaving active training, never while still playing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      return new Response(
        JSON.stringify(url.includes('/duel/training/state') ? trainingActiveState : baseState),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    renderWith(['/?view=training&play=1']);

    const back = await screen.findByRole('button', { name: 'К тренировке' });
    expect(refreshAfterGameExit).not.toHaveBeenCalled();
    fireEvent.click(back);

    await screen.findByRole('article', { name: 'Ежедневная игра: 1-й период доступен' });
    expect(refreshAfterGameExit).toHaveBeenCalledTimes(1);
  });

  it('refreshes onboarding once after leaving a closed training rink', async () => {
    const closedTraining: TrainingStateResponse = {
      ...trainingActiveState,
      state: 'closed',
      shots_taken: trainingActiveState.shots_limit,
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      return new Response(
        JSON.stringify(url.includes('/duel/training/state') ? closedTraining : baseState),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    renderWith(['/?view=training&play=1']);

    fireEvent.click(await screen.findByRole('button', { name: 'К тренировке' }));

    expect(await screen.findByLabelText('location')).toHaveTextContent('/?view=arena');
    expect(refreshAfterGameExit).toHaveBeenCalledTimes(1);
  });

  it('refreshes onboarding once after leaving an active direct duel', async () => {
    const now = Date.now();
    const activeMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      server_now: new Date(now).toISOString(),
      period_started_at: new Date(now - 15_000).toISOString(),
      period_ends_at: new Date(now + 165_000).toISOString(),
      me: {
        ...settledDuelMatch.me,
        state: 'period_active',
        current_period: 1,
        period_started_at: new Date(now - 15_000).toISOString(),
        period_ends_at: new Date(now + 165_000).toISOString(),
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
        return new Response(JSON.stringify({ match: activeMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWith(['/?view=amateur&match=match-1&play=1']);

    const back = await screen.findByRole('button', { name: 'К дуэлям' });
    expect(refreshAfterGameExit).not.toHaveBeenCalled();
    fireEvent.click(back);

    await screen.findByRole('article', { name: /Ежедневная игра/ });
    expect(refreshAfterGameExit).toHaveBeenCalledTimes(1);
  });

  it('returns from a tournament daily game to that tournament schedule', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = url.includes('/tournaments/daily-1/game-context')
        ? { action: 'play_daily', tournamentDay: 1, result: null, message: null }
        : {
            ...baseState,
            state: 'period_active',
            current_period: 1,
            current_period_shots: 4,
            current_period_goals: 2,
            daily_seed: 'seed-abc',
            period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    function LocationProbe() {
      return <output aria-label="Текущий адрес">{useLocation().search}</output>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[
            '/?view=daily&section=tournaments&tournament=daily-1&tab=schedule&from=sections',
          ]}
        >
          <DailyScreen />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('button', { name: 'К турниру' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'К режимам' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'К турниру' }));

    expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent(
      'view=amateur&section=tournaments&tournament=daily-1&tab=schedule&from=sections',
    );
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
    const scoreboardText = screen.getByLabelText('Игровое табло').textContent ?? '';
    expect(scoreboardText.indexOf('ГОЛЫ')).toBeGreaterThan(scoreboardText.indexOf('ПЕРИОД'));
    expect(scoreboardText.indexOf('БРОСКИ')).toBeGreaterThan(scoreboardText.indexOf('ГОЛЫ'));
    expect(scoreboardText.indexOf('ВРЕМЯ')).toBeGreaterThan(scoreboardText.indexOf('БРОСКИ'));
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
    expect(screen.getByLabelText('location')).toHaveTextContent('/?view=arena');
    expect(refreshAfterGameExit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Итоги ежедневной игры' })).not.toBeInTheDocument();

    fireEvent.click(await findArenaCta('Ежедневная игра: Перерыв'));

    expect(
      await screen.findByRole('dialog', { name: 'Итоги ежедневной игры' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pixi-stage-stub')).toBeInTheDocument();
  });

  it('refreshes onboarding after dismissing deferred finished-game stats', async () => {
    const activeState: DailyStateResponse = {
      ...baseState,
      state: 'period_active',
      current_period: 3,
      current_period_shots: 29,
      current_period_goals: 14,
      daily_total_shots: 89,
      daily_total_goals: 41,
      daily_seed: 'seed-abc',
      period_ends_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const finalPeriod: PeriodLogEntry = {
      period_number: 3,
      shots_taken: 30,
      goals: 15,
      closed_reason: 'quota',
      duration_ms: 1_200_000,
      ended_at: '2026-04-25T13:30:00.000Z',
    };
    const closedState: DailyStateResponse = {
      ...activeState,
      state: 'closed',
      current_period_shots: 0,
      current_period_goals: 0,
      daily_total_shots: 90,
      daily_total_goals: 42,
      period_ends_at: null,
      recent_periods: [finalPeriod],
      previous_game: {
        day_date: '2026-04-25',
        total_shots: 90,
        total_goals: 42,
        total_duration_ms: 3_600_000,
        periods: [finalPeriod],
      },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      return new Response(
        JSON.stringify(url.includes('/duel/training/state') ? trainingIdleState : activeState),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    renderWith(['/?view=daily']);
    await screen.findByRole('button', { name: 'БРОСОК' });

    act(() => useDailyStore.getState().setDeferredState(closedState));
    const dialog = await screen.findByRole('dialog', { name: 'Игра завершена' });
    expect(refreshAfterGameExit).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Понятно' }));

    expect(await screen.findByLabelText('location')).toHaveTextContent('/?view=arena');
    expect(refreshAfterGameExit).toHaveBeenCalledTimes(1);
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

  it('can leave an idle daily rink without starting a period', async () => {
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
    expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(false);
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
    const closedScoreboard = screen.getByLabelText(/^Завершена\. До обновления/);
    expect(closedScoreboard).toHaveClass('daily-hub-scoreboard--timer-only');
    expect(within(closedScoreboard).getByText('До обновления')).toBeInTheDocument();
    expect(within(closedScoreboard).queryByText('Период')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ждём следующий день/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/\d{2}:\d{2}:\d{2}/).length).toBeGreaterThan(0);
    expect(await findArenaCta('Ежедневная игра: Завершена')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Статистика' })).not.toBeInTheDocument();
  });

  it('shows empty previous-game stats state before the first completed game', async () => {
    renderWith();

    expect(
      await screen.findByRole('article', { name: 'Ежедневная игра: 1-й период доступен' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Статистика' })).not.toBeInTheDocument();
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

    const trainingHeading = await screen.findByRole('heading', { name: 'Тренировка' });
    expect(trainingHeading.closest('main')).toHaveClass('mode-shell', 'mode-shell--section-hub');
    expect(screen.getByRole('button', { name: 'Назад' })).toHaveClass(
      'icon-btn',
      'catalog-header-back',
    );
    expect(await screen.findByRole('button', { name: 'На лёд' })).toBeInTheDocument();
    expect(screen.getByText('0/500')).toBeInTheDocument();
    expect(screen.getByText('ДО ОБНОВЛЕНИЯ')).toBeInTheDocument();
    expect(screen.getByText('Скорости 1-го периода')).toBeInTheDocument();
    expect(screen.getByText('0,50/с')).toBeInTheDocument();

    const trainingInfo = screen.getByRole('region', { name: 'Информация о тренировке' });
    expect(trainingInfo).toHaveClass('mode-info-card', 'training-info-card');
    expect(within(trainingInfo).getByRole('img', { name: 'Тренировка' })).toHaveAttribute(
      'src',
      '/modes/beginner.webp',
    );
    expect(within(trainingInfo).getByText('0/500')).toBeInTheDocument();
    expect(within(trainingInfo).getByText(/Выбери модель периода/)).toBeInTheDocument();

    const trainingSetup = screen.getByRole('region', { name: 'Настройка тренировки' });
    expect(trainingSetup).toHaveClass('mode-setup-card', 'training-config-card');
    expect(within(trainingSetup).getByRole('tab', { name: '1 период' })).toBeInTheDocument();
    expect(within(trainingSetup).getByRole('button', { name: 'На лёд' })).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole('button', { name: 'Выбрать Тренировка' }));
    const trainingCard = await findArenaCta('Тренировка: Тренировка');
    expect(screen.getByText('Закрыта до завершения игры')).toBeInTheDocument();
    fireEvent.click(trainingCard);

    expect(await screen.findByRole('button', { name: 'ЛЁД ГОТОВИТСЯ' })).toBeDisabled();
    expect(screen.getByText('Игра уже начата')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Тренировка закрыта' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Тренировка', level: 1 })).not.toBeInTheDocument();
  });

  it('blocks active training shots when the daily game has started', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingActiveState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ...baseState,
          state: 'period_active',
          current_period: 1,
          current_period_shots: 1,
          daily_seed: 'seed-abc',
          period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    renderWith(['/?view=training&play=1']);

    expect(await screen.findByRole('button', { name: 'ЛЁД ГОТОВИТСЯ' })).toBeDisabled();
    expect(screen.getByText('Игра уже начата')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
  });

  it('keeps multi-period rink metrics in one compact four-column row', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
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

    renderWith(['/?view=training&play=1']);

    const scoreboard = await screen.findByLabelText('Игровое табло');
    expect(screen.getByTestId('scoreboard-row-summary')).toHaveStyle({
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    });
    expect(within(scoreboard).getByText('ПЕРИОД')).toBeInTheDocument();
    expect(within(scoreboard).getByText('2/3')).toBeInTheDocument();
    expect(within(scoreboard).getByText('БРОСКИ')).toBeInTheDocument();
    expect(within(scoreboard).getByText('12/500')).toBeInTheDocument();
  });

  it('keeps the courtyard for amateur training', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingActiveState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ...baseState,
          lifetime_total_goals: 300,
          amateur_unlock_goals_required: 300,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    renderWith(['/?view=training&play=1']);

    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
    expect(document.querySelector('img[src="/sprites/training-court.webp"]')).toBeTruthy();
    expect(document.querySelector('img[src="/sprites/amateur-daily-court.webp"]')).toBeFalsy();
  });

  it('groups period, score, shots and time in one row on a one-period duel scoreboard', async () => {
    const now = Date.now();
    const expressMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      server_now: new Date(now).toISOString(),
      period_started_at: new Date(now - 15_000).toISOString(),
      period_ends_at: new Date(now + 165_000).toISOString(),
      me: {
        ...settledDuelMatch.me,
        state: 'period_active',
        current_period: 1,
        shots_taken: 7,
        goals: 4,
        current_period_shots: 7,
        current_period_goals: 4,
        period_started_at: new Date(now - 15_000).toISOString(),
        period_ends_at: new Date(now + 165_000).toISOString(),
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'accepted',
        current_period: 0,
        shots_taken: 0,
        goals: 0,
        current_period_shots: 0,
        current_period_goals: 0,
      },
      current_period_shots: 7,
      current_period_goals: 4,
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
        return new Response(JSON.stringify({ match: expressMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&match=match-1&play=1']);

    const scoreboard = await screen.findByLabelText('Игровое табло');
    expect(screen.getByTestId('scoreboard-row-summary')).toHaveStyle({
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    });
    expect(within(scoreboard).getByText('ПЕРИОД')).toBeInTheDocument();
    expect(within(scoreboard).getByText('1/1')).toBeInTheDocument();
    expect(within(scoreboard).getByText('СЧЁТ')).toBeInTheDocument();
    expect(within(scoreboard).getByText('4:0')).toBeInTheDocument();
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
    expect(screen.getByText('Нужно восстановиться')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Нужно восстановиться' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
  });

  it('switches an active training session to the selected period before opening the rink', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    let resolveSwitch!: (response: Response) => void;
    const switchResponse = new Promise<Response>((resolve) => {
      resolveSwitch = resolve;
    });
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
        return switchResponse;
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
    const switchRequest = await waitFor(() =>
      fetchMock.mock.calls.find((call) => String(call[0]).includes('/duel/training/start')),
    );
    expect(switchRequest).toBeDefined();
    expect(JSON.parse(String((switchRequest?.[1] as RequestInit | undefined)?.body))).toEqual({
      period_number: 3,
    });
    expect(screen.getByRole('tab', { name: '1 период' })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: '1 период' }));
    expect(screen.getByRole('tab', { name: '3 период' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();

    resolveSwitch(
      new Response(
        JSON.stringify({
          ...trainingActiveState,
          selected_period: 3,
          shots_taken: 21,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
    expect(useTrainingSessionStore.getState().data?.selected_period).toBe(3);
    expect(screen.getByText('21/500')).toBeInTheDocument();
    expect(screen.getByText('ЛИМИТ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Звук в разработке' }));
    expect(screen.getByRole('status')).toHaveTextContent('Звук в разработке');
    expect(
      screen.queryByRole('group', { name: 'Дизайн тренировочной площадки' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('pixi-stage-stub')).toBeInTheDocument();
  });

  it('opens idle training from the arena and starts it from the rink start button', async () => {
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

    renderWith(['/?view=arena']);
    fireEvent.click(await screen.findByLabelText('Выбрать Тренировка'));
    const rinkButton = await findArenaCta('Тренировка: Тренировка');
    fireEvent.click(rinkButton);

    expect(screen.queryByText('ЧАСТОТА')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'НАЧАТЬ' })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/duel/training/start')),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'НАЧАТЬ' }));
    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
    await waitFor(() => {
      const startCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes('/duel/training/start'),
      );
      expect(startCall?.[1]?.body).toBe(JSON.stringify({ period_number: 1 }));
    });
  });

  it('lets admins override daily period speeds from the second training debug control', async () => {
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
        return new Response(
          JSON.stringify({
            ...trainingActiveState,
            period_speed_presets: trainingActiveState.period_speed_presets.map((preset) =>
              preset.periodNumber === 2 ? { ...preset, shooterFrequency: 1.35 } : preset,
            ),
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
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
    expect(document.querySelector('img[src="/sprites/training-court.webp"]')).toBeTruthy();
    expect(screen.getByLabelText('Игровое табло')).toBeInTheDocument();
    expect(document.querySelector('img[src="/sprites/street-tableau.webp"]')).toBeFalsy();
    const hitboxesToggle = screen.getByRole('checkbox', { name: 'Хитбоксы' });
    expect(hitboxesToggle).not.toBeChecked();
    fireEvent.click(hitboxesToggle);
    expect(hitboxesToggle).toBeChecked();
    expect(localStorage.getItem('hockey.trainingHitboxesVisible')).toBe('true');

    const speedControl = screen.getByRole('button', { name: 'Скорости' });
    expect(speedControl).toHaveStyle({ background: 'rgba(255, 255, 255, 0.82)' });
    fireEvent.click(speedControl);
    const dialog = await screen.findByRole('dialog', { name: 'Скорости тренировки' });
    const sliders = within(dialog).getAllByRole('slider');
    expect(sliders).toHaveLength(4);
    expect(sliders[0]).toHaveValue('1.35');

    fireEvent.change(sliders[0]!, { target: { value: '1.1' } });
    expect(sliders[0]).toHaveValue('1.1');
    expect(localStorage.getItem('hockey.trainingSpeedOverrides')).toContain('"shooterFreq":1.1');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Сбросить' }));
    expect(localStorage.getItem('hockey.trainingSpeedOverrides')).toBeNull();
    expect(sliders[0]).toHaveValue('1.35');
  });

  it('shows both training debug controls to ordinary players on dev hosts', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'token',
      refreshToken: 'r',
      user: { id: 'u3', displayName: 'Regular dev player', role: 'player' },
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
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=training']);
    fireEvent.click(await screen.findByRole('button', { name: /Продолжить тренировку/ }));

    expect(await screen.findByRole('checkbox', { name: 'Хитбоксы' })).toBeInTheDocument();
    const speedControl = screen.getByRole('button', { name: 'Скорости' });
    fireEvent.click(speedControl);
    const dialog = await screen.findByRole('dialog', { name: 'Скорости тренировки' });
    expect(within(dialog).getAllByRole('slider')).toHaveLength(4);
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

  it('opens an amateur chooser with duels, bonus games and tournaments', async () => {
    const bonusGame = (id: string, isCompleted: boolean): BonusGameCard => ({
      id,
      slug: id,
      title: `Игра ${id}`,
      skill_code: id === 'speed' ? 'speed' : 'accuracy',
      description: '',
      sort_order: 1,
      access_type: 'free',
      unlock_price_stars: 0,
      target_goals: 20,
      qualification_rules: { type: 'goals_from_shots', targetGoals: 20, shotsLimit: 30 },
      total_periods: 1,
      break_duration_ms: 0,
      use_inventory: false,
      preview_title: `Игра ${id}`,
      preview_story: '',
      preview_artwork_url: '/bonus-games/arenas/test.webp',
      preview_revision: 1,
      period_rules: [],
      reward: { coins: 0, stars: 0, experience: 0 },
      goalkeeper_ready_url: '/bonus-games/goalkeepers/ready.webp',
      goalkeeper_save_url: '/bonus-games/goalkeepers/save.webp',
      arena: {
        id: 'arena-test',
        slug: 'test',
        title: 'Тестовая площадка',
        artwork_url: '/bonus-games/arenas/test.webp',
        thumbnail_url: '/bonus-games/arenas/test.webp',
      },
      prerequisite: null,
      is_unlocked: true,
      is_completed: isCompleted,
      state: isCompleted ? 'completed' : 'available',
      active_attempt: null,
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/bonus-games')) {
        return new Response(
          JSON.stringify({
            games: [
              bonusGame('speed', true),
              bonusGame('accuracy', true),
              bonusGame('final', false),
            ],
            active_attempt: null,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      if (url.includes('/tournaments')) {
        return new Response(JSON.stringify({ error: { message: 'feature disabled' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches')) {
        return new Response(JSON.stringify({ matches: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur']);

    expect(await screen.findByRole('heading', { name: 'Любители' })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
        .filter(Boolean),
    ).toEqual(['Назад', 'Дуэли', 'Бонусные игры', 'Турниры']);
    ['Дуэли', 'Бонусные игры', 'Турниры'].forEach((name) => {
      expect(screen.getByRole('button', { name }).querySelector('svg')).toHaveClass('card-chevron');
    });
    expect(await screen.findByText('2/3 пройдено')).toBeInTheDocument();
  });

  it('uses the catalog-width shell and standard header controls for the amateur chooser', async () => {
    renderWith(['/?view=amateur&from=sections']);

    const heading = await screen.findByRole('heading', { name: 'Любители' });
    const shell = heading.closest('main');
    expect(shell).toHaveClass('mode-shell', 'mode-shell--section-hub');
    expect(screen.getByRole('button', { name: 'Назад' })).toHaveClass(
      'icon-btn',
      'icon-btn--page-back',
    );
    screen.getAllByRole('button', { name: /Дуэли|Бонусные игры|Турниры/ }).forEach((card) => {
      expect(card).toHaveClass('amateur-hub-card');
      expect(card.parentElement).toHaveClass('amateur-hub-grid');
    });
  });

  it('keeps legacy amateur section routes inside the Sections back stack', async () => {
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
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    function LocationProbe() {
      const current = useLocation();
      return <output aria-label="Текущий адрес">{`${current.pathname}${current.search}`}</output>;
    }

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/?view=amateur&section=duels']}>
          <DailyScreen />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Назад' }));
    expect(await screen.findByRole('heading', { name: 'Любители' })).toBeInTheDocument();
    expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent(
      '/?view=amateur&from=sections',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent('/sections');
  });

  it('opens a direct amateur route without flashing the daily arena first', () => {
    // Break caught: route-derived state must be correct on the first render, before effects run.
    expect(initialGameRouteState('?view=amateur&section=duels&from=sections')).toMatchObject({
      selectedLevel: 'amateur',
      amateurView: 'duels',
      beginnerMode: 'daily',
      dailyView: 'arena',
      activeAmateurMatchId: null,
    });
    expect(initialGameRouteState('?view=amateur&from=sections')).toMatchObject({
      selectedLevel: 'amateur',
      amateurView: 'hub',
    });
  });

  it('keeps direct amateur routes focused on their selected section', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/tournaments')) {
        return new Response(JSON.stringify({ tournaments: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/')) {
        return new Response(JSON.stringify({ matches: [], templates: [], ratings: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const tournamentRoute = renderWith(['/?view=amateur&section=tournaments']);
    const tournamentHeading = await screen.findByRole('heading', { name: 'Турниры' });
    expect(tournamentHeading.closest('main')).toHaveClass('mode-shell', 'mode-shell--section-hub');
    expect(screen.queryByRole('tablist', { name: 'Разделы любителей' })).not.toBeInTheDocument();
    tournamentRoute.unmount();

    renderWith(['/?view=amateur&section=duels']);
    const duelsHeading = await screen.findByRole('heading', { name: 'Дуэли' });
    expect(duelsHeading.closest('main')).toHaveClass('mode-shell', 'mode-shell--section-hub');
    expect(screen.queryByRole('tablist', { name: 'Разделы любителей' })).not.toBeInTheDocument();
  });

  it('shows one readable development message on the professional page', async () => {
    renderWith(['/?view=pro&from=sections']);

    expect(await screen.findByRole('heading', { name: 'Профессионалы' })).toBeInTheDocument();
    expect(screen.getAllByText('Раздел в разработке')).toHaveLength(1);
    expect(screen.queryByText('Профессиональный раздел в разработке.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'В разработке' })).not.toBeInTheDocument();
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
    expect(await screen.findByRole('img', { name: 'Duel Opponent' })).toHaveAttribute(
      'src',
      '/avatars/opponent.webp',
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть профиль Duel Opponent' }));

    expect(await screen.findByTestId('profile-sheet-backdrop')).toBeInTheDocument();
    expect(await screen.findByText('Любитель')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /написать в личку/i })).toBeInTheDocument();
  });

  it('shows only played duels in history stats and list', async () => {
    const expiredMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      id: 'match-expired',
      status: 'expired',
      starts_at: '2026-05-16T11:00:00.000Z',
      winner_user_id: null,
      outcome: null,
      settled_reason: 'not_accepted',
      settled_at: '2026-05-16T11:15:00.000Z',
      me: {
        ...settledDuelMatch.me,
        state: 'invited',
        shots_taken: 0,
        goals: 0,
        result_points: 0,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        display_name: 'No Show',
        state: 'invited',
        shots_taken: 0,
        goals: 0,
        result_points: 0,
      },
    };
    const cancelledMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      id: 'match-cancelled',
      status: 'cancelled',
      starts_at: '2026-05-16T12:00:00.000Z',
      winner_user_id: null,
      outcome: null,
      settled_reason: 'cancelled_by_challenger',
      settled_at: '2026-05-16T12:02:00.000Z',
      me: {
        ...settledDuelMatch.me,
        shots_taken: 0,
        goals: 0,
        result_points: 0,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        display_name: 'Cancelled Player',
        shots_taken: 0,
        goals: 0,
        result_points: 0,
      },
    };
    const previousMonthMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      id: 'match-previous-month',
      season_key: '2026-04',
      starts_at: '2026-04-12T12:00:00.000Z',
      winner_user_id: 'u2',
      outcome: 'opponent_win',
      me: {
        ...settledDuelMatch.me,
        result_points: 0,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        display_name: 'April Opponent',
        result_points: 3,
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
      if (url.includes('/duel/amateur/templates')) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/history/calendar')) {
        const requestedMonth = new URL(url, 'http://localhost').searchParams.get('month_key');
        if (requestedMonth === '2026-04') {
          return new Response(
            JSON.stringify({
              month_key: '2026-04',
              timezone: 'Europe/Moscow',
              available_months: ['2026-05', '2026-04'],
              range: { from: '2026-04', to: '2026-05' },
              stats: { played: 2, wins: 1, draws: 0, losses: 1, win_percentage: 50 },
              days: [
                {
                  day: 12,
                  matches: [
                    {
                      id: previousMonthMatch.id,
                      settled_at: previousMonthMatch.settled_at,
                      opponent: { user_id: 'u2', display_name: 'April Opponent', avatar_url: null },
                      duel_kind: 'classic',
                      my_goals: 1,
                      opponent_goals: 2,
                      result: 'loss',
                    },
                  ],
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            month_key: '2026-05',
            timezone: 'Europe/Moscow',
            available_months: ['2026-05', '2026-04'],
            range: { from: '2026-04', to: '2026-05' },
            stats: { played: 2, wins: 1, draws: 0, losses: 1, win_percentage: 50 },
            days: [
              {
                day: 16,
                matches: [
                  {
                    id: 'calendar-loss-1',
                    settled_at: '2026-05-16T08:00:00.000Z',
                    opponent: { user_id: 'u3', display_name: 'First Opponent', avatar_url: null },
                    duel_kind: 'express',
                    my_goals: 1,
                    opponent_goals: 2,
                    result: 'loss',
                  },
                  {
                    id: settledDuelMatch.id,
                    settled_at: settledDuelMatch.settled_at,
                    opponent: { user_id: 'u2', display_name: 'Duel Opponent', avatar_url: null },
                    duel_kind: 'classic',
                    my_goals: 3,
                    opponent_goals: 1,
                    result: 'win',
                    venue_role: 'home',
                  },
                  {
                    id: 'calendar-loss-2',
                    settled_at: '2026-05-16T10:00:00.000Z',
                    opponent: { user_id: 'u4', display_name: 'Third Opponent', avatar_url: null },
                    duel_kind: 'express_plus',
                    my_goals: 0,
                    opponent_goals: 1,
                    result: 'loss',
                  },
                  {
                    id: 'calendar-win-2',
                    settled_at: '2026-05-16T11:00:00.000Z',
                    opponent: { user_id: 'u5', display_name: 'Fourth Opponent', avatar_url: null },
                    duel_kind: 'express',
                    my_goals: 2,
                    opponent_goals: 0,
                    result: 'win',
                  },
                  {
                    id: 'calendar-win-3',
                    settled_at: '2026-05-16T12:00:00.000Z',
                    opponent: { user_id: 'u6', display_name: 'Fifth Opponent', avatar_url: null },
                    duel_kind: 'classic',
                    my_goals: 4,
                    opponent_goals: 2,
                    result: 'win',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes(`/duel/amateur/matches/${settledDuelMatch.id}`)) {
        return new Response(JSON.stringify({ match: settledDuelMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches')) {
        return new Response(
          JSON.stringify({ matches: [settledDuelMatch, expiredMatch, cancelledMatch] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
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

    fireEvent.click(await screen.findByRole('tab', { name: 'История' }));

    const historyHeading = within(await screen.findByLabelText('История дуэлей')).getByText(
      'История',
    );
    expect(historyHeading).toHaveClass('section-label', 'duel-section-title');
    const lifetimeSummary = screen.getByLabelText('За всё время');
    const calendar = await screen.findByLabelText('Календарь дуэлей: Май 2026');
    const monthSummary = screen.getByLabelText('Статистика за май');
    expect(lifetimeSummary).toHaveClass('glass', 'duel-history-summary');
    expect(monthSummary).toHaveClass('glass', 'duel-history-summary');
    expect(calendar).toHaveClass('daily-calendar');
    expect(lifetimeSummary.nextElementSibling).toBe(monthSummary);
    expect(monthSummary.nextElementSibling).toBe(calendar);
    expect(within(monthSummary).getByText('60% побед')).toBeInTheDocument();
    const playedDay = screen.getByRole('button', { name: '16, сыграно дуэлей: 5' });
    expect(playedDay).toHaveClass('daily-calendar__day--duel');
    expect(within(playedDay).getByLabelText('Количество дуэлей: 5')).toHaveTextContent('5');
    expect(
      Array.from(playedDay.querySelectorAll('.daily-calendar__duel-result')).map((dot) =>
        dot.className.split(' ').at(-1),
      ),
    ).toEqual([
      'daily-calendar__duel-result--loss',
      'daily-calendar__duel-result--win',
      'daily-calendar__duel-result--loss',
      'daily-calendar__duel-result--win',
      'daily-calendar__duel-result--win',
    ]);
    expect(screen.getByText('Игровой день')).toBeInTheDocument();
    expect(screen.getByText('Победа')).toBeInTheDocument();
    expect(screen.getByText('Поражение')).toBeInTheDocument();
    expect(screen.getByText('Ничья')).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Месяц календаря дуэлей' }),
    ).not.toBeInTheDocument();

    fireEvent.click(playedDay);
    const dayDialog = await screen.findByRole('dialog', { name: 'Дуэли за 16 мая' });
    expect(dayDialog).toBeInTheDocument();
    const dayList = dayDialog.querySelector<HTMLElement>('.duel-day-list');
    expect(dayList).not.toBeNull();
    Object.defineProperties(dayList!, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    fireEvent(window, new Event('resize'));
    await waitFor(() => {
      expect(dayDialog.querySelector('.duel-day-scroll-hint')).toBeInTheDocument();
    });
    dayList!.scrollTop = 200;
    fireEvent.scroll(dayList!);
    await waitFor(() => {
      expect(dayDialog.querySelector('.duel-day-scroll-hint')).not.toBeInTheDocument();
    });
    expect(within(dayDialog).getAllByRole('button', { name: 'Закрыть' })).toHaveLength(2);
    expect(await screen.findByText('Duel Opponent')).toBeInTheDocument();
    expect(screen.getByText('Классика · 3:1 · Дома')).toBeInTheDocument();
    expect(screen.getByText('50% побед')).toBeInTheDocument();
    expect(screen.queryByText('No Show')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancelled Player')).not.toBeInTheDocument();
    expect(screen.queryByText('Ответа не было')).not.toBeInTheDocument();
    expect(screen.queryByText('Вы отменили вызов')).not.toBeInTheDocument();

    const duelRow = within(dayDialog).getByRole('button', {
      name: 'Дуэль с Duel Opponent, Классика, счёт 3:1, Дома, Победа',
    });
    expect(duelRow).toHaveAttribute('aria-expanded', 'false');
    expect(duelRow.querySelector('.duel-day-match__chevron')).toHaveClass('lucide-chevron-right');
    fireEvent.click(duelRow);
    expect(duelRow).toHaveAttribute('aria-expanded', 'true');
    const expandedDetails = await within(dayDialog).findByLabelText(
      'Подробности дуэли с Duel Opponent',
    );
    expect(expandedDetails).toBeInTheDocument();
    expect(within(expandedDetails).queryByText('Результат')).not.toBeInTheDocument();
    expect(within(expandedDetails).queryByText('Ничья')).not.toBeInTheDocument();
    const totalResultHeading = within(expandedDetails).getByText('Итоговый результат');
    expect(totalResultHeading).toHaveClass('section-label');
    const totalResultTable = within(expandedDetails).getByRole('table', {
      name: 'Итоговый результат',
    });
    expect(within(totalResultTable).getByRole('row', { name: 'Вы 3 12 25% 03:00' })).toBeVisible();
    expect(
      within(totalResultTable).getByRole('row', { name: 'Duel Opponent 1 10 10% 03:00' }),
    ).toBeVisible();
    expect(within(expandedDetails).queryByLabelText(/^Общие итоги:/)).not.toBeInTheDocument();
    expect(within(expandedDetails).queryByText('Тип')).not.toBeInTheDocument();
    expect(within(expandedDetails).queryByText('Соперник')).not.toBeInTheDocument();
    expect(within(expandedDetails).getByText('Очки')).toBeInTheDocument();
    expect(within(expandedDetails).getByText('Начало')).toBeInTheDocument();
    expect(within(expandedDetails).queryByText('Периоды')).not.toBeInTheDocument();
    expect(
      within(expandedDetails).queryByRole('table', { name: '1-й период' }),
    ).not.toBeInTheDocument();
    expect(expandedDetails.querySelector('.duel-result-card__compact-metric')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Результат дуэли' })).not.toBeInTheDocument();
    fireEvent.click(duelRow);
    expect(duelRow).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(dayDialog).queryByLabelText('Подробности дуэли с Duel Opponent'),
    ).not.toBeInTheDocument();
    fireEvent.click(duelRow);
    const otherDuelRow = within(dayDialog).getByRole('button', {
      name: /^Дуэль с First Opponent/,
    });
    fireEvent.click(otherDuelRow);
    expect(duelRow).toHaveAttribute('aria-expanded', 'false');
    expect(otherDuelRow).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(dayDialog).queryByLabelText('Подробности дуэли с Duel Opponent'),
    ).not.toBeInTheDocument();

    fireEvent.click(within(dayDialog).getAllByRole('button', { name: 'Закрыть' }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий месяц' }));
    expect(await screen.findByRole('heading', { name: 'Апрель 2026' })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: '12, сыграно дуэлей: 1' }));
    expect(await screen.findByText('April Opponent')).toBeInTheDocument();
  });

  it('shows total and per-period inventory usage in duel history result', async () => {
    const inventoryMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      id: 'match-inventory',
      duel_kind: 'classic',
      starts_at: '2026-05-17T10:00:00.000Z',
      opponent: {
        ...settledDuelMatch.opponent,
        display_name: 'Inventory Opponent',
      },
      rules: {
        ...settledDuelMatch.rules,
        title: 'Классика',
        duelKind: 'classic',
        totalPeriods: 2,
        periodRules: [
          { periodNumber: 1, mode: 'quota', durationMs: 300000, shotsLimit: 30 },
          { periodNumber: 2, mode: 'quota', durationMs: 300000, shotsLimit: 30 },
        ],
      },
      me: {
        ...settledDuelMatch.me,
        inventory_report: [
          {
            periodNumber: 1,
            consumed: [
              {
                id: 'stick-1',
                kind: 'stick',
                title: 'Клюшка тест',
                charges: 12,
                remainingReserved: 2388,
              },
              {
                id: 'skates-1',
                kind: 'skates',
                title: 'Коньки тест',
                charges: 3.8,
                remainingReserved: 46.2,
              },
              {
                id: 'nutrition-1',
                kind: 'nutrition',
                title: 'Питание тест',
                charges: 45000,
                remainingReserved: 15000,
              },
            ],
          },
          {
            periodNumber: 2,
            consumed: [
              {
                id: 'stick-1',
                kind: 'stick',
                title: 'Клюшка тест',
                charges: 9,
                remainingReserved: 2379,
              },
              {
                id: 'skates-1',
                kind: 'skates',
                title: 'Коньки тест',
                charges: 2.2,
                remainingReserved: 44,
              },
              {
                id: 'nutrition-1',
                kind: 'nutrition',
                title: 'Питание тест',
                charges: 30000,
                remainingReserved: 0,
              },
            ],
          },
        ],
      },
      recent_periods: [
        {
          period_number: 1,
          shots_taken: 30,
          goals: 10,
          duration_ms: 150000,
          closed_reason: 'quota',
          ended_at: '2026-05-17T10:02:30.000Z',
        },
        {
          period_number: 2,
          shots_taken: 30,
          goals: 8,
          duration_ms: 160000,
          closed_reason: 'quota',
          ended_at: '2026-05-17T10:08:10.000Z',
        },
      ],
      opponent_recent_periods: [
        {
          period_number: 1,
          shots_taken: 30,
          goals: 7,
          duration_ms: 160000,
          closed_reason: 'quota',
          ended_at: '2026-05-17T10:02:40.000Z',
        },
        {
          period_number: 2,
          shots_taken: 30,
          goals: 9,
          duration_ms: 170000,
          closed_reason: 'quota',
          ended_at: '2026-05-17T10:08:30.000Z',
        },
      ],
    };

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
      if (url.includes('/duel/amateur/history/calendar')) {
        return new Response(
          JSON.stringify({
            month_key: '2026-05',
            timezone: 'Europe/Moscow',
            available_months: ['2026-05'],
            range: { from: '2026-05', to: '2026-05' },
            stats: { played: 1, wins: 1, draws: 0, losses: 0, win_percentage: 100 },
            days: [
              {
                day: 17,
                matches: [
                  {
                    id: inventoryMatch.id,
                    settled_at: inventoryMatch.settled_at,
                    opponent: {
                      user_id: 'u2',
                      display_name: 'Inventory Opponent',
                      avatar_url: null,
                    },
                    duel_kind: 'classic',
                    my_goals: 18,
                    opponent_goals: 16,
                    result: 'win',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/duel/amateur/matches/match-inventory')) {
        return new Response(JSON.stringify({ match: inventoryMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches')) {
        return new Response(JSON.stringify({ matches: [inventoryMatch] }), {
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

    fireEvent.click(await screen.findByRole('tab', { name: 'История' }));
    fireEvent.click(await screen.findByRole('button', { name: '17, сыграно дуэлей: 1' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Дуэль с Inventory Opponent, Классика, счёт 18:16, Нейтральное поле, Победа',
      }),
    );

    const totalUsage = await screen.findByLabelText('Общий расход инвентаря');
    expect(within(totalUsage).getByText('Расход инвентаря')).toHaveClass('section-label');
    expect(within(totalUsage).getByText('Клюшка тест')).toBeInTheDocument();
    expect(within(totalUsage).getByText('21 бросок')).toBeInTheDocument();
    expect(within(totalUsage).getByText('Коньки тест')).toBeInTheDocument();
    expect(within(totalUsage).getByText('6 прокатов')).toBeInTheDocument();
    expect(within(totalUsage).getByText('Питание тест')).toBeInTheDocument();
    expect(within(totalUsage).getByText('2 минуты энергии')).toBeInTheDocument();

    const expandedDetails = screen.getByLabelText('Подробности дуэли с Inventory Opponent');
    const firstPeriodToggle = within(expandedDetails).getByRole('button', {
      name: /1-й период/,
    });
    const secondPeriodToggle = within(expandedDetails).getByRole('button', {
      name: /2-й период/,
    });
    expect(firstPeriodToggle).toHaveAttribute('aria-expanded', 'false');
    expect(secondPeriodToggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(expandedDetails).queryByLabelText('2-й период: расход инвентаря'),
    ).not.toBeInTheDocument();

    fireEvent.click(secondPeriodToggle);

    const secondPeriodUsage = within(expandedDetails).getByLabelText(
      '2-й период: расход инвентаря',
    );
    expect(within(secondPeriodUsage).getByText('Расход за период')).toHaveClass('section-label');
    expect(within(secondPeriodUsage).getByText('9 бросков')).toBeInTheDocument();
    expect(within(secondPeriodUsage).getByText('2 проката')).toBeInTheDocument();
    expect(within(secondPeriodUsage).getByText('30 секунд энергии')).toBeInTheDocument();
  });

  it('orders duel game sections and hides empty invitation groups', async () => {
    const currentMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      id: 'current-match',
      status: 'active',
      settled_at: null,
      settled_reason: null,
      outcome: null,
      winner_user_id: null,
      me: { ...settledDuelMatch.me, state: 'accepted' },
      opponent: { ...settledDuelMatch.opponent, state: 'accepted' },
    };
    const outgoing: AmateurDuelMatchState = {
      ...currentMatch,
      id: 'outgoing-match',
      status: 'invited',
      me: { ...currentMatch.me, side: 'challenger', state: 'loadout_pending' },
      opponent: { ...currentMatch.opponent, side: 'opponent', state: 'invited' },
    };
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
        return new Response(JSON.stringify({ matches: [currentMatch, outgoing] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/rating')) {
        return new Response(
          JSON.stringify({
            season_key: '2026-05',
            rating_visible: true,
            available_seasons: ['2026-05'],
            rating: [],
            me_rank: null,
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

    const current = await screen.findByRole('region', { name: 'Текущие дуэли' });
    const outgoingRegion = await screen.findByRole('region', { name: 'Отправленные вызовы' });
    const creation = screen.getByRole('region', { name: 'Новая дуэль' });
    expect(
      current.compareDocumentPosition(outgoingRegion) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      outgoingRegion.compareDocumentPosition(creation) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Входящие приглашения' })).not.toBeInTheDocument();
    expect(within(creation).queryByText('Новая дуэль')).not.toBeInTheDocument();
    expect(screen.getByText('Текущие дуэли (2/5)')).toHaveClass(
      'section-label',
      'duel-section-title',
    );
    expect(screen.getByText('Новая дуэль')).toHaveClass('section-label', 'duel-section-title');
  });

  it('renders plain duel metadata and muted invite actions', async () => {
    const currentMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      id: 'current-layout-match',
      status: 'active',
      settled_at: null,
      settled_reason: null,
      outcome: null,
      winner_user_id: null,
      me: { ...settledDuelMatch.me, state: 'accepted' },
      opponent: {
        ...settledDuelMatch.opponent,
        display_name: 'Александр Очень-Длинная-Фамилия',
        state: 'accepted',
      },
    };
    const incomingMatch: AmateurDuelMatchState = {
      ...currentMatch,
      id: 'incoming-layout-match',
      status: 'invited',
      me: { ...currentMatch.me, side: 'opponent', state: 'invited' },
      opponent: {
        ...currentMatch.opponent,
        display_name: 'Мария Север',
        side: 'challenger',
        state: 'loadout_pending',
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
      if (url.includes('/duel/amateur/templates')) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches')) {
        return new Response(JSON.stringify({ matches: [currentMatch, incomingMatch] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/rating')) {
        return new Response(
          JSON.stringify({
            season_key: '2026-05',
            rating_visible: true,
            available_seasons: ['2026-05'],
            rating: [],
            me_rank: null,
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

    const currentRegion = await screen.findByRole('region', { name: 'Текущие дуэли' });
    const currentStatus = await within(currentRegion).findByLabelText('Статус: Ваш ход');
    expect(currentStatus).toHaveClass('duel-card-status');
    expect(currentStatus.parentElement).toHaveClass('duel-card-heading');
    expect(currentStatus.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();

    const incomingRegion = await screen.findByRole('region', { name: 'Входящие приглашения' });
    const incomingStatus = within(incomingRegion).getByLabelText('Статус: Вас вызвали');
    expect(incomingStatus).toHaveClass('duel-card-status');
    expect(incomingStatus.parentElement).toHaveClass('duel-card-heading');
    const venue = within(incomingRegion).getByLabelText('Площадка: Нейтральное поле');
    expect(venue).toHaveClass('duel-card-venue');
    expect(venue).not.toHaveClass('venue-badge');
    expect(within(incomingRegion).getByRole('button', { name: 'Отклонить' })).toHaveClass(
      'duel-invite-action--decline',
    );
    expect(within(incomingRegion).getByRole('button', { name: 'Принять' })).toHaveClass(
      'duel-invite-action--accept',
    );
  });

  it('uses compact shared section headings in the locker and challenge form', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/inventory/me')) {
        return new Response(
          JSON.stringify({
            balances: { tokens: 0, stars: 0, experience: 0 },
            equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
            items: { stick: [], skates: [], nutrition: [] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/templates')) {
        return new Response(JSON.stringify({ templates: challengeTemplates }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/opponents')) {
        return new Response(JSON.stringify({ users: [] }), {
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
            rating_visible: true,
            available_seasons: ['2026-05'],
            rating: [],
            me_rank: null,
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
    fireEvent.click(await screen.findByRole('tab', { name: 'Раздевалка' }));

    expect(screen.queryByText('Доступный инвентарь')).not.toBeInTheDocument();
    const infoButton = screen.getByRole('button', { name: 'Что такое раздевалка' });
    expect(infoButton).toHaveClass('duel-section-info-btn');
    expect(infoButton.querySelector('svg')).toHaveAttribute('stroke', 'rgba(240, 248, 255, 0.92)');
    const lockerSlots = [
      screen.getByRole('button', { name: /^Коньки:/ }),
      screen.getByRole('button', { name: /^Клюшка:/ }),
      screen.getByRole('button', { name: /^Питание:/ }),
    ];
    const lockerKindHeadings = ['Коньки', 'Клюшка', 'Питание'].map((title) =>
      screen.getByText(title, { selector: '.duel-locker-kind-section__title' }),
    );
    expect(lockerKindHeadings).toHaveLength(3);
    lockerKindHeadings.forEach((title, index) => {
      expect(title).toHaveClass('duel-section-title');
      expect(title.parentElement).toHaveClass('duel-locker-kind-section');
      expect(title.parentElement).toContainElement(lockerSlots[index]!);
    });
    expect(lockerKindHeadings[0]).toHaveClass('duel-section-title--with-action');
    expect(lockerKindHeadings[0]).toContainElement(infoButton);
    for (const slot of lockerSlots) {
      expect(slot).toHaveClass('duel-locker-slot');
      expect(slot.querySelector('.card-chevron')).toBeInTheDocument();
      expect(slot.querySelector('.duel-locker-slot__copy')).toHaveClass('amateur-hub-card__copy');
    }
    expect(lockerSlots[0]).toHaveAccessibleName('Коньки: Обычные коньки. Базовый вариант');
    expect(lockerSlots[1]).toHaveAccessibleName('Клюшка: Обычная клюшка. Базовый вариант');
    expect(lockerSlots[2]).toHaveAccessibleName('Питание: Без питания. Базовый вариант');
    expect(lockerSlots[0]?.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('/inventory/skates-base.webp'),
    );
    expect(lockerSlots[1]?.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('/inventory/stick-base.webp'),
    );
    expect(lockerSlots[2]?.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('/inventory/nutrition-none.webp'),
    );

    fireEvent.click(lockerSlots[1]!);
    const equipmentDialog = screen.getByRole('dialog', { name: 'Клюшка' });
    const baseStick = within(equipmentDialog).getByRole('button', { name: /Обычная клюшка/ });
    expect(baseStick).toHaveAttribute('aria-pressed', 'true');
    expect(baseStick).toHaveClass('duel-equipment-option', 'duel-equipment-option--selected');
    expect(
      baseStick.querySelector('.duel-equipment-option__check--selected svg'),
    ).toBeInTheDocument();
    const emptyMessage = within(equipmentDialog).getByText('Купленных клюшек пока нет');
    expect(emptyMessage).toHaveClass('duel-equipment-empty__message');
    expect(emptyMessage.parentElement).toHaveClass('duel-equipment-empty');
    expect(emptyMessage.parentElement).not.toHaveClass('glass');
    expect(within(equipmentDialog).getByRole('button', { name: 'В магазин' })).toHaveClass(
      'btn--cta',
      'duel-equipment-empty__action',
    );
    fireEvent.click(within(equipmentDialog).getByRole('button', { name: 'Закрыть' }));

    fireEvent.click(lockerSlots[0]!);
    const skatesDialog = screen.getByRole('dialog', { name: 'Коньки' });
    expect(within(skatesDialog).getByText('Выберите предмет для этого слота.')).toBeInTheDocument();
    fireEvent.click(within(skatesDialog).getByRole('button', { name: 'Закрыть' }));

    fireEvent.click(screen.getByRole('tab', { name: 'Игра' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Вызвать' }));

    const quickPickHeading = screen.getByText('Быстрый выбор').parentElement;
    const searchHeading = screen.getByText('Поиск', { selector: 'span' }).parentElement;
    expect(quickPickHeading).toHaveClass('duel-form-section-title');
    expect(searchHeading).toHaveClass('duel-form-section-title');
    expect(quickPickHeading).not.toHaveClass('section-label--page');
    expect(searchHeading).not.toHaveClass('section-label--page');

    expect(screen.getByLabelText('Быстрый выбор соперника').parentElement).toHaveClass(
      'duel-quick-pick',
    );
    expect(screen.getByText('Игроков пока не видно. Можно найти по имени.')).toHaveClass(
      'duel-quick-pick__empty',
    );

    const opponentSearch = screen.getByRole('searchbox', { name: 'Поиск соперника' });
    expect(opponentSearch).toHaveClass('duel-opponent-search__input');
    expect(opponentSearch.parentElement).toHaveClass('duel-opponent-search');

    const challengeSubmit = screen.getByRole('button', { name: 'Выберите соперника' });
    expect(challengeSubmit).toBeDisabled();
    expect(challengeSubmit).toHaveClass('duel-challenge-submit');

    const templateSelect = screen.getByRole('combobox', { name: 'Шаблон дуэли' });
    expect(templateSelect).toHaveClass('duel-template-select');
    expect(templateSelect).toHaveTextContent('Экспресс (1 период · 3 мин · на скорость)');
    expect(screen.queryByLabelText('Параметры дуэли')).not.toBeInTheDocument();
    fireEvent.click(templateSelect);
    expect(
      (await screen.findAllByRole('option')).map((option) => option.textContent?.trim()),
    ).toEqual([
      'Экспресс (1 период · 3 мин · на скорость)',
      'Микс (2 периода · 30 бросков + 3 мин на скорость)',
      'Классика (3 периода · 20 мин · 90 бросков)',
    ]);
  });

  it('hides a disabled rating tab and keeps the game tab selected', async () => {
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
            rating_visible: false,
            available_seasons: [],
            rating: [],
            me_rank: null,
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

    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: 'Рейтинг' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: 'Игра' })).toHaveAttribute('aria-selected', 'true');
    const emptyCurrentDuels = screen.getByRole('status');
    expect(emptyCurrentDuels).toHaveTextContent('Активных матчей пока нет');
    expect(emptyCurrentDuels).not.toHaveClass('glass');
    expect(emptyCurrentDuels.querySelector('svg')).toBeNull();
    expect(emptyCurrentDuels).toHaveClass('duel-empty-current');
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
    const formatInfoButton = await screen.findByRole('button', {
      name: 'Правила поиска соперника',
    });
    expect(formatInfoButton.closest('.duel-kind-picker')).toHaveClass('glass');
    expect(formatInfoButton.querySelector('svg')).toHaveClass('duel-kind-picker__info-icon');

    const duelSetup = await screen.findByRole('region', { name: 'Новая дуэль' });
    expect(duelSetup).toHaveClass('duel-creation-card');
    expect(duelSetup).not.toHaveClass('mode-setup-card');
    expect(within(duelSetup).getByRole('button', { name: 'Начать поиск' })).toBeInTheDocument();

    const express = await screen.findByRole('button', { name: 'Экспресс' });
    const expressPlus = await screen.findByRole('button', { name: 'Микс' });
    const classic = await screen.findByRole('button', { name: 'Классика' });
    expect(express).toHaveAttribute('aria-pressed', 'true');
    expect(expressPlus).toHaveAttribute('aria-pressed', 'true');
    expect(classic).toHaveAttribute('aria-pressed', 'true');
    expect(express.childElementCount).toBe(0);
    expect(express.style.background).toBe('rgba(31, 42, 61, 0.92)');

    fireEvent.click(expressPlus);
    expect(expressPlus).toHaveAttribute('aria-pressed', 'false');
    expect(expressPlus.style.background).toBe('rgba(255, 255, 255, 0.46)');

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
            match: {
              ...invitedMatch,
              status: 'cancelled',
              settled_reason: 'cancelled_by_challenger',
            },
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

  it('keeps current duel status beside truncated long opponent names', async () => {
    const invitedMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'invited',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      ready_expires_at: '2026-05-16T10:25:00.000Z',
      me: { ...settledDuelMatch.me, side: 'challenger', state: 'loadout_pending' },
      opponent: {
        ...settledDuelMatch.opponent,
        side: 'opponent',
        state: 'invited',
        display_name: 'Торквимада Очень Длинное Имя',
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
      if (url.includes('/duel/amateur/templates')) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
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

    const status = await screen.findByLabelText('Статус: Ждём ответ соперника');
    const opponentName = screen.getByText('Торквимада Очень Длинное Имя');
    expect(opponentName).toHaveStyle({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    expect(status).toHaveClass('duel-card-status');
    expect(status.parentElement).toHaveClass('duel-card-heading');
    expect(status.parentElement).toContainElement(opponentName);
  });

  it('labels an outgoing duel detail as waiting from my perspective', async () => {
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const invitedMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'invited',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: startsAt,
      ends_at: endsAt,
      ready_expires_at: endsAt,
      server_now: startsAt,
      me: { ...settledDuelMatch.me, side: 'challenger', state: 'loadout_pending' },
      opponent: { ...settledDuelMatch.opponent, side: 'opponent', state: 'invited' },
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
        return new Response(JSON.stringify({ match: invitedMatch }), {
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

    expect(await screen.findByLabelText('Статус соперника: ждём ответ')).toBeInTheDocument();
    expect(screen.queryByLabelText('Статус соперника: ждёт ответ')).not.toBeInTheDocument();
  });

  it('labels an incoming duel detail as the opponent waiting for my answer', async () => {
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const invitedMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'invited',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: startsAt,
      ends_at: endsAt,
      ready_expires_at: endsAt,
      server_now: startsAt,
      me: { ...settledDuelMatch.me, side: 'opponent', state: 'invited' },
      opponent: { ...settledDuelMatch.opponent, side: 'challenger', state: 'loadout_pending' },
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
        return new Response(JSON.stringify({ match: invitedMatch }), {
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

    expect(await screen.findByLabelText('Статус соперника: ждёт ответ')).toBeInTheDocument();
    expect(screen.queryByLabelText('Статус соперника: ждём ответ')).not.toBeInTheDocument();
  });

  it('renders compact duel rating records with calendar-style month navigation', async () => {
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
            rating_visible: true,
            available_seasons: ['2026-05', '2026-04'],
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
            me_rank: 1,
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
    expect(screen.getByText('Рейтинг', { selector: 'div' })).toHaveClass(
      'section-label',
      'duel-section-title',
    );
    expect(
      screen.queryByRole('combobox', { name: 'Месяц рейтинга дуэлей' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Май 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Предыдущий месяц рейтинга' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Следующий месяц рейтинга' })).toBeDisabled();
    const currentRow = myRow.closest('tr') as HTMLElement;
    expect(currentRow).toHaveClass('tournament-standing-table__current-user');
    const currentCells = within(currentRow).getAllByRole('cell');
    expect(currentCells[0]).toHaveTextContent('1');
    expect(currentCells.slice(2).map((cell) => cell.textContent)).toEqual([
      '1',
      '1',
      '0',
      '0',
      '3',
    ]);
    const ratingTableCard = myRow.closest('table')?.parentElement;
    expect(ratingTableCard).toHaveClass('glass', 'tournament-details__content');
    expect(ratingTableCard).not.toHaveClass('duel-rating-table-wrap');
    const ratingTable = myRow.closest('table');
    expect(ratingTable).toHaveClass('tournament-standing-table--duel-rating');
    const ratingCard = ratingTable?.closest('.duel-rating-table-card');
    expect(ratingCard).toContainElement(screen.getByRole('heading', { name: 'Май 2026' }));
    expect(
      within(ratingTable as HTMLElement)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['М', 'Игрок', 'И', 'В', 'Н', 'П', 'О']);
  });

  it('renders an empty duel rating as plain copy without a nested state card', async () => {
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
            rating_visible: true,
            available_seasons: ['2026-05'],
            rating: [],
            me_rank: null,
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
    const emptyCopy = await screen.findByText('Рейтинг появится после первых завершённых дуэлей.');
    expect(emptyCopy).toHaveClass('duel-rating-empty');
    expect(emptyCopy).not.toHaveClass('duel-state-card', 'glass');
  });

  it('starts a daily period from the rink start button', async () => {
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
    expect(await screen.findByRole('button', { name: 'НАЧАТЬ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'НАЧАТЬ' }));
    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(true);
    });
  });

  it('keeps classic duel next-period start enabled after previous period shot quota', async () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const classicMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      duel_kind: 'classic',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: startedAt,
      ends_at: endsAt,
      server_now: new Date().toISOString(),
      period_started_at: null,
      period_ends_at: null,
      break_ends_at: null,
      rules: {
        ...settledDuelMatch.rules,
        title: 'Классика',
        duelKind: 'classic',
        duelVariant: 'classic',
        totalPeriods: 3,
        shotsPerPeriod: 30,
        periodDurationMs: 20 * 60_000,
        breakDurationMs: 0,
        periodRules: [
          { periodNumber: 1, mode: 'quota', durationMs: 20 * 60_000, shotsLimit: 30 },
          { periodNumber: 2, mode: 'quota', durationMs: 20 * 60_000, shotsLimit: 30 },
          { periodNumber: 3, mode: 'quota', durationMs: 20 * 60_000, shotsLimit: 30 },
        ],
      },
      me: {
        ...settledDuelMatch.me,
        state: 'accepted',
        current_period: 1,
        shots_taken: 30,
        goals: 20,
        current_period_shots: 0,
        current_period_goals: 0,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'accepted',
        current_period: 1,
        shots_taken: 30,
        goals: 18,
        current_period_shots: 0,
        current_period_goals: 0,
      },
      current_period_shots: 0,
      current_period_goals: 0,
    };
    const periodActiveMatch: AmateurDuelMatchState = {
      ...classicMatch,
      period_started_at: new Date().toISOString(),
      period_ends_at: new Date(Date.now() + 20 * 60_000).toISOString(),
      me: {
        ...classicMatch.me,
        state: 'period_active',
        current_period: 2,
        period_started_at: new Date().toISOString(),
      },
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
      if (url.includes('/duel/amateur/matches/match-1/period/start')) {
        return new Response(JSON.stringify({ match: periodActiveMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/amateur/matches/match-1')) {
        return new Response(JSON.stringify({ match: classicMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&match=match-1&play=1']);

    const startButton = await screen.findByRole('button', { name: 'НАЧАТЬ' });
    expect(startButton).toBeEnabled();
    expect(document.querySelector('img[src="/sprites/training-court.webp"]')).toBeTruthy();
    expect(document.querySelector('img[src="/bonus-games/arenas/beach.webp"]')).toBeFalsy();
    expect(screen.getByLabelText('Игровое табло')).toBeInTheDocument();
    expect(document.querySelector('img[src="/sprites/duel-tableau.webp"]')).toBeFalsy();
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('/duel/amateur/matches/match-1/period/start'),
        ),
      ).toBe(true);
    });
  });

  it('uses the frozen home arena artwork for a tournament duel', async () => {
    const tournamentMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      source: 'tournament',
      venue_role: 'home',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      server_now: new Date().toISOString(),
      me: {
        ...settledDuelMatch.me,
        state: 'accepted',
        current_period: 0,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'accepted',
        current_period: 0,
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
        return new Response(JSON.stringify({ match: tournamentMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&match=match-1&play=1']);

    expect(await screen.findByRole('button', { name: 'НАЧАТЬ' })).toBeEnabled();
    expect(document.querySelector('img[src="/bonus-games/arenas/beach.webp"]')).toBeTruthy();
  });

  it('uses the playable standard arena background for a tournament duel', async () => {
    const tournamentMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      source: 'tournament',
      venue_role: 'home',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      server_now: new Date().toISOString(),
      arena: {
        ...settledDuelMatch.arena,
        id: 'arena-default',
        slug: 'default',
        title: 'Стандартная арена',
        artwork_url: '/sprites/arena-ice-court-v2.webp',
        thumbnail_url: '/sprites/arena-ice-court-v2.webp',
      },
      me: {
        ...settledDuelMatch.me,
        state: 'accepted',
        current_period: 0,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'accepted',
        current_period: 0,
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
        return new Response(JSON.stringify({ match: tournamentMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&match=match-1&play=1']);

    expect(await screen.findByRole('button', { name: 'НАЧАТЬ' })).toBeEnabled();
    expect(
      document.querySelector('img[src="/sprites/amateur-tournament-court.webp"]'),
    ).toBeTruthy();
    expect(document.querySelector('img[src="/sprites/arena-ice-court-v2.webp"]')).toBeFalsy();
  });

  it('explains the second readiness confirmation when a tournament duel opens', async () => {
    const tournamentMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'ready_check',
      source: 'tournament',
      venue_role: 'home',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      ready_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      server_now: new Date().toISOString(),
      me: {
        ...settledDuelMatch.me,
        state: 'loadout_pending',
        current_period: 0,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'loadout_pending',
        current_period: 0,
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
        return new Response(JSON.stringify({ match: tournamentMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&match=match-1&play=1']);

    expect(await screen.findByRole('dialog', { name: 'Подтвердите участие' })).toBeInTheDocument();
    expect(
      screen.getByText('Нажмите «Готов», чтобы подтвердить участие в дуэли.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/техническое поражение/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Не показывать снова' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Понятно' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Готов' })).toBeEnabled();
  });

  it('keeps the tournament readiness explanation disabled after opting out', async () => {
    const tournamentMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'ready_check',
      source: 'tournament',
      venue_role: 'home',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      ready_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      server_now: new Date().toISOString(),
      me: {
        ...settledDuelMatch.me,
        state: 'loadout_pending',
        current_period: 0,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'loadout_pending',
        current_period: 0,
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
        return new Response(JSON.stringify({ match: tournamentMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const firstRender = renderWith(['/?view=amateur&match=match-1&play=1']);

    const optOut = await screen.findByRole('checkbox', { name: 'Не показывать снова' });
    fireEvent.click(optOut);
    fireEvent.click(screen.getByRole('button', { name: 'Готов' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Подтвердите участие' })).not.toBeInTheDocument();
    });
    firstRender.unmount();

    renderWith(['/?view=amateur&match=match-1&play=1']);

    expect(await screen.findByRole('button', { name: 'ГОТОВ' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Подтвердите участие' })).not.toBeInTheDocument();
  });

  it('builds live opponent progress for the amateur duel scoreboard', () => {
    const now = new Date();
    const activeMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      duel_kind: 'classic',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: new Date(now.getTime() - 10 * 60_000).toISOString(),
      ends_at: new Date(now.getTime() + 60 * 60_000).toISOString(),
      server_now: now.toISOString(),
      period_started_at: new Date(now.getTime() - 2 * 60_000).toISOString(),
      period_ends_at: new Date(now.getTime() + 18 * 60_000).toISOString(),
      rules: {
        ...settledDuelMatch.rules,
        title: 'Классика',
        duelKind: 'classic',
        duelVariant: 'classic',
        totalPeriods: 3,
        shotsPerPeriod: 30,
        periodDurationMs: 20 * 60_000,
        breakDurationMs: 5 * 60_000,
        periodRules: [
          { periodNumber: 1, mode: 'quota', durationMs: 20 * 60_000, shotsLimit: 30 },
          { periodNumber: 2, mode: 'quota', durationMs: 20 * 60_000, shotsLimit: 30 },
          { periodNumber: 3, mode: 'quota', durationMs: 20 * 60_000, shotsLimit: 30 },
        ],
      },
      me: {
        ...settledDuelMatch.me,
        state: 'period_active',
        current_period: 2,
        shots_taken: 42,
        goals: 20,
        current_period_shots: 12,
        current_period_goals: 5,
        period_started_at: new Date(now.getTime() - 2 * 60_000).toISOString(),
        period_ends_at: new Date(now.getTime() + 18 * 60_000).toISOString(),
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'period_active',
        current_period: 2,
        shots_taken: 37,
        goals: 19,
        current_period_shots: 7,
        current_period_goals: 4,
        period_started_at: new Date(now.getTime() - 90_000).toISOString(),
        period_ends_at: new Date(now.getTime() + 18 * 60_000 + 30_000).toISOString(),
      },
      current_period_shots: 12,
      current_period_goals: 5,
    };

    expect(duelScoreboardOpponent(activeMatch)).toMatchObject({
      goals: 19,
      shots: 37,
      shotsLabel: '07/30',
      time: 'играет 2/3',
      timeTone: 'active',
    });
  });

  it('shows the total duel score and opponent progress on the rink cube', async () => {
    const now = new Date();
    const activeMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      duel_kind: 'classic',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      starts_at: new Date(now.getTime() - 10 * 60_000).toISOString(),
      ends_at: new Date(now.getTime() + 60 * 60_000).toISOString(),
      server_now: now.toISOString(),
      period_started_at: new Date(now.getTime() - 2 * 60_000).toISOString(),
      period_ends_at: new Date(now.getTime() + 18 * 60_000).toISOString(),
      rules: {
        ...settledDuelMatch.rules,
        title: 'Классика',
        duelKind: 'classic',
        duelVariant: 'classic',
        totalPeriods: 3,
        shotsPerPeriod: 30,
        periodDurationMs: 20 * 60_000,
        breakDurationMs: 5 * 60_000,
        periodRules: [
          { periodNumber: 1, mode: 'quota', durationMs: 20 * 60_000, shotsLimit: 30 },
          { periodNumber: 2, mode: 'quota', durationMs: 20 * 60_000, shotsLimit: 30 },
          { periodNumber: 3, mode: 'quota', durationMs: 20 * 60_000, shotsLimit: 30 },
        ],
      },
      me: {
        ...settledDuelMatch.me,
        state: 'period_active',
        current_period: 2,
        shots_taken: 42,
        goals: 20,
        current_period_shots: 12,
        current_period_goals: 5,
        period_started_at: new Date(now.getTime() - 2 * 60_000).toISOString(),
        period_ends_at: new Date(now.getTime() + 18 * 60_000).toISOString(),
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'period_active',
        current_period: 2,
        shots_taken: 37,
        goals: 19,
        current_period_shots: 7,
        current_period_goals: 4,
        period_started_at: new Date(now.getTime() - 90_000).toISOString(),
        period_ends_at: new Date(now.getTime() + 18 * 60_000 + 30_000).toISOString(),
      },
      current_period_shots: 12,
      current_period_goals: 5,
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
        return new Response(JSON.stringify({ match: activeMatch }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWith(['/?view=amateur&match=match-1&play=1']);

    expect(await screen.findByText('СЧЁТ')).toBeInTheDocument();
    expect(screen.getByText('20:19')).toBeInTheDocument();
    const scoreboardText = screen.getByLabelText('Игровое табло').textContent ?? '';
    expect(scoreboardText.indexOf('СЧЁТ')).toBeGreaterThan(scoreboardText.indexOf('ПЕРИОД'));
    expect(scoreboardText.indexOf('БРОСКИ')).toBeGreaterThan(scoreboardText.indexOf('СЧЁТ'));
    expect(scoreboardText.indexOf('ВРЕМЯ')).toBeGreaterThan(scoreboardText.indexOf('БРОСКИ'));
    const opponentLine = screen.getByLabelText('Соперник: Duel Opponent');
    expect(opponentLine).toHaveClass('game-scoreboard__status-line--active');
    expect(within(opponentLine).getByText('Duel Opponent')).toBeInTheDocument();
    expect(within(opponentLine).getByText('07/30 · ИГРАЕТ 2/3')).toBeInTheDocument();
  });

  it('shows five minutes to forfeit after an intermission period is ready', () => {
    const now = Date.parse('2026-05-16T10:10:00.000Z');
    const activeMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      ends_at: '2026-05-16T10:25:00.000Z',
      server_now: '2026-05-16T10:10:00.000Z',
      me: {
        ...settledDuelMatch.me,
        state: 'accepted',
        current_period: 1,
        ready_at: '2026-05-16T10:10:00.000Z',
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'completed',
        current_period: 2,
      },
    };

    expect(duelEventTiming(activeMatch, now)).toMatchObject({
      label: 'До поражения',
      value: '05:00',
    });
  });

  it('shows player time instead of duplicating the score when no duel deadline is active', () => {
    const now = Date.parse('2026-05-16T10:10:00.000Z');
    const activeMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      ends_at: '2026-05-16T10:05:00.000Z',
      server_now: '2026-05-16T10:10:00.000Z',
      me: {
        ...settledDuelMatch.me,
        state: 'completed',
        active_duration_ms: 180_000,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        state: 'accepted',
      },
    };

    expect(duelEventTiming(activeMatch, now)).toMatchObject({
      label: 'Время',
      value: '03:00',
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
    expect(within(dialog).queryByText('1-й период')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('25%')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('10%')).not.toBeInTheDocument();
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog', { name: 'Результат дуэли' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Понятно' }));
    expect(screen.queryByRole('dialog', { name: 'Результат дуэли' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('location')).toHaveTextContent('/?view=amateur&section=duels');
    expect(refreshAfterGameExit).toHaveBeenCalledTimes(1);
  });

  it('refreshes onboarding once when leaving a settled direct duel result', async () => {
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
    renderWith(['/?view=amateur&match=match-1&play=1']);

    const dialog = await screen.findByRole('dialog', { name: 'Результат дуэли' });
    const exit = within(dialog).getByRole('button', { name: 'Понятно' });
    fireEvent.click(exit);
    fireEvent.click(exit);

    expect(screen.getByLabelText('location')).toHaveTextContent('/?view=arena');
    expect(refreshAfterGameExit).toHaveBeenCalledTimes(1);
  });

  it('explains a tied-goals duel result with the time tiebreaker', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const timeWinMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      duel_kind: 'classic',
      rules: {
        ...settledDuelMatch.rules,
        title: 'Классика',
        duelKind: 'classic',
        duelVariant: 'classic',
        periodRules: [
          { periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 30 },
          { periodNumber: 2, mode: 'quota', durationMs: 1200000, shotsLimit: 90 },
        ],
      },
      me: {
        ...settledDuelMatch.me,
        goals: 91,
        active_duration_ms: 274000,
        result_points: 3,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        goals: 91,
        active_duration_ms: 296000,
        result_points: 0,
      },
      recent_periods: [
        {
          period_number: 1,
          shots_taken: 30,
          goals: 25,
          duration_ms: 94000,
          closed_reason: 'quota',
          ended_at: '2026-05-16T10:01:34.000Z',
        },
        {
          period_number: 2,
          shots_taken: 76,
          goals: 66,
          duration_ms: 180000,
          closed_reason: 'quota',
          ended_at: '2026-05-16T10:04:34.000Z',
        },
      ],
      opponent_recent_periods: [
        {
          period_number: 1,
          shots_taken: 30,
          goals: 28,
          duration_ms: 116000,
          closed_reason: 'quota',
          ended_at: '2026-05-16T10:01:56.000Z',
        },
        {
          period_number: 2,
          shots_taken: 86,
          goals: 63,
          duration_ms: 180000,
          closed_reason: 'quota',
          ended_at: '2026-05-16T10:04:56.000Z',
        },
      ],
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
        return new Response(JSON.stringify({ match: timeWinMatch }), {
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
    expect(within(dialog).getByText('Победа')).toBeInTheDocument();
    expect(within(dialog).getByText('91:91')).toBeInTheDocument();
    expect(within(dialog).getByText('Решило время')).toBeInTheDocument();
    expect(within(dialog).getByText('04:34 / 04:56')).toBeInTheDocument();
    expect(within(dialog).getByText('Вы быстрее на 22 сек')).toBeInTheDocument();
    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes('Encountered two children with the same key'),
      ),
    ).toBe(false);
  });

  it('explains an express tied-goals result with the accuracy tiebreaker', async () => {
    const accuracyLossMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      winner_user_id: 'u2',
      outcome: 'opponent_win',
      me: {
        ...settledDuelMatch.me,
        shots_taken: 80,
        goals: 40,
        accuracy: 50,
        active_duration_ms: 180000,
        result_points: 0,
      },
      opponent: {
        ...settledDuelMatch.opponent,
        shots_taken: 50,
        goals: 40,
        accuracy: 80,
        active_duration_ms: 180000,
        result_points: 3,
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
        return new Response(JSON.stringify({ match: accuracyLossMatch }), {
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
    expect(within(dialog).getByText('Поражение')).toBeInTheDocument();
    expect(within(dialog).getByText('40:40')).toBeInTheDocument();
    expect(within(dialog).getByText('Решил процент')).toBeInTheDocument();
    expect(within(dialog).getByText('50% / 80%')).toBeInTheDocument();
    expect(within(dialog).getByText('Поражение из-за процента соперника')).toBeInTheDocument();
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

describe('duel ready rink presence', () => {
  it('keeps the opponent goalie present after the opponent has started a period', () => {
    expect(isDuelReadyPresenceState('ready')).toBe(true);
    expect(isDuelReadyPresenceState('accepted')).toBe(true);
    expect(isDuelReadyPresenceState('period_active')).toBe(true);
  });

  it('shows the opponent goalie on active duel start screens regardless of opponent state', () => {
    const activeStartMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'active',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      me: { ...settledDuelMatch.me, state: 'accepted' },
      opponent: { ...settledDuelMatch.opponent, state: 'forfeit' },
    };

    expect(duelRinkReadyPresenceForMatch(activeStartMatch)).toEqual({
      playerReady: true,
      goalieReady: true,
    });
  });

  it('still uses opponent readiness before the duel starts', () => {
    const preStartMatch: AmateurDuelMatchState = {
      ...settledDuelMatch,
      status: 'ready_check',
      outcome: null,
      winner_user_id: null,
      settled_at: null,
      settled_reason: null,
      me: { ...settledDuelMatch.me, state: 'ready' },
      opponent: { ...settledDuelMatch.opponent, state: 'loadout_pending' },
    };

    expect(duelRinkReadyPresenceForMatch(preStartMatch)).toEqual({
      playerReady: true,
      goalieReady: false,
    });
  });
});
