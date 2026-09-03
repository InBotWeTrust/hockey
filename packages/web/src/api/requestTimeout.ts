export const GAME_REQUEST_TIMEOUT_MS = 12_000;
export const GAME_RECONCILIATION_DELAY_MS = 2_000;
const GAME_RECONCILIATION_POLL_MS = 750;

export function isDefinitiveGameRequestError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

export interface GameRequestOptions {
  signal?: AbortSignal;
}

export function isGameRequestTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'TimeoutError'
  );
}

export async function withGameRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      const error = new DOMException('The request timed out.', 'TimeoutError');
      reject(error);
      controller.abort(error);
    }, GAME_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export type GameRequestReconciliationResult<TRequest, TReconciled> =
  | { kind: 'request'; value: TRequest }
  | { kind: 'reconciled'; value: TReconciled }
  | { kind: 'unreconciled'; value: TReconciled; error: unknown };

interface GameRequestReconciliationOptions<TRequest, TReconciled> {
  request: (signal: AbortSignal) => Promise<TRequest>;
  reconcile: (signal: AbortSignal) => Promise<TReconciled>;
  isReconciled: (value: TReconciled) => boolean;
  isRequestErrorDefinitive?: (error: unknown) => boolean;
}

export function withGameRequestReconciliation<TRequest, TReconciled>({
  request,
  reconcile,
  isReconciled,
  isRequestErrorDefinitive = () => false,
}: GameRequestReconciliationOptions<
  TRequest,
  TReconciled
>): Promise<GameRequestReconciliationResult<TRequest, TReconciled>> {
  const requestController = new AbortController();
  const reconcileController = new AbortController();

  return new Promise((resolve, reject) => {
    let settled = false;
    let requestError: unknown;
    let requestRejected = false;
    let reconciliationStarted = false;
    let reconciliationTimer: ReturnType<typeof setTimeout> | undefined;

    const timeoutError = (): DOMException =>
      new DOMException('The request timed out.', 'TimeoutError');

    const finish = (
      result: GameRequestReconciliationResult<TRequest, TReconciled>,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      if (reconciliationTimer !== undefined) clearTimeout(reconciliationTimer);
      requestController.abort();
      reconcileController.abort();
      resolve(result);
    };

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      if (reconciliationTimer !== undefined) clearTimeout(reconciliationTimer);
      requestController.abort();
      reconcileController.abort();
      reject(error);
    };

    const poll = async (): Promise<void> => {
      if (settled) return;
      try {
        const value = await reconcile(reconcileController.signal);
        if (settled) return;
        if (requestRejected && isRequestErrorDefinitive(requestError)) {
          finish({ kind: 'unreconciled', value, error: requestError });
          return;
        }
        if (isReconciled(value)) {
          finish({ kind: 'reconciled', value });
          return;
        }
        // A completed error response plus an unchanged authoritative snapshot
        // proves that the shot was not accepted. A merely slow request stays
        // pending and is checked again without blocking on a second timeout.
        if (requestRejected && isRequestErrorDefinitive(requestError)) {
          finish({ kind: 'unreconciled', value, error: requestError });
          return;
        }
      } catch (error) {
        if (settled) return;
        if (requestRejected) {
          fail(requestError ?? error);
          return;
        }
      }
      reconciliationTimer = setTimeout(() => void poll(), GAME_RECONCILIATION_POLL_MS);
    };

    const startReconciliation = (): void => {
      if (settled || reconciliationStarted) return;
      reconciliationStarted = true;
      void poll();
    };

    const overallTimer = setTimeout(() => {
      fail(requestError ?? timeoutError());
    }, GAME_REQUEST_TIMEOUT_MS);

    reconciliationTimer = setTimeout(startReconciliation, GAME_RECONCILIATION_DELAY_MS);

    void request(requestController.signal).then(
      (value) => finish({ kind: 'request', value }),
      (error: unknown) => {
        if (settled) return;
        requestError = error;
        requestRejected = true;
        startReconciliation();
      },
    );
  });
}
