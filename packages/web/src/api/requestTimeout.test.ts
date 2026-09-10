import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isDefinitiveGameRequestError,
  withGameRequestReconciliation,
} from './requestTimeout.js';

function neverSettles<T>(): Promise<T> {
  return new Promise(() => undefined);
}

describe('withGameRequestReconciliation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('only treats semantic 4xx responses as definitive rejections', () => {
    expect(isDefinitiveGameRequestError({ status: 409 })).toBe(true);
    expect(isDefinitiveGameRequestError({ status: 502 })).toBe(false);
    expect(isDefinitiveGameRequestError(new SyntaxError('invalid json'))).toBe(false);
    expect(isDefinitiveGameRequestError(new TypeError('network failed'))).toBe(false);
  });

  it('recovers an accepted shot in parallel instead of waiting for two sequential timeouts', async () => {
    vi.useFakeTimers();
    const reconcile = vi.fn(async () => ({ shots: 18, state: 'closed' }));

    const resultPromise = withGameRequestReconciliation({
      request: () => neverSettles<{ server: true }>(),
      reconcile,
      isReconciled: (state) => state.shots >= 18,
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(reconcile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toEqual({
      kind: 'reconciled',
      value: { shots: 18, state: 'closed' },
    });
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('keeps polling while the slow request is pending and the first snapshot is stale', async () => {
    vi.useFakeTimers();
    let reconciliationCount = 0;
    const reconcile = vi.fn(async () => ({
      shots: reconciliationCount++ === 0 ? 17 : 18,
    }));

    const resultPromise = withGameRequestReconciliation({
      request: () => neverSettles<{ server: true }>(),
      reconcile,
      isReconciled: (state) => state.shots >= 18,
    });

    await vi.advanceTimersByTimeAsync(2_750);

    await expect(resultPromise).resolves.toEqual({
      kind: 'reconciled',
      value: { shots: 18 },
    });
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it('returns a confirmed unchanged snapshot after an explicit request rejection', async () => {
    vi.useFakeTimers();
    const error = new Error('shot rejected');

    const resultPromise = withGameRequestReconciliation({
      request: async () => Promise.reject(error),
      reconcile: async () => ({ shots: 17 }),
      isReconciled: (state) => state.shots >= 18,
      isRequestErrorDefinitive: () => true,
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'unreconciled',
      value: { shots: 17 },
      error,
    });
  });

  it('does not treat a terminal snapshot as acceptance after a definitive rejection', async () => {
    vi.useFakeTimers();
    const error = new Error('period already closed');

    const resultPromise = withGameRequestReconciliation({
      request: async () => Promise.reject(error),
      reconcile: async () => ({ shots: 17, state: 'closed' }),
      isReconciled: (state) => state.state === 'closed',
      isRequestErrorDefinitive: () => true,
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'unreconciled',
      value: { shots: 17, state: 'closed' },
      error,
    });
  });

  it('accepts authoritative GET confirmation after an ambiguous 5xx response', async () => {
    vi.useFakeTimers();
    const error = { status: 502, message: 'bad gateway' };

    const resultPromise = withGameRequestReconciliation({
      request: async () => Promise.reject(error),
      reconcile: async () => ({ shots: 18, state: 'closed' }),
      isReconciled: (state) => state.shots >= 18,
      isRequestErrorDefinitive: isDefinitiveGameRequestError,
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'reconciled',
      value: { shots: 18, state: 'closed' },
    });
  });

  it('uses one overall deadline when both submission and reconciliation stall', async () => {
    vi.useFakeTimers();
    const resultPromise = withGameRequestReconciliation({
      request: () => neverSettles<{ server: true }>(),
      reconcile: () => neverSettles<{ shots: number }>(),
      isReconciled: (state) => state.shots >= 18,
    });
    const rejected = expect(resultPromise).rejects.toMatchObject({ name: 'TimeoutError' });

    await vi.advanceTimersByTimeAsync(12_000);

    await rejected;
  });
});
