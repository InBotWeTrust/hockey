import { describe, expect, it, vi } from 'vitest';
import { scheduleDailyCompletionSideEffect } from '../../src/duel/daily/completionSideEffects.js';

describe('scheduleDailyCompletionSideEffect', () => {
  it('does not hold the final-shot response open while tournament aggregation is pending', () => {
    const sideEffect = vi.fn(() => new Promise<void>(() => undefined));

    expect(scheduleDailyCompletionSideEffect(sideEffect, vi.fn())).toBeUndefined();
    expect(sideEffect).toHaveBeenCalledTimes(1);
  });
});
