import { useAuthStore } from '../auth/authStore.js';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshInFlight: Promise<string | null> | null = null;

export function __resetRefreshStateForTests(): void {
  refreshInFlight = null;
}

async function parseError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    if (body.error) code = body.error;
    if (body.message) message = body.message;
  } catch {
    // ignore body parse failures
  }
  return new ApiError(res.status, code, message);
}

async function runRefresh(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { accessToken: string; refreshToken: string };
  const prev = useAuthStore.getState();
  if (!prev.user) return null;
  useAuthStore.getState().setSession({
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    user: prev.user,
  });
  return body.accessToken;
}

async function refreshOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function refreshAccessToken(): Promise<string | null> {
  return refreshOnce();
}

function buildHeaders(init: RequestInit | undefined, token: string | null): Headers {
  const h = new Headers(init?.headers ?? {});
  if (!h.has('content-type') && init?.body && typeof init.body === 'string') {
    h.set('content-type', 'application/json');
  }
  if (token) h.set('Authorization', `Bearer ${token}`);
  return h;
}

async function rawRequest(
  path: string,
  init: RequestInit | undefined,
  token: string | null,
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: buildHeaders(init, token),
  });
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  let res = await rawRequest(path, init, token);

  if (res.status === 401 && useAuthStore.getState().refreshToken) {
    const newToken = await refreshOnce();
    if (!newToken) {
      useAuthStore.getState().clearSession();
      throw await parseError(res);
    }
    res = await rawRequest(path, init, newToken);
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
