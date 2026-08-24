import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STICK_NEUTRAL } from '@hockey/game-core';
import type { BonusGameAttempt } from '../api/bonusGames.js';
import { useBonusGameStore } from '../stores/bonusGameStore.js';

const playViewProbe = vi.hoisted(() => vi.fn());

vi.mock('../game/PlayView.js', () => ({
  PlayView(props: {
    active: boolean;
    longCourtBackground?: string;
    overlayControls?: ReactNode;
    optimisticAddShot: (result: 'goal' | 'save' | 'miss') => void;
    submitShot: (args: {
      shotIndex: number;
      input: {
        tapTime: number;
        shooterTapTime: number;
        puckSpeedPerMs: number;
        shooterFrequency: number;
        goalieFrequency: number;
        goalFrequency: number;
      };
      claimedResult: 'goal' | 'save' | 'miss';
    }) => Promise<unknown>;
  }) {
    playViewProbe(props);
    return (
      <section data-testid="bonus-play-view">
        <img data-testid="bonus-rink-background" src={props.longCourtBackground} alt="" />
        {props.overlayControls}
        <button
          type="button"
          disabled={!props.active}
          onClick={() => {
            props.optimisticAddShot('goal');
            void props.submitShot({
              shotIndex: 4,
              input: {
                tapTime: 6_000,
                shooterTapTime: 4_800,
                puckSpeedPerMs: 1.3,
                shooterFrequency: 0.7,
                goalieFrequency: 0.55,
                goalFrequency: 0.5,
              },
              claimedResult: 'goal',
            });
          }}
        >
          Тестовый бросок
        </button>
      </section>
    );
  },
}));

import { BonusGamePlayScreen } from './BonusGamePlayScreen.js';

function attempt(overrides: Partial<BonusGameAttempt> = {}): BonusGameAttempt {
  return {
    id: 'attempt-1',
    game_id: 'game-1',
    game_slug: 'beach',
    game_title: 'Пляж',
    status: 'active',
    state: 'period_active',
    current_period: 2,
    period_started_at: '2026-08-24T10:00:00.000Z',
    period_ends_at: '2026-08-24T10:04:00.000Z',
    break_started_at: null,
    break_ends_at: null,
    closed_at: null,
    shots_taken: 28,
    current_period_shots_taken: 3,
    goals: 18,
    reward_granted: false,
    attempt_seed: 'bonus-seed',
    game_core_version: 1,
    definition_revision: 4,
    server_now: '2026-08-24T10:00:09.000Z',
    rules: {
      game_id: 'game-1',
      slug: 'beach',
      title: 'Пляж',
      revision: 4,
      target_goals: 20,
      total_periods: 2,
      break_duration_ms: 30_000,
      periods: [
        {
          period_number: 1,
          duration_ms: 240_000,
          shots_limit: 25,
          goal_frequency: 0.45,
          goalie_frequency: 0.5,
          shooter_frequency: 0.65,
          puck_speed_per_ms: 1.2,
          goalie_pattern: 'linear',
          goalie_amplitude: 1,
          goal_amplitude: 220,
        },
        {
          period_number: 2,
          duration_ms: 240_000,
          shots_limit: 25,
          goal_frequency: 0.5,
          goalie_frequency: 0.55,
          shooter_frequency: 0.7,
          puck_speed_per_ms: 1.3,
          goalie_pattern: 'sine',
          goalie_amplitude: 0.9,
          goal_amplitude: 200,
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
    ...overrides,
  };
}

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <div aria-label="location">{`${location.pathname}${location.search}`}</div>;
}

function renderScreen(path = '/bonus-games/game-1/play?attempt=attempt-1'): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/bonus-games/:gameId/play" element={<BonusGamePlayScreen />} />
        <Route path="/bonus-games" element={<main>Каталог бонусных игр</main>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function setStore(overrides: Partial<ReturnType<typeof useBonusGameStore.getState>> = {}): void {
  useBonusGameStore.setState({
    attempt: attempt(),
    loading: false,
    error: null,
    errorCode: null,
    inFlight: false,
    needsReconcile: false,
    requestEpoch: 0,
    receivedAtPerformanceMs: 1_000,
    loadCurrent: vi.fn(async () => null),
    loadAttempt: vi.fn(async () => null),
    applyState: vi.fn(),
    optimisticAddShot: vi.fn(),
    startPeriod: vi.fn(async () => null),
    submitShot: vi.fn(async () => null),
    abandon: vi.fn(async () => null),
    refresh: vi.fn(async () => null),
    canSubmitShot: vi.fn(() => true),
    ...overrides,
  });
}

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: (value: T) => resolve?.(value) };
}

describe('BonusGamePlayScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders an explicit loading state', () => {
    setStore({ attempt: null, loading: true });
    renderScreen();

    expect(screen.getByRole('status')).toHaveTextContent('Загружаем бонусную игру…');
  });

  it('starts an idle period only through the store action', () => {
    const startPeriod = vi.fn(async () => attempt());
    setStore({
      attempt: attempt({
        state: 'idle',
        current_period: 1,
        period_started_at: null,
        period_ends_at: null,
        current_period_shots_taken: 0,
      }),
      startPeriod,
    });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Начать период 2' }));

    expect(startPeriod).toHaveBeenCalledTimes(1);
  });

  it('adapts the snapshotted rule, neutral stick, exact media and authoritative clocks', () => {
    renderScreen();

    expect(screen.getByTestId('bonus-rink-background')).toHaveAttribute(
      'src',
      '/bonus-games/arenas/beach.webp',
    );
    const props = playViewProbe.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props).toMatchObject({
      goalieId: null,
      periodNumber: 2,
      shots: 3,
      goals: 18,
      shotsTotal: 25,
      stickEffects: STICK_NEUTRAL,
      longCourtBackground: '/bonus-games/arenas/beach.webp',
      rinkAspectRatio: '572 / 700',
      initialSceneElapsedMs: 6_000,
      initialShooterElapsedMs: 4_800,
      goalieOptions: {
        idleSpriteUrl: '/bonus-games/goalkeepers/beach-ready.webp',
        saveSpriteUrl: '/bonus-games/goalkeepers/beach-save.webp',
      },
      goalieConfig: {
        id: 'bonus:beach:p2',
        pattern: 'sine',
        amplitude: 0.9,
        frequency: 0.55,
        goalAmplitude: 200,
        goalFrequency: 0.5,
      },
      preloadAssets: [
        '/bonus-games/arenas/beach.webp',
        '/bonus-games/goalkeepers/beach-ready.webp',
        '/bonus-games/goalkeepers/beach-save.webp',
      ],
    });
  });

  it('blocks play and requests authoritative detail during reconciliation', () => {
    const loadAttempt = vi.fn(async () => attempt());
    setStore({ needsReconcile: true, loadAttempt });
    renderScreen();

    expect(screen.getByRole('status')).toHaveTextContent('Проверяем результат броска…');
    expect(screen.queryByTestId('bonus-play-view')).toBeNull();
    expect(loadAttempt).toHaveBeenCalledWith('attempt-1');
  });

  it('lets the player retry a failed authoritative reconciliation', async () => {
    const loadAttempt = vi.fn(async () => null);
    setStore({
      needsReconcile: true,
      error: 'Не удалось проверить результат броска.',
      loadAttempt,
    });
    renderScreen();

    await waitFor(() => expect(loadAttempt).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Повторить проверку' }));

    expect(loadAttempt).toHaveBeenCalledTimes(2);
    expect(loadAttempt).toHaveBeenLastCalledWith('attempt-1');
    expect(screen.queryByTestId('bonus-play-view')).toBeNull();
  });

  it('refreshes authoritative detail when the break countdown elapses', async () => {
    vi.useFakeTimers();
    let performanceNow = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => performanceNow);
    const loadAttempt = vi.fn(async () => attempt());
    setStore({
      attempt: attempt({
        state: 'break_active',
        period_started_at: null,
        period_ends_at: null,
        break_started_at: '2026-08-24T10:00:00.000Z',
        break_ends_at: '2026-08-24T10:00:01.000Z',
        server_now: '2026-08-24T10:00:00.000Z',
      }),
      receivedAtPerformanceMs: 0,
      loadAttempt,
    });
    renderScreen();
    loadAttempt.mockClear();

    expect(screen.getByRole('timer')).toHaveTextContent('00:01');
    performanceNow = 1_100;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(loadAttempt).toHaveBeenCalledTimes(1);
    expect(loadAttempt).toHaveBeenCalledWith('attempt-1');
  });

  it.each([
    ['failed', false, 'Цель не достигнута'],
    ['completed', true, 'Награда за первое прохождение'],
    ['completed', false, 'Повтор завершён без награды'],
    ['abandoned', false, 'Прогресс попытки потерян'],
  ] as const)(
    'renders %s terminal state from the authoritative DTO',
    (status, rewardGranted, copy) => {
      setStore({
        attempt: attempt({
          status,
          state: 'closed',
          period_started_at: null,
          period_ends_at: null,
          reward_granted: rewardGranted,
        }),
      });
      renderScreen();

      expect(screen.getByText(copy)).toBeInTheDocument();
      expect(screen.queryByTestId('bonus-play-view')).toBeNull();
    },
  );

  it('requires confirmation and abandons once before returning to the catalog', async () => {
    const pending = deferred<BonusGameAttempt | null>();
    const abandoned = attempt({
      status: 'abandoned',
      state: 'closed',
      period_started_at: null,
      period_ends_at: null,
    });
    const abandon = vi.fn(() => pending.promise);
    setStore({ abandon });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Завершить попытку' }));
    expect(abandon).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Завершить попытку?' });
    expect(dialog).toHaveTextContent('Прогресс попытки пропадёт. Оплаченное открытие останется.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Продолжить игру' }));
    expect(abandon).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Завершить попытку?' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Завершить попытку' }));
    const confirm = within(screen.getByRole('dialog', { name: 'Завершить попытку?' })).getByRole(
      'button',
      { name: 'Да, завершить' },
    );
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(abandon).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('location')).toHaveTextContent('/bonus-games/game-1/play');

    pending.resolve(abandoned);
    await waitFor(() => {
      expect(screen.getByLabelText('location')).toHaveTextContent('/bonus-games');
    });
  });

  it('stays in the attempt when authoritative abandon does not succeed', async () => {
    const abandon = vi.fn(async () => null);
    setStore({ abandon });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Завершить попытку' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Завершить попытку?' })).getByRole('button', {
        name: 'Да, завершить',
      }),
    );

    await waitFor(() => expect(abandon).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('location')).toHaveTextContent('/bonus-games/game-1/play');
    expect(screen.getByRole('dialog', { name: 'Завершить попытку?' })).toBeInTheDocument();
  });
});
