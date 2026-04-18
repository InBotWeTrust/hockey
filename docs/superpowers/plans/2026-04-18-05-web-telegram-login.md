# Plan 5: Web Telegram Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить Telegram Login Widget в React-клиенте, хранить JWT-сессию и автоматически обновлять access-токен на 401.

**Architecture:** Zustand-хранилище `useAuthStore` (persist → localStorage) держит `accessToken`, `refreshToken`, `user`. Единый fetch-клиент `apiFetch` добавляет `Authorization: Bearer`, на 401 делает одноразовый refresh-retry и при провале чистит стор. TanStack Query управляет мутациями `/auth/telegram` / `/auth/refresh` / `/auth/logout` и запросом `/me`. Telegram Widget встраивается через динамический `<script>` с глобальным колбэком; маршруты вне `/login` завёрнуты в `<PrivateRoute>`.

**Tech Stack:** React 18, react-router-dom 6, Zustand 4 (persist), TanStack Query 5, Vite 5, vitest + jsdom + Testing Library, Telegram Login Widget (`telegram-widget.js`).

**Server contract (Plan 4B, already merged):**
- `POST /api/auth/telegram` — body: Telegram widget payload → `{ accessToken, refreshToken, user: { id, displayName } }`
- `POST /api/auth/refresh` — body: `{ refreshToken }` → `{ accessToken, refreshToken }`
- `POST /api/auth/logout` — body: `{ refreshToken? }` → 204
- `GET /api/me` — Bearer access → `{ id, displayName }`, 401 if missing/invalid

---

## File Structure

**Create:**
- `packages/web/src/auth/authStore.ts` — Zustand store с persist
- `packages/web/src/auth/authStore.test.ts`
- `packages/web/src/api/apiFetch.ts` — fetch-обёртка с Bearer + 401 refresh-retry
- `packages/web/src/api/apiFetch.test.ts`
- `packages/web/src/auth/TelegramLoginButton.tsx` — встраивает виджет
- `packages/web/src/auth/TelegramLoginButton.test.tsx`
- `packages/web/src/screens/LoginScreen.tsx`
- `packages/web/src/screens/LoginScreen.test.tsx`
- `packages/web/src/auth/PrivateRoute.tsx`
- `packages/web/src/auth/PrivateRoute.test.tsx`
- `packages/web/src/auth/useLogout.ts`
- `packages/web/src/auth/useLogout.test.ts`
- `packages/web/src/app/AppHeader.tsx`
- `packages/web/src/app/AppHeader.test.tsx`
- `packages/web/src/vite-env.d.ts` — типы для `import.meta.env`

**Modify:**
- `packages/web/package.json` — добавить `@tanstack/react-query`
- `packages/web/src/app/App.tsx` — QueryClientProvider, `/login`, guarded routes, header
- `packages/web/src/app/App.test.tsx` — учитывает guard и провайдер
- `.env.example` — `VITE_TELEGRAM_BOT_USERNAME=`

---

## Task 1: Dependencies + Vite env types

**Files:**
- Modify: `packages/web/package.json`
- Create: `packages/web/src/vite-env.d.ts`
- Modify: `.env.example`

- [ ] **Step 1: Добавить зависимость**

```bash
pnpm --filter @hockey/web add @tanstack/react-query@^5.28.0
```

- [ ] **Step 2: Обновить `.env.example`**

Добавить после существующих переменных:

```
# Web (Vite) — bot username without @, used by Telegram Login Widget
VITE_TELEGRAM_BOT_USERNAME=your_bot_username
```

- [ ] **Step 3: Типы для env**

Создать `packages/web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEGRAM_BOT_USERNAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Проверить typecheck**

Run: `pnpm --filter @hockey/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/package.json packages/web/src/vite-env.d.ts pnpm-lock.yaml .env.example
git commit -m "feat(web): add @tanstack/react-query and Telegram bot username env"
```

---

## Task 2: Auth store (Zustand + persist)

**Files:**
- Create: `packages/web/src/auth/authStore.ts`
- Test: `packages/web/src/auth/authStore.test.ts`

- [ ] **Step 1: Failing test**

`packages/web/src/auth/authStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore.js';

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
  });

  it('starts empty', () => {
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.isAuthenticated()).toBe(false);
  });

  it('setSession stores tokens and user', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Alice' },
    });
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('a');
    expect(s.refreshToken).toBe('r');
    expect(s.user).toEqual({ id: 'u1', displayName: 'Alice' });
    expect(s.isAuthenticated()).toBe(true);
  });

  it('clearSession wipes everything', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Alice' },
    });
    useAuthStore.getState().clearSession();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.isAuthenticated()).toBe(false);
  });

  it('persists to localStorage', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Alice' },
    });
    const raw = localStorage.getItem('hockey.auth');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.accessToken).toBe('a');
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm --filter @hockey/web test -- src/auth/authStore.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement store**

`packages/web/src/auth/authStore.ts`:

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  displayName: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (s: AuthSession) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user }),
      clearSession: () => set({ accessToken: null, refreshToken: null, user: null }),
      isAuthenticated: () => Boolean(get().accessToken),
    }),
    {
      name: 'hockey.auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
    },
  ),
);
```

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @hockey/web test -- src/auth/authStore.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/auth/authStore.ts packages/web/src/auth/authStore.test.ts
git commit -m "feat(web): add persistent auth store with access/refresh tokens"
```

---

## Task 3: API fetch wrapper (Bearer + 401 refresh-retry)

**Files:**
- Create: `packages/web/src/api/apiFetch.ts`
- Test: `packages/web/src/api/apiFetch.test.ts`

**Design notes:** единый `apiFetch(path, init)`; добавляет `Authorization: Bearer <access>` если есть. При 401 делает ровно один параллельно-безопасный refresh (используя in-flight promise), потом повторяет оригинальный запрос. Если refresh провалился или нет refreshToken — чистит стор и пробрасывает ошибку `ApiError`.

- [ ] **Step 1: Failing test**

`packages/web/src/api/apiFetch.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiFetch, ApiError, __resetRefreshStateForTests } from './apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';

function mockJson(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    __resetRefreshStateForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends Authorization header when token present', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'acc',
      refreshToken: 'ref',
      user: { id: 'u', displayName: 'A' },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJson({ ok: 1 }));
    const data = await apiFetch<{ ok: number }>('/me');
    expect(data).toEqual({ ok: 1 });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/me');
    const headers = new Headers(init!.headers);
    expect(headers.get('Authorization')).toBe('Bearer acc');
  });

  it('skips Authorization header when no token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJson({ ok: 1 }));
    await apiFetch('/anything');
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers(init!.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('throws ApiError on non-2xx without refresh', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockJson({ error: 'bad_request', message: 'nope' }, { status: 400 }),
    );
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('retries original request once after successful refresh', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'stale',
      refreshToken: 'ref',
      user: { id: 'u', displayName: 'A' },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const authHeader = new Headers(init?.headers ?? {}).get('Authorization');
      if (url.endsWith('/auth/refresh')) {
        return mockJson({ accessToken: 'fresh', refreshToken: 'ref2' });
      }
      if (authHeader === 'Bearer fresh') {
        return mockJson({ ok: true });
      }
      return mockJson({ error: 'unauthenticated' }, { status: 401 });
    });

    const data = await apiFetch<{ ok: boolean }>('/me');
    expect(data).toEqual({ ok: true });
    expect(useAuthStore.getState().accessToken).toBe('fresh');
    expect(useAuthStore.getState().refreshToken).toBe('ref2');
    const calls = fetchSpy.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['/api/me', '/api/auth/refresh', '/api/me']);
  });

  it('clears session and throws if refresh fails', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'stale',
      refreshToken: 'ref',
      user: { id: 'u', displayName: 'A' },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/auth/refresh')) {
        return mockJson({ error: 'unauthenticated' }, { status: 401 });
      }
      return mockJson({ error: 'unauthenticated' }, { status: 401 });
    });

    await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('does not retry when refreshToken absent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockJson({ error: 'unauthenticated' }, { status: 401 }),
    );
    await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm --filter @hockey/web test -- src/api/apiFetch.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

`packages/web/src/api/apiFetch.ts`:

```ts
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
    // ignore
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

function buildHeaders(init: RequestInit | undefined, token: string | null): Headers {
  const h = new Headers(init?.headers ?? {});
  if (!h.has('content-type') && init?.body && typeof init.body === 'string') {
    h.set('content-type', 'application/json');
  }
  if (token) h.set('Authorization', `Bearer ${token}`);
  return h;
}

async function rawRequest(path: string, init: RequestInit | undefined, token: string | null): Promise<Response> {
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
```

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @hockey/web test -- src/api/apiFetch.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/api/apiFetch.ts packages/web/src/api/apiFetch.test.ts
git commit -m "feat(web): add apiFetch wrapper with Bearer auth and 401 refresh-retry"
```

---

## Task 4: Telegram Login Widget component

**Files:**
- Create: `packages/web/src/auth/TelegramLoginButton.tsx`
- Test: `packages/web/src/auth/TelegramLoginButton.test.tsx`

**Design notes:** компонент вставляет `<script src="https://telegram.org/js/telegram-widget.js?22">` в свой контейнер с нужными `data-*` атрибутами. Колбэк пробрасывается через глобальный `window.onTelegramAuth<unique>` (имя с id, чтобы не конфликтовать), который передаёт payload в пропс `onAuth`. В тестах мы не грузим настоящий скрипт — проверяем, что контейнер создан с правильными атрибутами и что `onAuth` вызывается при ручном вызове глобального колбэка.

- [ ] **Step 1: Failing test**

`packages/web/src/auth/TelegramLoginButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelegramLoginButton } from './TelegramLoginButton.js';

type AuthCallback = (payload: Record<string, unknown>) => void;
type WindowWithCallbacks = typeof window & Record<string, AuthCallback | undefined>;

describe('TelegramLoginButton', () => {
  beforeEach(() => {
    const w = window as WindowWithCallbacks;
    Object.keys(w)
      .filter((k) => k.startsWith('onTelegramAuth'))
      .forEach((k) => {
        w[k] = undefined;
      });
  });

  it('renders a container with the telegram script attributes', () => {
    render(<TelegramLoginButton botUsername="test_bot" onAuth={() => {}} />);
    const container = screen.getByTestId('telegram-login-container');
    const script = container.querySelector('script');
    expect(script).not.toBeNull();
    expect(script!.getAttribute('data-telegram-login')).toBe('test_bot');
    expect(script!.getAttribute('data-request-access')).toBe('write');
    expect(script!.getAttribute('data-onauth')).toMatch(/^onTelegramAuth/);
    expect(script!.getAttribute('src')).toContain('telegram.org/js/telegram-widget.js');
  });

  it('invokes onAuth when global callback fires', () => {
    const onAuth = vi.fn();
    render(<TelegramLoginButton botUsername="test_bot" onAuth={onAuth} />);
    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const cbName = script.getAttribute('data-onauth')!;
    const w = window as WindowWithCallbacks;
    const cb = w[cbName];
    expect(cb).toBeTypeOf('function');
    cb!({ id: 42, first_name: 'Alice', auth_date: 1, hash: 'x' });
    expect(onAuth).toHaveBeenCalledWith({
      id: 42,
      first_name: 'Alice',
      auth_date: 1,
      hash: 'x',
    });
  });

  it('renders fallback when botUsername is empty', () => {
    render(<TelegramLoginButton botUsername="" onAuth={() => {}} />);
    expect(screen.getByText(/login is not configured/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm --filter @hockey/web test -- src/auth/TelegramLoginButton.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

`packages/web/src/auth/TelegramLoginButton.tsx`:

```tsx
import { useEffect, useId, useRef } from 'react';

export interface TelegramAuthPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  [key: string]: unknown;
}

export interface TelegramLoginButtonProps {
  botUsername: string;
  onAuth: (payload: TelegramAuthPayload) => void;
  cornerRadius?: number;
  size?: 'small' | 'medium' | 'large';
}

type AuthCallback = (payload: TelegramAuthPayload) => void;
type WindowWithCallbacks = typeof window & Record<string, AuthCallback | undefined>;

export function TelegramLoginButton({
  botUsername,
  onAuth,
  cornerRadius = 12,
  size = 'large',
}: TelegramLoginButtonProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rawId = useId();
  const callbackName = `onTelegramAuth_${rawId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  useEffect(() => {
    if (!botUsername) return;
    const container = containerRef.current;
    if (!container) return;

    const w = window as WindowWithCallbacks;
    w[callbackName] = (payload) => onAuth(payload);

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', size);
    script.setAttribute('data-radius', String(cornerRadius));
    script.setAttribute('data-onauth', `${callbackName}(user)`);
    script.setAttribute('data-request-access', 'write');
    container.appendChild(script);

    return () => {
      w[callbackName] = undefined;
      if (script.parentNode === container) {
        container.removeChild(script);
      }
    };
  }, [botUsername, onAuth, callbackName, cornerRadius, size]);

  if (!botUsername) {
    return <div role="alert">Telegram login is not configured.</div>;
  }

  return <div ref={containerRef} data-testid="telegram-login-container" />;
}
```

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @hockey/web test -- src/auth/TelegramLoginButton.test.tsx`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/auth/TelegramLoginButton.tsx packages/web/src/auth/TelegramLoginButton.test.tsx
git commit -m "feat(web): add TelegramLoginButton that embeds the widget"
```

---

## Task 5: LoginScreen with mutation

**Files:**
- Create: `packages/web/src/screens/LoginScreen.tsx`
- Test: `packages/web/src/screens/LoginScreen.test.tsx`

**Design notes:** LoginScreen читает `VITE_TELEGRAM_BOT_USERNAME`, рендерит TelegramLoginButton. При колбэке из виджета вызывает `useMutation` который POSTит в `/auth/telegram` и на успехе сохраняет сессию и редиректит на `/`.

- [ ] **Step 1: Failing test**

`packages/web/src/screens/LoginScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from './LoginScreen.js';
import { useAuthStore } from '../auth/authStore.js';

type AuthCallback = (payload: Record<string, unknown>) => void;
type WindowWithCallbacks = typeof window & Record<string, AuthCallback | undefined>;

function renderWith(): { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/" element={<div>home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client };
}

describe('LoginScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_TELEGRAM_BOT_USERNAME', 'test_bot');
    vi.restoreAllMocks();
  });

  it('renders the Telegram button', () => {
    renderWith();
    expect(screen.getByTestId('telegram-login-container')).toBeInTheDocument();
  });

  it('exchanges payload for session and navigates home', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'a',
          refreshToken: 'r',
          user: { id: 'u1', displayName: 'Alice' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderWith();
    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const cbName = script.getAttribute('data-onauth')!.replace('(user)', '');
    const cb = (window as WindowWithCallbacks)[cbName]!;
    cb({ id: 42, first_name: 'Alice', auth_date: 1, hash: 'x' });

    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe('a');
    });
    await waitFor(() => {
      expect(screen.getByText('home')).toBeInTheDocument();
    });
  });

  it('shows an error message on failed login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthenticated', message: 'bad hash' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWith();
    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const cbName = script.getAttribute('data-onauth')!.replace('(user)', '');
    const cb = (window as WindowWithCallbacks)[cbName]!;
    cb({ id: 42, first_name: 'Alice', auth_date: 1, hash: 'bad' });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/bad hash|unauthenticated|login failed/i);
    });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm --filter @hockey/web test -- src/screens/LoginScreen.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

`packages/web/src/screens/LoginScreen.tsx`:

```tsx
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TelegramLoginButton, type TelegramAuthPayload } from '../auth/TelegramLoginButton.js';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { useAuthStore, type AuthSession } from '../auth/authStore.js';

export function LoginScreen(): JSX.Element {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '';

  const mutation = useMutation<AuthSession, Error, TelegramAuthPayload>({
    mutationFn: (payload) =>
      apiFetch<AuthSession>('/auth/telegram', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (session) => {
      setSession(session);
      navigate('/', { replace: true });
    },
  });

  return (
    <main style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Ultimate Hockey</h1>
      <p>Войдите через Telegram, чтобы начать тренировку.</p>
      <TelegramLoginButton
        botUsername={botUsername}
        onAuth={(payload) => mutation.mutate(payload)}
      />
      {mutation.isPending && <p>Проверяем профиль…</p>}
      {mutation.isError && (
        <p role="alert" style={{ color: '#b00020' }}>
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'Login failed'}
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @hockey/web test -- src/screens/LoginScreen.test.tsx`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/screens/LoginScreen.tsx packages/web/src/screens/LoginScreen.test.tsx
git commit -m "feat(web): add LoginScreen that exchanges Telegram payload for session"
```

---

## Task 6: PrivateRoute guard

**Files:**
- Create: `packages/web/src/auth/PrivateRoute.tsx`
- Test: `packages/web/src/auth/PrivateRoute.test.tsx`

- [ ] **Step 1: Failing test**

`packages/web/src/auth/PrivateRoute.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute.js';
import { useAuthStore } from './authStore.js';

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <div>secret</div>
            </PrivateRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PrivateRoute', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
  });

  it('renders children when authenticated', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    renderAt('/');
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    renderAt('/');
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret')).toBeNull();
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm --filter @hockey/web test -- src/auth/PrivateRoute.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

`packages/web/src/auth/PrivateRoute.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './authStore.js';

export function PrivateRoute({ children }: { children: ReactNode }): JSX.Element {
  const isAuth = useAuthStore((s) => Boolean(s.accessToken));
  const location = useLocation();
  if (!isAuth) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @hockey/web test -- src/auth/PrivateRoute.test.tsx`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/auth/PrivateRoute.tsx packages/web/src/auth/PrivateRoute.test.tsx
git commit -m "feat(web): add PrivateRoute guard redirecting to /login"
```

---

## Task 7: Logout hook + AppHeader + wire App

**Files:**
- Create: `packages/web/src/auth/useLogout.ts`
- Test: `packages/web/src/auth/useLogout.test.tsx` (uses JSX wrapper)
- Create: `packages/web/src/app/AppHeader.tsx`
- Test: `packages/web/src/app/AppHeader.test.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/app/App.test.tsx`

### 7a — useLogout

- [ ] **Step 1: Failing test**

`packages/web/src/auth/useLogout.test.tsx` (uses JSX wrapper):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useLogout } from './useLogout.js';
import { useAuthStore } from './authStore.js';

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useLogout', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('calls POST /auth/logout with refresh token and clears session', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/auth/logout');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ refreshToken: 'r' });
  });

  it('clears session even when server errors', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('net down'));

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });

    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm --filter @hockey/web test -- src/auth/useLogout.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

`packages/web/src/auth/useLogout.ts`:

```ts
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore.js';

export function useLogout(): () => Promise<void> {
  const navigate = useNavigate();
  return useCallback(async () => {
    const { refreshToken, clearSession } = useAuthStore.getState();
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // fire-and-forget
    }
    clearSession();
    navigate('/login', { replace: true });
  }, [navigate]);
}
```

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @hockey/web test -- src/auth/useLogout.test.tsx`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/auth/useLogout.ts packages/web/src/auth/useLogout.test.tsx
git commit -m "feat(web): add useLogout hook that revokes refresh and clears session"
```

### 7b — AppHeader

- [ ] **Step 6: Failing test**

`packages/web/src/app/AppHeader.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from './AppHeader.js';
import { useAuthStore } from '../auth/authStore.js';

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('renders nothing when no user', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('shows display name and a logout button', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'Alice' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /logout|выйти/i }));
    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBeNull();
    });
  });
});
```

- [ ] **Step 7: Verify it fails**

Run: `pnpm --filter @hockey/web test -- src/app/AppHeader.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 8: Implement**

`packages/web/src/app/AppHeader.tsx`:

```tsx
import { useAuthStore } from '../auth/authStore.js';
import { useLogout } from '../auth/useLogout.js';

export function AppHeader(): JSX.Element | null {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  if (!user) return null;
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 1rem',
        borderBottom: '1px solid #ddd',
      }}
    >
      <span>{user.displayName}</span>
      <button type="button" onClick={() => void logout()}>
        Выйти
      </button>
    </header>
  );
}
```

- [ ] **Step 9: Verify green**

Run: `pnpm --filter @hockey/web test -- src/app/AppHeader.test.tsx`
Expected: PASS (2/2)

- [ ] **Step 10: Commit**

```bash
git add packages/web/src/app/AppHeader.tsx packages/web/src/app/AppHeader.test.tsx
git commit -m "feat(web): add AppHeader with user name and logout button"
```

### 7c — Wire App.tsx

- [ ] **Step 11: Update App and its test**

`packages/web/src/app/App.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DuelScreen } from '../screens/DuelScreen.js';
import { GoalieListScreen } from '../screens/GoalieListScreen.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import { PrivateRoute } from '../auth/PrivateRoute.js';
import { AppHeader } from './AppHeader.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppHeader />
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <GoalieListScreen />
              </PrivateRoute>
            }
          />
          <Route
            path="/duel/:goalieId"
            element={
              <PrivateRoute>
                <DuelScreen />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

`packages/web/src/app/App.test.tsx` (replace existing):

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from '../screens/LoginScreen.js';
import { PrivateRoute } from '../auth/PrivateRoute.js';
import { useAuthStore } from '../auth/authStore.js';

function renderAt(path: string): void {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <main>home content</main>
              </PrivateRoute>
            }
          />
          <Route
            path="/duel/:goalieId"
            element={
              <PrivateRoute>
                <main>duel content</main>
              </PrivateRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App routing + auth', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
  });

  it('redirects unauthenticated users from / to /login', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /ultimate hockey/i })).toBeInTheDocument();
  });

  it('shows home content when authenticated', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    renderAt('/');
    expect(screen.getByText('home content')).toBeInTheDocument();
  });

  it('guards /duel/:goalieId as well', () => {
    renderAt('/duel/rookie');
    expect(screen.queryByText('duel content')).toBeNull();
    expect(screen.getByRole('heading', { name: /ultimate hockey/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Run web tests, expect all green**

Run: `pnpm --filter @hockey/web test`
Expected: PASS (all tests across existing + new modules)

- [ ] **Step 13: Full typecheck and build**

Run: `pnpm typecheck && pnpm --filter @hockey/web build`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add packages/web/src/app/App.tsx packages/web/src/app/App.test.tsx
git commit -m "feat(web): wire QueryClientProvider, login route, and PrivateRoute guards"
```

---

## Task 8: README + manual smoke

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Добавить секцию после существующей «Auth (Telegram)»:

```md
### Web (Telegram login)

1. В `.env` (в корне) пропиши `VITE_TELEGRAM_BOT_USERNAME=<username без @>`.
2. Убедись, что бот в BotFather связан с доменом, по которому запущен фронт (для dev — например `hockey.local` в BotFather → Domain).
3. `pnpm dev:server` + `pnpm dev:web` → открой `http://localhost:5173/login`. Войди через Telegram.
4. Access + refresh токены хранятся в `localStorage['hockey.auth']`. Для выхода — кнопка «Выйти» в шапке или `localStorage.clear()`.
```

- [ ] **Step 2: Final sanity checks**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS across all packages.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add Telegram login dev instructions for web"
```

---

## Out of Scope (explicitly deferred)

- **VK OAuth** — будет в Plan 4C позже.
- **Интеграция /me в стор** — пока `displayName` приходит с `/auth/telegram`; перезапрос `/me` добавим, когда появится edit-профиль.
- **Global error toasts / React Query devtools** — отложено, не блокирует MVP.
- **Session expiration UX** (тост «сессия истекла») — apiFetch чистит стор, но явного toast пока нет; минимально устраивает redirect через PrivateRoute.
