import { useAuthStore } from '../auth/authStore.js';

const API_BASE = '/api';
const GENERIC_SERVER_ERROR_MESSAGE = 'Не удалось выполнить запрос. Попробуйте ещё раз.';

const SERVER_ERROR_MESSAGES: Record<string, string> = {
  telegram_already_linked: 'Аккаунт уже занят',
  vk_already_linked: 'Аккаунт уже занят',
  unsupported_media_type: 'Формат файла не поддерживается. Загрузите JPG, PNG, WebP или GIF.',
  FST_ERR_CTP_INVALID_MEDIA_TYPE:
    'Формат файла не поддерживается. Загрузите JPG, PNG, WebP или GIF.',
  'open duel already exists for this opponent': 'С этим игроком уже есть открытая дуэль.',
  bonus_level_locked: 'Бонус-игры доступны после открытия любительского уровня.',
  bonus_previous_game_required: 'Сначала завершите предыдущую бонус-игру.',
  bonus_purchase_required: 'Сначала откройте эту бонус-игру.',
  bonus_insufficient_stars: 'Недостаточно звёзд для открытия бонус-игры.',
  bonus_price_changed: 'Цена игры изменилась. Проверьте каталог и подтвердите открытие снова.',
  bonus_game_inactive: 'Эта бонус-игра сейчас недоступна.',
  bonus_attempt_already_active: 'У вас уже есть незавершённая бонус-попытка.',
  bonus_attempt_not_active: 'Эта бонус-попытка больше не активна.',
  bonus_period_not_ready: 'Сейчас нельзя начать или продолжить этот период.',
  bonus_shot_index_mismatch: 'Бросок уже обработан. Обновляем состояние попытки.',
  bonus_shot_result_mismatch: 'Результат броска уточнён сервером.',
  bonus_game_core_version_mismatch: 'Версия игры изменилась. Обновите попытку.',
  bonus_shot_time_invalid: 'Время броска указано неверно.',
  bonus_shot_time_stale: 'Время броска устарело. Обновляем состояние попытки.',
  arena_not_owned: 'Эта домашняя площадка ещё не открыта.',
  arena_not_selectable: 'Эту домашнюю площадку сейчас нельзя выбрать.',
  arena_unavailable: 'Домашняя площадка временно недоступна.',
};

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

function localizeServerError(message: string, code: string): string {
  return (
    SERVER_ERROR_MESSAGES[message] ?? SERVER_ERROR_MESSAGES[code] ?? GENERIC_SERVER_ERROR_MESSAGE
  );
}

let refreshInFlight: Promise<string | null> | null = null;

export function __resetRefreshStateForTests(): void {
  refreshInFlight = null;
}

async function parseError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = `HTTP ${res.status}`;
  try {
    // Server (errorsPlugin) sends `{ error: { code, message } }`. Older
    // callers/tests may still send the flat `{ error, message }` shape, so
    // accept both.
    const body = (await res.json()) as {
      error?: string | { code?: string; message?: string };
      message?: string;
    };
    if (typeof body.error === 'string') {
      code = body.error;
    } else if (body.error && typeof body.error === 'object') {
      if (body.error.code) code = body.error.code;
      if (body.error.message) message = body.error.message;
    }
    if (body.message) message = body.message;
  } catch {
    // ignore body parse failures
  }
  return new ApiError(res.status, code, localizeServerError(message, code));
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

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
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
