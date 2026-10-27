import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { createMatch, type BarGameSnapshot } from '@hockey/game-core';
import { useAuthStore } from '../auth/authStore.js';
import { submitInitialTrainingShot } from '../api/initialTraining.js';
import {
  submitAdvancedTrainingShot,
  submitAdvancedTrainingV2Shot,
} from '../api/advancedTraining.js';
import { gameApi } from '../bar/games/api.js';
import { useGameMatch } from '../bar/games/useGameMatch.js';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it.each(['initial', 'advanced', 'advanced-v2'])(
  '%s shot settles when a network response never arrives',
  async (kind) => {
    vi.useFakeTimers();
    useAuthStore.setState({ accessToken: 'synthetic-audit', refreshToken: null });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const body = {
      run_id: '11111111-1111-4111-8111-111111111111',
      shot_index: 1,
      input: { tapTime: 120, shooterTapTime: 100 },
      claimed_result: 'goal' as const,
    };
    let settled = false;
    const request =
      kind === 'initial'
        ? submitInitialTrainingShot('first-shot', body)
        : kind === 'advanced'
          ? submitAdvancedTrainingShot('board-side', body)
          : submitAdvancedTrainingV2Shot('near_goalie', { ...body, movement_id: 'movement-1' });
    void request.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(60000);
    expect(settled).toBe(true);
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  },
);
const view = (): BarGameSnapshot => ({
  id: 'audit',
  kind: 'billiards',
  player: 0,
  character: null,
  participants: [],
  ready: null,
  serverNow: Date.now(),
  runtime: createMatch('billiards', 0, Date.now(), false, 1),
});
it('a stalled bar read releases polling for recovery', async () => {
  vi.useFakeTimers();
  const recovered = view();
  let lateRead!: (snapshot: BarGameSnapshot) => void;
  const read = vi
    .spyOn(gameApi, 'read')
    .mockImplementationOnce(() => new Promise(resolve => { lateRead = resolve; }))
    .mockResolvedValue(recovered);
  const { result } = renderHook(() => useGameMatch('audit'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(read.mock.calls.length).toBeGreaterThan(1);
  expect(result.current.view).toEqual(recovered);
  expect(result.current.error).toBeNull();
  expect(read.mock.calls[0]?.[1]?.aborted).toBe(true);
  await act(async () => { lateRead({...recovered, runtime: {...recovered.runtime, revision: 99}}); });
  expect(result.current.view).toEqual(recovered);
});
it('a stalled bar command becomes retryable without losing its identity', async () => {
  vi.useFakeTimers();
  vi.spyOn(gameApi, 'read').mockResolvedValue(view());
  const command = vi
    .spyOn(gameApi, 'command')
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValue(view());
  const { result } = renderHook(() => useGameMatch('audit'));
  await act(async () => {});
  act(() => result.current.send({ type: 'shot', angle: 0, power: 0.5 }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(result.current.busy).toBe(true);
  expect(result.current.uncertain).toBe(true);
  const original = command.mock.calls[0]![1];
  await act(async () => {
    result.current.retry();
  });
  expect(command.mock.calls[1]![1]).toEqual(original);
  expect(result.current.busy).toBe(false);
  expect(result.current.uncertain).toBe(false);
});

it.each(['initial', 'advanced', 'advanced-v2'])(
  '%s recovers the original shot receipt without changing its payload',
  async (kind) => {
    vi.useFakeTimers();
    useAuthStore.setState({ accessToken: 'synthetic-audit', refreshToken: null });
    const receipt = { server_result: 'goal', state: { shots_taken: 1 } };
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 200 }));
    const body = {
      run_id: '11111111-1111-4111-8111-111111111111',
      shot_index: 1,
      input: { tapTime: 120, shooterTapTime: 100 },
      claimed_result: 'goal' as const,
    };
    let result: unknown = null;
    const request =
      kind === 'initial'
        ? submitInitialTrainingShot('first-shot', body)
        : kind === 'advanced'
          ? submitAdvancedTrainingShot('board-side', body)
          : submitAdvancedTrainingV2Shot('near_goalie', { ...body, movement_id: 'movement-1' });
    void request.then(
      (value) => {
        result = value;
      },
      () => {},
    );
    body.input.tapTime = 999; // Later UI changes must not alter the receipt replay.
    await vi.advanceTimersByTimeAsync(2500);
    expect(result).toEqual(receipt);
    expect(fetch.mock.calls[1]?.[1]?.body).toEqual(fetch.mock.calls[0]?.[1]?.body);
  },
);
