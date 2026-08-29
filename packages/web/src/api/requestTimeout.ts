export const GAME_REQUEST_TIMEOUT_MS = 12_000;

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
