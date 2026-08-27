import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STICK_NEUTRAL } from '@hockey/game-core';
import type { BonusGameAttempt } from '../api/bonusGames.js';
import { useBonusGameStore } from '../stores/bonusGameStore.js';

const playViewProbe = vi.hoisted(() => vi.fn());

vi.mock('../game/PlayView.js', () => ({
  PlayView(props: {
    suppressedByModal: boolean;
    showIceCar: boolean;
    active: boolean;
    longCourtBackground?: string;
    periodNumber: number;
    timer?: string;
    shotButtonLabel?: string;
    primaryActionBlocked?: boolean;
    overlayControls?: JSX.Element;
    inactiveAction?: () => unknown | Promise<unknown>;
    entranceBeforeInactiveAction?: boolean;
    goalsOnlyWhileInactive?: boolean;
    continuousClockDuringResult?: boolean;
    onBack: () => void;
    backLabel?: string;
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
    applyState: (next: BonusGameAttempt) => void;
    applyResolvedState?: (next: BonusGameAttempt) => void;
  }) {
    playViewProbe(props);
    return (
      <section data-testid="bonus-play-view">
        <img data-testid="bonus-rink-background" src={props.longCourtBackground} alt="" />
        <button type="button" onClick={props.onBack}>
          {props.backLabel ?? 'Назад'}
        </button>
        <button
          type="button"
          disabled={!props.active || props.primaryActionBlocked}
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
        {props.overlayControls}
        {!props.active && props.inactiveAction ? (
          <button type="button" onClick={() => void props.inactiveAction?.()}>
            {props.shotButtonLabel}
          </button>
        ) : null}
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
    current_goal_streak: 2,
    best_goal_streak: 4,
    preview_required: false,
    current_loadout: null,
    reward_granted: false,
    attempt_seed: 'bonus-seed',
    game_core_version: 1,
    definition_revision: 4,
    server_now: '2026-08-24T10:00:09.000Z',
    rules: {
      game_id: 'game-1',
      slug: 'beach',
      title: 'Пляж',
      skill_code: 'accuracy',
      revision: 4,
      target_goals: 20,
      qualification_rules: { type: 'goals_from_shots', targetGoals: 20, shotsLimit: 50 },
      total_periods: 2,
      break_duration_ms: 30_000,
      use_inventory: false,
      preview_title: 'Первая квалификация',
      preview_story: 'История',
      preview_artwork_url: '/bonus-games/location-cards/beach.webp',
      preview_revision: 1,
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

function CatalogProbe({ loadCatalog }: { loadCatalog: () => Promise<string> }): JSX.Element {
  const catalog = useQuery({ queryKey: ['bonus-games'], queryFn: loadCatalog });
  return <main>{catalog.data ?? 'Загружаем каталог'}</main>;
}

function renderScreen(
  path = '/bonus-games/game-1/play?attempt=attempt-1',
  options: { queryClient?: QueryClient; loadCatalog?: () => Promise<string> } = {},
) {
  const queryClient =
    options.queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  const loadCatalog = options.loadCatalog ?? vi.fn(async () => 'Каталог бонусных игр');
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/bonus-games/:gameId/play" element={<BonusGamePlayScreen />} />
            <Route path="/bonus-games" element={<CatalogProbe loadCatalog={loadCatalog} />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
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
    pendingShot: null,
    loadCurrent: vi.fn(async () => null),
    loadAttempt: vi.fn(async () => null),
    applyState: vi.fn(),
    applyPendingShot: vi.fn(() => null),
    optimisticAddShot: vi.fn(),
    startPeriod: vi.fn(async () => null),
    acknowledgePreview: vi.fn(async () => null),
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

  it('shows the qualification preview over the mounted ice without a dismissal checkbox', async () => {
    const acknowledgePreview = vi.fn(async () => attempt({ preview_required: false }));
    setStore({
      attempt: attempt({
        state: 'idle',
        current_period: 0,
        period_started_at: null,
        period_ends_at: null,
        shots_taken: 0,
        current_period_shots_taken: 0,
        goals: 0,
        current_goal_streak: 0,
        best_goal_streak: 0,
        preview_required: true,
      }),
      acknowledgePreview,
    });

    renderScreen();

    expect(screen.getByTestId('bonus-play-view')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Первая квалификация' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Локация «Пляж» и её вратарь' })).toHaveAttribute(
      'src',
      '/bonus-games/location-cards/beach.webp?v=20260827-generated-arenas-v3',
    );
    const qualification = screen.getByText('20 голов из 50 бросков');
    expect(qualification).toBeInTheDocument();
    expect(qualification.querySelector('.bonus-game-preview-modal__condition-icon')).not.toBeNull();
    const acknowledgeButton = screen.getByRole('button', { name: 'К игре' });
    expect(screen.queryByRole('checkbox', { name: 'Больше не показывать' })).not.toBeInTheDocument();
    fireEvent.click(acknowledgeButton);

    await waitFor(() => expect(acknowledgePreview).toHaveBeenCalledWith(false));
  });

  it('shows the idle period on the rink and starts it through the primary button', () => {
    const startPeriod = vi.fn(async () => attempt());
    setStore({
      attempt: attempt({
        state: 'idle',
        current_period: 0,
        period_started_at: null,
        period_ends_at: null,
        current_period_shots_taken: 0,
      }),
      startPeriod,
    });
    renderScreen();

    expect(screen.getByTestId('bonus-play-view')).toBeInTheDocument();
    expect(screen.queryByText('Цель: 20 голов. Текущий результат: 18.')).not.toBeInTheDocument();

    const props = playViewProbe.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props).toMatchObject({
      active: false,
      suppressedByModal: false,
      showIceCar: false,
      periodNumber: 1,
      timer: '04:00',
      shotButtonLabel: 'НАЧАТЬ',
      entranceBeforeInactiveAction: true,
      goalsOnlyWhileInactive: true,
    });
    expect(props).not.toHaveProperty('continuousClockDuringResult');
    expect(props).not.toHaveProperty('freezeRenderingDuringResult');

    fireEvent.click(screen.getByRole('button', { name: 'НАЧАТЬ' }));

    expect(startPeriod).toHaveBeenCalledTimes(1);
  });

  it('adapts the snapshotted rule, neutral stick, exact media and authoritative clocks', () => {
    renderScreen();

    expect(screen.getByTestId('bonus-rink-background')).toHaveAttribute(
      'src',
      '/bonus-games/arenas/beach.webp?v=20260827-generated-arenas-v3',
    );
    const props = playViewProbe.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props).toMatchObject({
      goalieId: null,
      periodNumber: 2,
      shots: 3,
      goals: 18,
      shotsTotal: 25,
      stickEffects: STICK_NEUTRAL,
      longCourtBackground: '/bonus-games/arenas/beach.webp?v=20260827-generated-arenas-v3',
      initialSceneElapsedMs: 6_000,
      initialShooterElapsedMs: 4_800,
      goalieOptions: {
        idleSpriteUrl: '/bonus-games/goalkeepers/beach-ready.webp',
        saveSpriteUrl: '/bonus-games/goalkeepers/beach-save.webp',
        visualYScale: 0.72,
        visualYOffset: 62,
        visualXScale: 0.9,
        sizeScale: 1.134,
        idleSizeScale: 1.22,
        saveSizeScale: 0.96,
        saveVisualYOffset: 10,
        shadow: true,
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
        '/bonus-games/arenas/beach.webp?v=20260827-generated-arenas-v3',
        '/bonus-games/goalkeepers/beach-ready.webp',
        '/bonus-games/goalkeepers/beach-save.webp',
      ],
    });
    expect(props).not.toHaveProperty('rinkAspectRatio');
    expect(props).not.toHaveProperty('gameLayerStyle');
  });

  it('matches World Tour save-pose framing to the training goalkeeper', () => {
    setStore({
      attempt: attempt({
        arena: {
          id: 'world-tour-arena-1',
          slug: 'moscow',
          title: 'Москва',
          artwork_url: '/bonus-games/world-tour/arenas/moscow.webp',
          thumbnail_url: '/bonus-games/world-tour/previews/moscow.webp',
        },
        goalkeeper_ready_url: '/bonus-games/world-tour/goalkeepers/moscow-ready.webp',
        goalkeeper_save_url: '/bonus-games/world-tour/goalkeepers/moscow-save.webp',
      }),
    });

    renderScreen();

    const props = playViewProbe.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props).toMatchObject({
      goalieOptions: {
        idleSizeScale: 1.22,
        saveSizeScale: 0.96,
      },
    });
  });

  it('defers the shot DTO until PlayView reaches its visual boundary', async () => {
    // This catches the screen disappearing before the final puck animation and result pause finish.
    const completedAttempt = attempt({
      status: 'completed',
      state: 'closed',
      period_started_at: null,
      period_ends_at: null,
      closed_at: '2026-08-24T10:01:00.000Z',
      reward_granted: true,
      goals: 20,
      shots_taken: 29,
      current_period_shots_taken: 4,
    });
    const submitShot = vi.fn(async () => ({
      serverResult: 'goal' as const,
      attempt: completedAttempt,
      rewardGranted: true,
    }));
    const applyPendingShot = vi.fn((next?: BonusGameAttempt) => {
      useBonusGameStore.setState({
        attempt: next ?? completedAttempt,
        pendingShot: null,
        inFlight: false,
      });
      return next ?? completedAttempt;
    });
    setStore({
      submitShot,
      applyPendingShot,
      pendingShot: { attempt: completedAttempt, receivedAtPerformanceMs: 1_000 },
      inFlight: true,
    });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Тестовый бросок' }));
    await waitFor(() => expect(submitShot).toHaveBeenCalledTimes(1));

    expect(submitShot).toHaveBeenCalledWith(
      expect.objectContaining({ claimed_shot_index: 4, claimed_result: 'goal' }),
      { deferApply: true },
    );
    expect(screen.getByTestId('bonus-play-view')).toBeInTheDocument();
    expect(screen.queryByText('Награда за первое прохождение')).toBeNull();

    const props = playViewProbe.mock.calls.at(-1)?.[0] as {
      applyResolvedState?: (next: BonusGameAttempt) => void;
    };
    act(() => props.applyResolvedState?.(completedAttempt));

    expect(applyPendingShot).toHaveBeenCalledTimes(1);
    expect(applyPendingShot).toHaveBeenCalledWith(completedAttempt);
    expect(screen.getByRole('dialog', { name: 'Игра пройдена' })).toHaveTextContent(
      'Награда за первое прохождение',
    );
    expect(screen.getByTestId('bonus-play-view')).toBeInTheDocument();
    expect(playViewProbe.mock.calls.at(-1)?.[0]).toMatchObject({
      active: false,
      suppressedByModal: true,
      showIceCar: true,
      timer: '00:00',
      shots: 29,
      shotsTotal: 50,
    });
  });

  it('applies the terminal DTO supplied by PlayView even when the pending store slot was cleared', async () => {
    // PlayView owns the visual boundary and passes the authoritative DTO back after the
    // puck flight/result pause. The screen must not depend on a second, lossy store lookup.
    const completedAttempt = attempt({
      status: 'completed',
      state: 'closed',
      period_started_at: null,
      period_ends_at: null,
      closed_at: '2026-08-24T10:01:00.000Z',
      reward_granted: true,
      goals: 20,
      shots_taken: 29,
      current_period_shots_taken: 4,
    });
    const submitShot = vi.fn(async () => ({
      serverResult: 'goal' as const,
      attempt: completedAttempt,
      rewardGranted: true,
    }));
    const applyPendingShot = vi.fn((next?: BonusGameAttempt) => {
      useBonusGameStore.setState({ attempt: next ?? null, pendingShot: null, inFlight: false });
      return next ?? null;
    });
    setStore({ submitShot, applyPendingShot, pendingShot: null, inFlight: true });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Тестовый бросок' }));
    await waitFor(() => expect(submitShot).toHaveBeenCalledTimes(1));

    const props = playViewProbe.mock.calls.at(-1)?.[0] as {
      applyResolvedState?: (next: BonusGameAttempt) => void;
    };
    act(() => props.applyResolvedState?.(completedAttempt));

    expect(screen.getByRole('dialog', { name: 'Игра пройдена' })).toBeInTheDocument();
  });

  it('applies a deferred response that arrives after the play route unmounts', async () => {
    // This catches a late successful response leaving the store permanently locked with no reward view.
    const responsePending = deferred<{
      serverResult: 'goal';
      attempt: BonusGameAttempt;
      rewardGranted: true;
    }>();
    const completedAttempt = attempt({
      status: 'completed',
      state: 'closed',
      period_started_at: null,
      period_ends_at: null,
      closed_at: '2026-08-24T10:01:00.000Z',
      reward_granted: true,
      goals: 20,
    });
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const submitShot = vi.fn(async () => {
      const result = await responsePending.promise;
      useBonusGameStore.setState({
        pendingShot: {
          attempt: result.attempt,
          receivedAtPerformanceMs: performance.now(),
        },
        inFlight: true,
      });
      return result;
    });
    const applyPendingShot = vi.fn(() => {
      const pendingShot = useBonusGameStore.getState().pendingShot;
      if (!pendingShot) return null;
      useBonusGameStore.setState({
        attempt: pendingShot.attempt,
        pendingShot: null,
        inFlight: false,
        receivedAtPerformanceMs: pendingShot.receivedAtPerformanceMs,
      });
      return pendingShot.attempt;
    });
    setStore({ submitShot, applyPendingShot });
    const view = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Тестовый бросок' }));

    view.unmount();
    await act(async () => {
      responsePending.resolve({
        serverResult: 'goal',
        attempt: completedAttempt,
        rewardGranted: true,
      });
      await responsePending.promise;
    });

    expect(applyPendingShot).toHaveBeenCalledTimes(2);
    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: completedAttempt,
      pendingShot: null,
      inFlight: false,
      receivedAtPerformanceMs: 1_000,
    });
  });

  it('uses the deferred response receipt when rendering the break countdown', () => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockReturnValue(4_321);
    setStore({
      attempt: attempt({
        state: 'break_active',
        period_started_at: null,
        period_ends_at: null,
        break_started_at: '2026-08-24T10:00:00.000Z',
        break_ends_at: '2026-08-24T10:00:05.000Z',
        server_now: '2026-08-24T10:00:00.000Z',
      }),
      receivedAtPerformanceMs: 1_000,
    });

    renderScreen();

    expect(screen.getByTestId('bonus-play-view')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Перерыв' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:02');
    expect(playViewProbe.mock.calls.at(-1)?.[0]).toMatchObject({
      active: false,
      suppressedByModal: true,
      showIceCar: true,
    });
  });

  it('blocks play and requests authoritative detail during reconciliation', () => {
    const loadAttempt = vi.fn(async () => attempt());
    setStore({ needsReconcile: true, loadAttempt });
    renderScreen();

    expect(screen.getByRole('status')).toHaveTextContent('Проверяем результат броска…');
    expect(screen.getByTestId('bonus-play-view')).toBeInTheDocument();
    expect(playViewProbe.mock.calls.at(-1)?.[0]).toMatchObject({
      active: true,
      primaryActionBlocked: true,
      shotButtonLabel: 'ПРОВЕРЯЕМ...',
    });
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
    expect(screen.getByTestId('bonus-play-view')).toBeInTheDocument();
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

  it('replaces an open exit prompt with the mandatory break modal', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'К бонусным играм' }));
    expect(screen.getByRole('dialog', { name: 'Выйти из бонусной игры?' })).toBeInTheDocument();

    act(() => {
      useBonusGameStore.setState({
        attempt: attempt({
          state: 'break_active',
          period_started_at: null,
          period_ends_at: null,
          break_started_at: '2026-08-24T10:00:00.000Z',
          break_ends_at: '2026-08-24T10:00:30.000Z',
          server_now: '2026-08-24T10:00:00.000Z',
        }),
      });
    });

    expect(screen.getByRole('dialog', { name: 'Перерыв' })).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Выйти из бонусной игры?', hidden: true }),
    ).toBeNull();
    expect(screen.getByLabelText('location')).toHaveTextContent('/bonus-games/game-1/play');
  });

  it.each([
    ['failed', false, 'Попытка завершена', 'Цель не достигнута'],
    ['completed', true, 'Игра пройдена', 'Награда за первое прохождение'],
    ['completed', false, 'Игра пройдена', 'Повтор завершён без награды'],
    ['abandoned', false, 'Попытка завершена', 'Прогресс попытки потерян'],
  ] as const)(
    'renders %s terminal state as a stopped rink result modal',
    (status, rewardGranted, title, copy) => {
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

      const dialog = screen.getByRole('dialog', { name: title });
      expect(dialog).toHaveTextContent(copy);
      expect(dialog).toHaveTextContent('Голы18');
      expect(dialog).toHaveTextContent('Броски28');
      expect(dialog).toHaveTextContent('Точность64%');
      expect(screen.getByTestId('bonus-play-view')).toBeInTheDocument();
      expect(playViewProbe.mock.calls.at(-1)?.[0]).toMatchObject({
        active: false,
        suppressedByModal: true,
        showIceCar: true,
        timer: '00:00',
      });
    },
  );

  it('keeps the terminal result open until the catalog button is pressed', () => {
    setStore({
      attempt: attempt({
        status: 'failed',
        state: 'closed',
        period_started_at: null,
        period_ends_at: null,
      }),
    });
    renderScreen();

    const dialog = screen.getByRole('dialog', { name: 'Попытка завершена' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(document.querySelector('.modal-backdrop') as HTMLElement);

    expect(screen.getByRole('dialog', { name: 'Попытка завершена' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'К бонусным играм' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('/bonus-games');
  });

  it('uses Russian plural forms for every granted reward', () => {
    setStore({
      attempt: attempt({
        status: 'completed',
        state: 'closed',
        period_started_at: null,
        period_ends_at: null,
        reward_granted: true,
        reward: { coins: 21, stars: 22, experience: 25 },
      }),
    });
    renderScreen();

    const dialog = screen.getByRole('dialog', { name: 'Игра пройдена' });
    expect(within(dialog).getByText('21 монета · 25 очков опыта · 22 звезды')).toBeInTheDocument();
    expect(within(dialog).queryByText('Площадка «Пляж» открыта')).not.toBeInTheDocument();
  });

  it('keeps the attempt active until the exit prompt is explicitly confirmed', async () => {
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

    expect(screen.queryByRole('button', { name: 'Завершить попытку' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'К бонусным играм' }));
    expect(abandon).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Выйти из бонусной игры?' });
    expect(dialog).toHaveTextContent('При выходе текущая попытка завершится, а прогресс потеряется.');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(abandon).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Выйти из бонусной игры?' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'К бонусным играм' }));
    const confirm = within(
      screen.getByRole('dialog', { name: 'Выйти из бонусной игры?' }),
    ).getByRole('button', { name: 'Выйти' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(abandon).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('location')).toHaveTextContent('/bonus-games/game-1/play');

    pending.resolve(abandoned);
    await waitFor(() => {
      expect(screen.getByLabelText('location')).toHaveTextContent('/bonus-games');
    });
  });

  it('refreshes the catalog after abandoning so another game can start immediately', async () => {
    const abandoned = attempt({
      status: 'abandoned',
      state: 'closed',
      period_started_at: null,
      period_ends_at: null,
    });
    const loadCatalog = vi.fn(async () => 'Можно начать другую игру');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    queryClient.setQueryData(['bonus-games'], 'Активная попытка блокирует другие игры');
    setStore({ abandon: vi.fn(async () => abandoned) });
    renderScreen('/bonus-games/game-1/play?attempt=attempt-1', { queryClient, loadCatalog });

    fireEvent.click(screen.getByRole('button', { name: 'К бонусным играм' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Выйти из бонусной игры?' })).getByRole('button', {
        name: 'Выйти',
      }),
    );

    expect(await screen.findByText('Можно начать другую игру')).toBeInTheDocument();
  });

  it('stays in the game without abandoning when exit is cancelled', () => {
    const abandon = vi.fn(async () => null);
    setStore({ abandon });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'К бонусным играм' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Выйти из бонусной игры?' })).getByRole('button', {
        name: 'Остаться',
      }),
    );

    expect(abandon).not.toHaveBeenCalled();
    expect(screen.getByLabelText('location')).toHaveTextContent('/bonus-games/game-1/play');
    expect(screen.queryByRole('dialog', { name: 'Выйти из бонусной игры?' })).toBeNull();
  });

  it('keeps the active rink simulation running while the exit prompt is open', () => {
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'К бонусным играм' }));

    expect(screen.getByRole('dialog', { name: 'Выйти из бонусной игры?' })).toBeInTheDocument();
    expect(playViewProbe.mock.calls.at(-1)?.[0]).toMatchObject({
      active: true,
      suppressedByModal: false,
    });
  });

  it('traps the abandon modal and restores the exact gameplay trigger after Escape', async () => {
    renderScreen();
    const trigger = screen.getByRole('button', { name: 'К бонусным играм' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Выйти из бонусной игры?' });
    const cancel = within(dialog).getByRole('button', { name: 'Остаться' });
    const confirm = within(dialog).getByRole('button', { name: 'Выйти' });
    await waitFor(() => expect(cancel).toHaveFocus());
    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Выйти из бонусной игры?' })).toBeNull(),
    );
    expect(trigger).toHaveFocus();
  });

  it('stays in the attempt when authoritative abandon does not succeed', async () => {
    const abandon = vi.fn(async () => null);
    setStore({ abandon });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'К бонусным играм' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Выйти из бонусной игры?' })).getByRole('button', {
        name: 'Выйти',
      }),
    );

    await waitFor(() => expect(abandon).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('location')).toHaveTextContent('/bonus-games/game-1/play');
    expect(screen.getByRole('dialog', { name: 'Выйти из бонусной игры?' })).toBeInTheDocument();
  });
});
