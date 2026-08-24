import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BonusAttemptResponse,
  BonusGameAttempt,
  BonusShotRequest,
} from '../api/bonusGames.js';
import {
  abandonBonusAttempt,
  fetchCurrentBonusAttempt,
  startBonusPeriod,
  submitBonusShot,
} from '../api/bonusGames.js';
import { ApiError } from '../api/apiFetch.js';
import { useBonusGameStore } from './bonusGameStore.js';

vi.mock('../api/bonusGames.js', () => ({
  abandonBonusAttempt: vi.fn(),
  fetchCurrentBonusAttempt: vi.fn(),
  startBonusPeriod: vi.fn(),
  submitBonusShot: vi.fn(),
}));

const initialAttempt: BonusGameAttempt = {
  id: 'attempt-1',
  game_id: 'game-1',
  game_slug: 'beach',
  game_title: 'Пляжный бросок',
  status: 'active',
  state: 'period_active',
  current_period: 1,
  period_started_at: '2026-08-24T10:00:00.000Z',
  period_ends_at: '2026-08-24T10:20:00.000Z',
  break_started_at: null,
  break_ends_at: null,
  closed_at: null,
  shots_taken: 2,
  goals: 1,
  attempt_seed: 'bonus:attempt-1',
  game_core_version: 1,
  definition_revision: 3,
  server_now: '2026-08-24T10:01:00.000Z',
  rules: {
    game_id: 'game-1',
    slug: 'beach',
    title: 'Пляжный бросок',
    revision: 3,
    target_goals: 3,
    total_periods: 1,
    break_duration_ms: 30_000,
    periods: [
      {
        period_number: 1,
        duration_ms: 1_200_000,
        shots_limit: 3,
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
  reward: { coins: 100, stars: 2, experience: 50 },
  arena: {
    id: 'arena-1',
    slug: 'beach',
    title: 'Пляж',
    artwork_url: '/arenas/beach.webp',
    thumbnail_url: '/arenas/beach-thumb.webp',
  },
  goalkeeper_ready_url: '/goalies/beach-ready.webp',
  goalkeeper_save_url: '/goalies/beach-save.webp',
};

const shot: BonusShotRequest = {
  claimed_shot_index: 3,
  input: { tapTime: 250, shooterTapTime: 250 },
  claimed_result: 'goal',
};

function response(attempt: BonusGameAttempt): BonusAttemptResponse {
  return { attempt };
}

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

describe('bonusGameStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBonusGameStore.setState({
      attempt: null,
      loading: false,
      error: null,
      errorCode: null,
      inFlight: false,
      needsReconcile: false,
    });
  });

  it('blocks the next shot after an uncertain network failure until refresh succeeds', async () => {
    // This catches removing the reconciliation lock after a request whose commit status is unknown.
    vi.mocked(submitBonusShot).mockRejectedValueOnce(new TypeError('network'));
    vi.mocked(fetchCurrentBonusAttempt).mockResolvedValueOnce(response(initialAttempt));
    useBonusGameStore.getState().applyState(initialAttempt);

    await useBonusGameStore.getState().submitShot(shot);

    expect(useBonusGameStore.getState().needsReconcile).toBe(true);
    expect(useBonusGameStore.getState().canSubmitShot()).toBe(false);

    await useBonusGameStore.getState().refresh();

    expect(useBonusGameStore.getState().needsReconcile).toBe(false);
    expect(useBonusGameStore.getState().attempt).toEqual(initialAttempt);
  });

  it('keeps the rejected shot code and lock when its reconciliation request fails', async () => {
    // This catches clearing a stable stale-shot branch before a replacement server state exists.
    const staleError = new ApiError(
      409,
      'bonus_shot_index_mismatch',
      'Бросок уже обработан. Обновляем состояние попытки.',
    );
    vi.mocked(submitBonusShot).mockRejectedValueOnce(staleError);
    vi.mocked(fetchCurrentBonusAttempt)
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(response(initialAttempt));
    useBonusGameStore.getState().applyState(initialAttempt);

    await useBonusGameStore.getState().submitShot(shot);
    await useBonusGameStore.getState().refresh();

    expect(useBonusGameStore.getState()).toMatchObject({
      error: staleError.message,
      errorCode: 'bonus_shot_index_mismatch',
      needsReconcile: true,
    });

    await useBonusGameStore.getState().refresh();

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: initialAttempt,
      error: null,
      errorCode: null,
      needsReconcile: false,
    });
  });

  it('does not let a refresh started before a shot overwrite its newer server state', async () => {
    // This catches a late GET replacing a successful shot response with a stale accepted-shot count.
    const staleRefresh = deferred<BonusAttemptResponse>();
    const afterShot = { ...initialAttempt, shots_taken: 3, goals: 2 };
    vi.mocked(fetchCurrentBonusAttempt).mockReturnValueOnce(staleRefresh.promise);
    vi.mocked(submitBonusShot).mockResolvedValueOnce({
      server_result: 'goal',
      attempt: afterShot,
      reward_granted: false,
      balances: { coins: 10, stars: 2, experience: 7 },
    });
    useBonusGameStore.getState().applyState(initialAttempt);

    const refresh = useBonusGameStore.getState().refresh();
    await useBonusGameStore.getState().submitShot(shot);
    staleRefresh.resolve(response(initialAttempt));
    await refresh;

    expect(useBonusGameStore.getState().attempt).toEqual(afterShot);
  });

  it('does not let a refresh started before a period start overwrite its newer server state', async () => {
    // This catches a late GET moving an authoritative started period back to idle.
    const staleRefresh = deferred<BonusAttemptResponse>();
    const idleAttempt = { ...initialAttempt, state: 'idle' as const, current_period: 0 };
    vi.mocked(fetchCurrentBonusAttempt).mockReturnValueOnce(staleRefresh.promise);
    vi.mocked(startBonusPeriod).mockResolvedValueOnce(response(initialAttempt));
    useBonusGameStore.getState().applyState(idleAttempt);

    const refresh = useBonusGameStore.getState().refresh();
    await useBonusGameStore.getState().startPeriod();
    staleRefresh.resolve(response(idleAttempt));
    await refresh;

    expect(useBonusGameStore.getState().attempt).toEqual(initialAttempt);
  });

  it('does not let a refresh started before abandon overwrite its newer server state', async () => {
    // This catches a late GET resurrecting an attempt after its server-confirmed abandon.
    const staleRefresh = deferred<BonusAttemptResponse>();
    const abandonedAttempt = {
      ...initialAttempt,
      status: 'abandoned' as const,
      state: 'closed' as const,
      closed_at: '2026-08-24T10:02:00.000Z',
    };
    vi.mocked(fetchCurrentBonusAttempt).mockReturnValueOnce(staleRefresh.promise);
    vi.mocked(abandonBonusAttempt).mockResolvedValueOnce(response(abandonedAttempt));
    useBonusGameStore.getState().applyState(initialAttempt);

    const refresh = useBonusGameStore.getState().refresh();
    await useBonusGameStore.getState().abandon();
    staleRefresh.resolve(response(initialAttempt));
    await refresh;

    expect(useBonusGameStore.getState().attempt).toEqual(abandonedAttempt);
  });

  it('replaces an optimistic shot with the authoritative shot response', async () => {
    // This catches retaining a locally claimed goal when the server resolved a save.
    const authoritativeAttempt = { ...initialAttempt, shots_taken: 3, goals: 1 };
    vi.mocked(submitBonusShot).mockResolvedValueOnce({
      server_result: 'save',
      attempt: authoritativeAttempt,
      reward_granted: false,
      balances: { coins: 10, stars: 2, experience: 7 },
    });
    useBonusGameStore.getState().applyState(initialAttempt);

    useBonusGameStore.getState().optimisticAddShot('goal');
    await useBonusGameStore.getState().submitShot(shot);

    expect(useBonusGameStore.getState().attempt).toEqual(authoritativeAttempt);
    expect(useBonusGameStore.getState().needsReconcile).toBe(false);
  });

  it('sends one shot while the first submission is still pending', async () => {
    // This catches replacing the synchronous ref guard with a React-render-timed state guard.
    let resolveShot:
      | ((value: {
          server_result: 'goal' | 'save' | 'miss';
          attempt: BonusGameAttempt;
          reward_granted: boolean;
          balances: { coins: number; stars: number; experience: number };
        }) => void)
      | undefined;
    vi.mocked(submitBonusShot).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveShot = resolve;
      }),
    );
    useBonusGameStore.getState().applyState(initialAttempt);

    const first = useBonusGameStore.getState().submitShot(shot);
    const second = useBonusGameStore.getState().submitShot(shot);

    expect(await second).toBeNull();
    expect(submitBonusShot).toHaveBeenCalledTimes(1);

    resolveShot?.({
      server_result: 'goal',
      attempt: { ...initialAttempt, shots_taken: 3, goals: 2 },
      reward_granted: false,
      balances: { coins: 10, stars: 2, experience: 7 },
    });
    await first;
  });

  it('uses the response from a period start as the only next attempt state', async () => {
    // This catches calculating the next period locally instead of using the server transition.
    const idleAttempt = { ...initialAttempt, state: 'idle' as const, current_period: 0 };
    const activeAttempt = { ...initialAttempt, shots_taken: 0, goals: 0 };
    vi.mocked(startBonusPeriod).mockResolvedValueOnce(response(activeAttempt));
    useBonusGameStore.getState().applyState(idleAttempt);

    const result = await useBonusGameStore.getState().startPeriod();

    expect(result).toEqual(activeAttempt);
    expect(useBonusGameStore.getState().attempt).toEqual(activeAttempt);
  });

  it('uses the response from abandon as the only terminal attempt state', async () => {
    // This catches inventing an abandoned state without the server confirmation.
    const abandonedAttempt = {
      ...initialAttempt,
      status: 'abandoned' as const,
      state: 'closed' as const,
      closed_at: '2026-08-24T10:02:00.000Z',
    };
    vi.mocked(abandonBonusAttempt).mockResolvedValueOnce(response(abandonedAttempt));
    useBonusGameStore.getState().applyState(initialAttempt);

    const result = await useBonusGameStore.getState().abandon();

    expect(result).toEqual(abandonedAttempt);
    expect(useBonusGameStore.getState().attempt).toEqual(abandonedAttempt);
  });
});
