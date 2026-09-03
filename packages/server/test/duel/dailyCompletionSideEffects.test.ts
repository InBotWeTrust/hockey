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
