import { describe, expect, it, vi } from 'vitest';
import {
  scheduleDailyCompletionSideEffect,
  waitForDailyCompletionSideEffects,
} from '../../src/duel/daily/completionSideEffects.js';

describe('scheduleDailyCompletionSideEffect', () => {
  it('does not hold the final-shot response open while tournament aggregation is pending', async () => {
    let finishEffect: (() => void) | undefined;
    const sideEffect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishEffect = resolve;
        }),
    );

    expect(scheduleDailyCompletionSideEffect(sideEffect, vi.fn())).toBeUndefined();
    expect(sideEffect).toHaveBeenCalledTimes(1);
    finishEffect?.();
    await waitForDailyCompletionSideEffects();
  });

  it('allows test and shutdown code to drain scheduled effects', async () => {
    let finishEffect: (() => void) | undefined;
    const sideEffect = new Promise<void>((resolve) => {
      finishEffect = resolve;
    });
    scheduleDailyCompletionSideEffect(() => sideEffect, vi.fn());

    let drained = false;
    const drainPromise = waitForDailyCompletionSideEffects().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    finishEffect?.();
    await drainPromise;
    expect(drained).toBe(true);
  });
});

it('coalesces recovery bursts but runs a trailing pass for newly committed events', async () => {
  let release!: () => void;
  const effect = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => {release = resolve;})).mockResolvedValue(undefined);
  const other = vi.fn().mockResolvedValue(undefined);
  scheduleDailyCompletionSideEffect(effect, vi.fn(), 'player-a');
  for (let i = 0; i < 10; i++) scheduleDailyCompletionSideEffect(effect, vi.fn(), 'player-a');
  scheduleDailyCompletionSideEffect(other, vi.fn(), 'player-b');
  expect(effect).toHaveBeenCalledTimes(1);
  expect(other).toHaveBeenCalledTimes(1);
  release();
  await waitForDailyCompletionSideEffects();
  expect(effect).toHaveBeenCalledTimes(2);
  scheduleDailyCompletionSideEffect(effect, vi.fn(), 'player-a');
  await waitForDailyCompletionSideEffects();
  expect(effect).toHaveBeenCalledTimes(3);
});

it('isolates recovery between databases and permits retry after a failure', async () => {
  const effect = vi.fn().mockRejectedValue(new Error('offline'));
  const onError = vi.fn();
  const scopeA = {}, scopeB = {};
  scheduleDailyCompletionSideEffect(effect, onError, 'same-player', scopeA);
  scheduleDailyCompletionSideEffect(effect, onError, 'same-player', scopeB);
  await waitForDailyCompletionSideEffects();
  expect(effect).toHaveBeenCalledTimes(2);
  expect(onError).toHaveBeenCalledTimes(2);
  scheduleDailyCompletionSideEffect(effect, onError, 'same-player', scopeA);
  await waitForDailyCompletionSideEffects();
  expect(effect).toHaveBeenCalledTimes(3);
});
