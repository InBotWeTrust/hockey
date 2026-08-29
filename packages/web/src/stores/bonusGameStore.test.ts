import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BonusAttemptResponse,
  BonusGameAttempt,
  BonusShotRequest,
  BonusShotResponse,
} from '../api/bonusGames.js';
import {
  abandonBonusAttempt,
  acknowledgeBonusPreview,
  fetchBonusAttempt,
  fetchCurrentBonusAttempt,
  startBonusPeriod,
  submitBonusShot,
} from '../api/bonusGames.js';
import { ApiError } from '../api/apiFetch.js';
import { useBonusGameStore } from './bonusGameStore.js';

vi.mock('../api/bonusGames.js', () => ({
  abandonBonusAttempt: vi.fn(),
  acknowledgeBonusPreview: vi.fn(),
  fetchBonusAttempt: vi.fn(),
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
  current_period_shots_taken: 2,
  goals: 1,
  current_goal_streak: 1,
  best_goal_streak: 1,
  preview_required: false,
  current_loadout: null,
  reward_granted: false,
  attempt_seed: 'bonus:attempt-1',
  game_core_version: 1,
  definition_revision: 3,
  server_now: '2026-08-24T10:01:00.000Z',
  rules: {
    game_id: 'game-1',
    slug: 'beach',
    title: 'Пляжный бросок',
    skill_code: 'accuracy',
    revision: 3,
    target_goals: 3,
    qualification_rules: { type: 'goals_from_shots', targetGoals: 3, shotsLimit: 3 },
    total_periods: 1,
    break_duration_ms: 30_000,
    use_inventory: false,
    preview_title: 'Первая квалификация',
    preview_story: 'История',
    preview_artwork_url: '/bonus-games/previews/beach.webp',
    preview_revision: 1,
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
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
}

function rejectWhenAborted<T>(signal: AbortSignal | undefined): Promise<T> {
  return new Promise<T>((_resolve, reject) => {
    signal?.addEventListener(
      'abort',
      () => reject(new DOMException('The operation was aborted.', 'AbortError')),
      { once: true },
    );
  });
}

describe('bonusGameStore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useBonusGameStore.setState({
      attempt: null,
      loading: false,
      error: null,
      errorCode: null,
      inFlight: false,
      needsReconcile: false,
      requestEpoch: 0,
      receivedAtPerformanceMs: null,
      pendingShot: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('captures the client receipt clock when an authoritative response is installed', async () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(4_321);
    vi.mocked(fetchCurrentBonusAttempt).mockResolvedValueOnce(response(initialAttempt));

    await useBonusGameStore.getState().loadCurrent();

    expect(useBonusGameStore.getState().receivedAtPerformanceMs).toBe(4_321);
    nowSpy.mockRestore();
  });

  it('acknowledges the preview and installs the returned attempt', async () => {
    const previewAttempt = { ...initialAttempt, preview_required: true };
    const acknowledged = { ...previewAttempt, preview_required: false };
    vi.mocked(acknowledgeBonusPreview).mockResolvedValueOnce(response(acknowledged));
    useBonusGameStore.getState().applyState(previewAttempt);

    await useBonusGameStore.getState().acknowledgePreview(true);

    expect(acknowledgeBonusPreview).toHaveBeenCalledWith(previewAttempt.id, true);
    expect(useBonusGameStore.getState().attempt).toEqual(acknowledged);
  });

  it('loads a terminal attempt by id so timer reconciliation cannot discard the result', async () => {
    const failedAttempt = {
      ...initialAttempt,
      status: 'failed' as const,
      state: 'closed' as const,
      period_started_at: null,
      period_ends_at: null,
    };
    vi.mocked(fetchBonusAttempt).mockResolvedValueOnce(response(failedAttempt));
    useBonusGameStore.getState().applyState(initialAttempt);

    const result = await useBonusGameStore.getState().loadAttempt(initialAttempt.id);

    expect(fetchBonusAttempt).toHaveBeenCalledWith(initialAttempt.id);
    expect(result).toEqual(failedAttempt);
    expect(useBonusGameStore.getState().attempt).toEqual(failedAttempt);
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

  it('applies only R2 when R1 resolves before the later current-attempt read', async () => {
    // This catches treating two reads from the same server-state revision as equally current.
    const r1 = deferred<BonusAttemptResponse>();
    const r2 = deferred<BonusAttemptResponse>();
    const staleAttempt = { ...initialAttempt, shots_taken: 1, goals: 0 };
    const freshAttempt = { ...initialAttempt, shots_taken: 3, goals: 2 };
    vi.mocked(fetchCurrentBonusAttempt)
      .mockReturnValueOnce(r1.promise)
      .mockReturnValueOnce(r2.promise);
    useBonusGameStore.getState().applyState(initialAttempt);

    const first = useBonusGameStore.getState().refresh();
    const second = useBonusGameStore.getState().refresh();
    r1.resolve(response(staleAttempt));
    await first;

    expect(useBonusGameStore.getState().attempt).toEqual(initialAttempt);
    expect(useBonusGameStore.getState().loading).toBe(true);

    r2.resolve(response(freshAttempt));
    await second;

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: freshAttempt,
      loading: false,
    });
  });

  it('ignores R1 when R2 resolves first and R1 arrives late', async () => {
    // This catches an older response resurrecting state after the latest read already applied.
    const r1 = deferred<BonusAttemptResponse>();
    const r2 = deferred<BonusAttemptResponse>();
    const staleAttempt = { ...initialAttempt, shots_taken: 1, goals: 0 };
    const freshAttempt = { ...initialAttempt, shots_taken: 3, goals: 2 };
    vi.mocked(fetchCurrentBonusAttempt)
      .mockReturnValueOnce(r1.promise)
      .mockReturnValueOnce(r2.promise);
    useBonusGameStore.getState().applyState(initialAttempt);

    const first = useBonusGameStore.getState().refresh();
    const second = useBonusGameStore.getState().refresh();
    r2.resolve(response(freshAttempt));
    await second;
    r1.resolve(response(staleAttempt));
    await first;

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: freshAttempt,
      loading: false,
    });
  });

  it('invalidates both outstanding reads when a newer shot response installs state', async () => {
    // This catches either pre-shot read applying after the mutation has become authoritative.
    const r1 = deferred<BonusAttemptResponse>();
    const r2 = deferred<BonusAttemptResponse>();
    const afterShot = { ...initialAttempt, shots_taken: 3, goals: 2 };
    vi.mocked(fetchCurrentBonusAttempt)
      .mockReturnValueOnce(r1.promise)
      .mockReturnValueOnce(r2.promise);
    vi.mocked(submitBonusShot).mockResolvedValueOnce({
      server_result: 'goal',
      attempt: afterShot,
      reward_granted: false,
      balances: { coins: 10, stars: 2, experience: 7 },
    });
    useBonusGameStore.getState().applyState(initialAttempt);

    const first = useBonusGameStore.getState().refresh();
    const second = useBonusGameStore.getState().refresh();
    await useBonusGameStore.getState().submitShot(shot);
    r1.resolve(response({ ...initialAttempt, shots_taken: 1, goals: 0 }));
    r2.resolve(response(initialAttempt));
    await Promise.all([first, second]);

    expect(useBonusGameStore.getState().attempt).toEqual(afterShot);
  });

  it('does not let an obsolete read failure clear loading or error for the newer read', async () => {
    // This catches a stale catch branch ending the loading state belonging to R2.
    const r1 = deferred<BonusAttemptResponse>();
    const r2 = deferred<BonusAttemptResponse>();
    const staleError = new ApiError(
      409,
      'bonus_shot_index_mismatch',
      'Бросок уже обработан. Обновляем состояние попытки.',
    );
    vi.mocked(fetchCurrentBonusAttempt)
      .mockReturnValueOnce(r1.promise)
      .mockReturnValueOnce(r2.promise);
    useBonusGameStore.setState({
      attempt: initialAttempt,
      error: staleError.message,
      errorCode: staleError.code,
      needsReconcile: true,
    });

    const first = useBonusGameStore.getState().refresh();
    const second = useBonusGameStore.getState().refresh();
    r1.reject(new TypeError('network'));
    await first;

    expect(useBonusGameStore.getState()).toMatchObject({
      loading: true,
      error: staleError.message,
      errorCode: staleError.code,
      needsReconcile: true,
    });

    r2.resolve(response(initialAttempt));
    await second;

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: initialAttempt,
      loading: false,
      error: null,
      errorCode: null,
      needsReconcile: false,
    });
  });

  it('invalidates a refresh begun during a rejected shot until a fresh refresh succeeds', async () => {
    // This catches the during-shot read clearing a new ambiguity lock after the shot rejects.
    const shotRequest = deferred<BonusShotResponse>();
    const duringShotRead = deferred<BonusAttemptResponse>();
    const staleError = new ApiError(
      409,
      'bonus_shot_index_mismatch',
      'Бросок уже обработан. Обновляем состояние попытки.',
    );
    vi.mocked(submitBonusShot).mockReturnValueOnce(shotRequest.promise);
    vi.mocked(fetchCurrentBonusAttempt)
      .mockReturnValueOnce(duringShotRead.promise)
      .mockResolvedValueOnce(response(initialAttempt));
    useBonusGameStore.getState().applyState(initialAttempt);

    const submit = useBonusGameStore.getState().submitShot(shot);
    const staleRead = useBonusGameStore.getState().refresh();
    shotRequest.reject(staleError);
    await submit;

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: initialAttempt,
      loading: false,
      error: staleError.message,
      errorCode: staleError.code,
      needsReconcile: true,
    });

    duringShotRead.resolve(response({ ...initialAttempt, shots_taken: 1, goals: 0 }));
    await staleRead;

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: initialAttempt,
      error: staleError.message,
      errorCode: staleError.code,
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

  it('keeps a newer refresh pending when the obsolete during-start read rejects', async () => {
    // This catches an invalidated read failure ending the fresh post-failure reconciliation spinner.
    const startRequest = deferred<BonusAttemptResponse>();
    const duringStartRead = deferred<BonusAttemptResponse>();
    const freshRead = deferred<BonusAttemptResponse>();
    const idleAttempt = { ...initialAttempt, state: 'idle' as const, current_period: 0 };
    const staleError = new ApiError(
      409,
      'bonus_period_not_ready',
      'Сейчас нельзя начать или продолжить этот период.',
    );
    vi.mocked(startBonusPeriod).mockReturnValueOnce(startRequest.promise);
    vi.mocked(fetchCurrentBonusAttempt)
      .mockReturnValueOnce(duringStartRead.promise)
      .mockReturnValueOnce(freshRead.promise);
    useBonusGameStore.getState().applyState(idleAttempt);

    const start = useBonusGameStore.getState().startPeriod();
    const staleRead = useBonusGameStore.getState().refresh();
    startRequest.reject(staleError);
    await start;
    const freshReconcile = useBonusGameStore.getState().refresh();
    duringStartRead.reject(new TypeError('network'));
    await staleRead;

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: idleAttempt,
      loading: true,
      error: staleError.message,
      errorCode: staleError.code,
      needsReconcile: true,
    });

    freshRead.resolve(response(initialAttempt));
    await freshReconcile;

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: initialAttempt,
      loading: false,
      error: null,
      errorCode: null,
      needsReconcile: false,
    });
  });

  it('invalidates a refresh begun during a rejected abandon attempt', async () => {
    // This catches a late GET resurrecting an attempt after its abandon result is ambiguous.
    const abandonRequest = deferred<BonusAttemptResponse>();
    const duringAbandonRead = deferred<BonusAttemptResponse>();
    const staleError = new ApiError(
      409,
      'bonus_attempt_not_active',
      'Эта бонус-попытка больше не активна.',
    );
    vi.mocked(abandonBonusAttempt).mockReturnValueOnce(abandonRequest.promise);
    vi.mocked(fetchCurrentBonusAttempt).mockReturnValueOnce(duringAbandonRead.promise);
    useBonusGameStore.getState().applyState(initialAttempt);

    const abandon = useBonusGameStore.getState().abandon();
    const staleRead = useBonusGameStore.getState().refresh();
    abandonRequest.reject(staleError);
    await abandon;
    duringAbandonRead.resolve(response({ ...initialAttempt, shots_taken: 1, goals: 0 }));
    await staleRead;

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: initialAttempt,
      loading: false,
      error: staleError.message,
      errorCode: staleError.code,
      needsReconcile: true,
    });
  });

  it('replaces an optimistic shot with the authoritative shot response', async () => {
    // This catches retaining a locally claimed goal when the server resolved a save.
    let performanceNow = 500;
    vi.spyOn(performance, 'now').mockImplementation(() => performanceNow);
    const authoritativeAttempt = { ...initialAttempt, shots_taken: 3, goals: 1 };
    vi.mocked(submitBonusShot).mockResolvedValueOnce({
      server_result: 'save',
      attempt: authoritativeAttempt,
      reward_granted: false,
      balances: { coins: 10, stars: 2, experience: 7 },
    });
    useBonusGameStore.getState().applyState(initialAttempt);

    useBonusGameStore.getState().optimisticAddShot('goal');
    expect(useBonusGameStore.getState().attempt?.current_period_shots_taken).toBe(3);
    const submit = useBonusGameStore.getState().submitShot(shot);
    performanceNow = 1_000;
    await submit;
    performanceNow = 4_321;

    expect(useBonusGameStore.getState().attempt).toEqual(authoritativeAttempt);
    expect(useBonusGameStore.getState().needsReconcile).toBe(false);
    expect(useBonusGameStore.getState().pendingShot).toBeNull();
    expect(useBonusGameStore.getState().inFlight).toBe(false);
    expect(useBonusGameStore.getState().receivedAtPerformanceMs).toBe(1_000);
  });

  it('silently restores authoritative state when a shot request is rejected', async () => {
    const staleError = new ApiError(
      409,
      'bonus_shot_time_stale',
      'Бросок уже обработан. Обновляем состояние попытки.',
    );
    vi.mocked(submitBonusShot).mockRejectedValueOnce(staleError);
    vi.mocked(fetchBonusAttempt).mockResolvedValueOnce(response(initialAttempt));
    useBonusGameStore.getState().applyState(initialAttempt);
    useBonusGameStore.getState().optimisticAddShot('goal');

    await useBonusGameStore.getState().submitShot(shot);

    expect(fetchBonusAttempt).toHaveBeenCalledWith(initialAttempt.id, {
      signal: expect.any(AbortSignal),
    });
    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: initialAttempt,
      error: null,
      errorCode: null,
      needsReconcile: false,
      inFlight: false,
      pendingShot: null,
    });
  });

  it('recovers a completed attempt when the final-shot response stalls', async () => {
    vi.useFakeTimers();
    const completedAttempt: BonusGameAttempt = {
      ...initialAttempt,
      status: 'completed',
      state: 'closed',
      period_started_at: null,
      period_ends_at: null,
      closed_at: '2026-08-24T10:01:01.000Z',
      shots_taken: 3,
      current_period_shots_taken: 3,
      goals: 3,
      current_goal_streak: 3,
      best_goal_streak: 3,
      reward_granted: true,
    };
    vi.mocked(submitBonusShot).mockImplementation((...args) => {
      const options = (args as unknown as [string, BonusShotRequest, { signal?: AbortSignal }])[2];
      return rejectWhenAborted<BonusShotResponse>(options?.signal);
    });
    vi.mocked(fetchBonusAttempt).mockResolvedValueOnce(response(completedAttempt));
    useBonusGameStore.getState().applyState(initialAttempt);

    const submit = useBonusGameStore.getState().submitShot(shot, { deferApply: true });
    await vi.advanceTimersByTimeAsync(12_000);
    await submit;

    expect(fetchBonusAttempt).toHaveBeenCalledWith(initialAttempt.id, {
      signal: expect.any(AbortSignal),
    });
    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: completedAttempt,
      pendingShot: null,
      inFlight: false,
      needsReconcile: false,
    });
  });

  it('releases a stalled final shot when both submission and reconciliation time out', async () => {
    vi.useFakeTimers();
    vi.mocked(submitBonusShot).mockImplementation((...args) => {
      const options = (args as unknown as [string, BonusShotRequest, { signal?: AbortSignal }])[2];
      return rejectWhenAborted<BonusShotResponse>(options?.signal);
    });
    vi.mocked(fetchBonusAttempt).mockImplementation((...args) => {
      const options = (args as unknown as [string, { signal?: AbortSignal }])[1];
      return rejectWhenAborted<BonusAttemptResponse>(options?.signal);
    });
    useBonusGameStore.getState().applyState(initialAttempt);

    const submit = useBonusGameStore.getState().submitShot(shot, { deferApply: true });
    await vi.advanceTimersByTimeAsync(24_000);
    await submit;

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: initialAttempt,
      pendingShot: null,
      inFlight: false,
      needsReconcile: true,
      error: 'Не удалось отправить бросок.',
    });
    expect(useBonusGameStore.getState().canSubmitShot()).toBe(false);
  });

  it('defers an authoritative shot response until the visual boundary applies it once', async () => {
    // This catches terminal or break state replacing the play screen while the puck is still flying.
    let performanceNow = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => performanceNow);
    const failedAttempt = {
      ...initialAttempt,
      status: 'failed' as const,
      state: 'closed' as const,
      period_started_at: null,
      period_ends_at: null,
      closed_at: '2026-08-24T10:01:01.000Z',
      shots_taken: 3,
      current_period_shots_taken: 3,
    };
    const shotRequest = deferred<BonusShotResponse>();
    vi.mocked(submitBonusShot).mockReturnValueOnce(shotRequest.promise);
    useBonusGameStore.getState().applyState(initialAttempt);
    useBonusGameStore.getState().optimisticAddShot('goal');
    const optimisticAttempt = useBonusGameStore.getState().attempt;
    const receiptBeforeBoundary = useBonusGameStore.getState().receivedAtPerformanceMs;

    const submit = useBonusGameStore.getState().submitShot(shot, { deferApply: true });
    performanceNow = 1_000;
    shotRequest.resolve({
      server_result: 'save',
      attempt: failedAttempt,
      reward_granted: false,
      balances: { coins: 10, stars: 2, experience: 7 },
    });
    const result = await submit;

    expect(result).toMatchObject({ attempt: failedAttempt, rewardGranted: false });
    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: optimisticAttempt,
      pendingShot: {
        attempt: failedAttempt,
        receivedAtPerformanceMs: 1_000,
      },
      inFlight: true,
      needsReconcile: false,
      receivedAtPerformanceMs: receiptBeforeBoundary,
    });
    expect(useBonusGameStore.getState().canSubmitShot()).toBe(false);
    await useBonusGameStore.getState().refresh();
    await useBonusGameStore.getState().loadAttempt(initialAttempt.id);
    expect(fetchCurrentBonusAttempt).not.toHaveBeenCalled();
    expect(fetchBonusAttempt).not.toHaveBeenCalled();
    expect(useBonusGameStore.getState().pendingShot).toEqual({
      attempt: failedAttempt,
      receivedAtPerformanceMs: 1_000,
    });

    performanceNow = 4_321;
    const applied = useBonusGameStore.getState().applyPendingShot();
    const stateAfterBoundary = useBonusGameStore.getState();

    expect(applied).toEqual(failedAttempt);
    expect(stateAfterBoundary).toMatchObject({
      attempt: failedAttempt,
      pendingShot: null,
      inFlight: false,
      receivedAtPerformanceMs: 1_000,
    });
    expect(useBonusGameStore.getState().applyPendingShot()).toBeNull();
    expect(useBonusGameStore.getState()).toEqual(stateAfterBoundary);
  });

  it('unlocks every deferred response so a speed attempt accepts more than three shots', async () => {
    const speedAttempt: BonusGameAttempt = {
      ...initialAttempt,
      shots_taken: 0,
      current_period_shots_taken: 0,
      goals: 0,
      current_goal_streak: 0,
      best_goal_streak: 0,
      rules: {
        ...initialAttempt.rules,
        skill_code: 'speed',
        target_goals: 18,
        qualification_rules: {
          type: 'goals_in_time',
          targetGoals: 18,
          activeTimeMs: 120_000,
        },
        periods: [
          {
            ...initialAttempt.rules.periods[0]!,
            duration_ms: 120_000,
            shots_limit: null,
          },
        ],
      },
    };
    vi.mocked(submitBonusShot).mockImplementation(async (_attemptId, body) => ({
      server_result: 'goal',
      attempt: {
        ...speedAttempt,
        shots_taken: body.claimed_shot_index,
        current_period_shots_taken: body.claimed_shot_index,
        goals: body.claimed_shot_index,
        current_goal_streak: body.claimed_shot_index,
        best_goal_streak: body.claimed_shot_index,
      },
      reward_granted: false,
      balances: { coins: 10, stars: 2, experience: 7 },
    }));
    useBonusGameStore.getState().applyState(speedAttempt);

    for (let shotIndex = 1; shotIndex <= 4; shotIndex += 1) {
      expect(useBonusGameStore.getState().canSubmitShot()).toBe(true);
      const result = await useBonusGameStore.getState().submitShot(
        { ...shot, claimed_shot_index: shotIndex },
        { deferApply: true },
      );

      expect(result?.attempt.shots_taken).toBe(shotIndex);
      expect(useBonusGameStore.getState().canSubmitShot()).toBe(false);
      useBonusGameStore.getState().applyPendingShot();
      expect(useBonusGameStore.getState().attempt?.shots_taken).toBe(shotIndex);
    }

    expect(submitBonusShot).toHaveBeenCalledTimes(4);
    expect(useBonusGameStore.getState().canSubmitShot()).toBe(true);
  });

  it('invalidates a read started during a deferred shot before applying the pending result', async () => {
    // This catches an in-flight GET replacing either the optimistic frame or the saved terminal DTO.
    let performanceNow = 500;
    vi.spyOn(performance, 'now').mockImplementation(() => performanceNow);
    const shotRequest = deferred<BonusShotResponse>();
    const duringShotRead = deferred<BonusAttemptResponse>();
    const completedAttempt = {
      ...initialAttempt,
      status: 'completed' as const,
      state: 'closed' as const,
      period_started_at: null,
      period_ends_at: null,
      closed_at: '2026-08-24T10:01:01.000Z',
      shots_taken: 3,
      current_period_shots_taken: 3,
      goals: 3,
      reward_granted: true,
    };
    vi.mocked(submitBonusShot).mockReturnValueOnce(shotRequest.promise);
    vi.mocked(fetchCurrentBonusAttempt).mockReturnValueOnce(duringShotRead.promise);
    useBonusGameStore.getState().applyState(initialAttempt);
    useBonusGameStore.getState().optimisticAddShot('goal');
    const optimisticAttempt = useBonusGameStore.getState().attempt;

    const submit = useBonusGameStore.getState().submitShot(shot, { deferApply: true });
    const staleRead = useBonusGameStore.getState().refresh();
    performanceNow = 1_000;
    shotRequest.resolve({
      server_result: 'goal',
      attempt: completedAttempt,
      reward_granted: true,
      balances: { coins: 110, stars: 3, experience: 57 },
    });
    await submit;
    duringShotRead.resolve(response(initialAttempt));
    await staleRead;

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: optimisticAttempt,
      pendingShot: {
        attempt: completedAttempt,
        receivedAtPerformanceMs: 1_000,
      },
      inFlight: true,
    });

    useBonusGameStore.getState().applyPendingShot();
    expect(useBonusGameStore.getState().attempt).toEqual(completedAttempt);
  });

  it('atomically clears a pending shot and its receipt when another authoritative state replaces it', () => {
    const failedAttempt = {
      ...initialAttempt,
      status: 'failed' as const,
      state: 'closed' as const,
      period_started_at: null,
      period_ends_at: null,
    };
    useBonusGameStore.setState({
      pendingShot: { attempt: failedAttempt, receivedAtPerformanceMs: 1_000 },
      inFlight: true,
    });

    useBonusGameStore.getState().applyState(initialAttempt);

    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: initialAttempt,
      pendingShot: null,
    });
  });

  it('applies PlayView authoritative fallback when the deferred slot is no longer available', () => {
    const completedAttempt = {
      ...initialAttempt,
      status: 'completed' as const,
      state: 'closed' as const,
      period_started_at: null,
      period_ends_at: null,
      closed_at: '2026-08-24T10:01:01.000Z',
      shots_taken: 3,
      current_period_shots_taken: 3,
      goals: 3,
      reward_granted: true,
    };
    vi.spyOn(performance, 'now').mockReturnValue(2_000);
    useBonusGameStore.setState({ pendingShot: null, inFlight: true });

    const applied = useBonusGameStore.getState().applyPendingShot(completedAttempt);

    expect(applied).toEqual(completedAttempt);
    expect(useBonusGameStore.getState()).toMatchObject({
      attempt: completedAttempt,
      pendingShot: null,
      inFlight: false,
      receivedAtPerformanceMs: 2_000,
    });
  });

  it('uses a safe fallback for an initial non-API load failure', async () => {
    // This catches browser or parser details leaking into player-visible copy.
    vi.mocked(fetchBonusAttempt).mockRejectedValueOnce(
      new TypeError('Failed to fetch internal /api response body'),
    );

    await useBonusGameStore.getState().loadAttempt(initialAttempt.id);

    expect(useBonusGameStore.getState()).toMatchObject({
      error: 'Не удалось загрузить бонус-попытку.',
      errorCode: null,
    });
    expect(useBonusGameStore.getState().error).not.toContain('Failed to fetch');
    expect(useBonusGameStore.getState().error).not.toContain('/api');
  });

  it('keeps the reconciliation lock and safe copy when its read fails with a raw error', async () => {
    // This catches an ambiguous committed shot becoming retryable or exposing transport internals.
    vi.mocked(submitBonusShot).mockRejectedValueOnce(
      new TypeError('Failed to fetch: upstream JSON was invalid'),
    );
    vi.mocked(fetchBonusAttempt).mockRejectedValueOnce(
      new Error('Unexpected token < in JSON at position 0'),
    );
    useBonusGameStore.getState().applyState(initialAttempt);

    await useBonusGameStore.getState().submitShot(shot);
    await useBonusGameStore.getState().loadAttempt(initialAttempt.id);

    expect(useBonusGameStore.getState()).toMatchObject({
      error: 'Не удалось отправить бросок.',
      errorCode: null,
      needsReconcile: true,
      inFlight: false,
      pendingShot: null,
    });
    expect(useBonusGameStore.getState().canSubmitShot()).toBe(false);
    expect(useBonusGameStore.getState().error).not.toContain('Failed to fetch');
    expect(useBonusGameStore.getState().error).not.toContain('JSON');
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
