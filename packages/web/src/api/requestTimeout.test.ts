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

  it('retries an opted-in lost request once after a responsive unchanged snapshot', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const request = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? neverSettles<{ shots: number }>() : Promise.resolve({ shots: 18 });
    });
    const reconcile = vi.fn(async () => ({ shots: 17 }));
    const result = withGameRequestReconciliation({
      request, reconcile, isReconciled: state => state.shots >= 18,
      retryOnceOnUnchanged: true,
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(request).toHaveBeenCalledTimes(2);
    await expect(result).resolves.toEqual({ kind: 'request', value: { shots: 18 } });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(signals[0]!.aborted).toBe(true);
  });

  it('ignores the retired request abort while the replacement is still pending', async () => {
    vi.useFakeTimers();
    let finishRetry!: (value: { shots: number }) => void;
    let calls = 0;
    const request = vi.fn((signal: AbortSignal) => {
      if (calls++ === 0) return new Promise<{ shots: number }>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
      return new Promise<{ shots: number }>(resolve => { finishRetry = resolve; });
    });
    const result = withGameRequestReconciliation({ request,
      reconcile: async () => ({ shots: 17 }), isReconciled: state => state.shots >= 18,
      retryOnceOnUnchanged: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(request).toHaveBeenCalledTimes(2);
    finishRetry({ shots: 18 });
    await expect(result).resolves.toEqual({ kind: 'request', value: { shots: 18 } });
  });

  it('never resends an operation already confirmed by the server', async () => {
    vi.useFakeTimers();
    const request = vi.fn(() => neverSettles<{ shots: number }>());
    const result = withGameRequestReconciliation({ request,
      reconcile: async () => ({ shots: 18 }), isReconciled: state => state.shots >= 18,
      retryOnceOnUnchanged: true });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toEqual({ kind: 'reconciled', value: { shots: 18 } });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('never resends a definitively rejected operation', async () => {
    vi.useFakeTimers();
    const error = { status: 409 };
    const request = vi.fn(async () => { throw error; });
    const result = withGameRequestReconciliation({ request,
      reconcile: async () => ({ shots: 17 }), isReconciled: state => state.shots >= 18,
      isRequestErrorDefinitive: isDefinitiveGameRequestError, retryOnceOnUnchanged: true });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toEqual({ kind: 'unreconciled', value: { shots: 17 }, error });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('bounds a safe retry and retains one overall deadline if neither request arrives', async () => {
    vi.useFakeTimers();
    const request = vi.fn(() => neverSettles<{ shots: number }>());
    const result = withGameRequestReconciliation({
      request, reconcile: async () => ({ shots: 17 }), isReconciled: state => state.shots >= 18,
      retryOnceOnUnchanged: true,
    });
    const rejected = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(12000);
    await rejected;
    expect(request).toHaveBeenCalledTimes(2);
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
