# Авторизация через VK ID + Supabase JWT — переносимая спецификация

Документ для Клода **в другом проекте**. Описывает, как сделать вход через VK ID OAuth 2.0 (id.vk.com) с PKCE и привязать его к Supabase Auth, чтобы получить JWT и работать с RLS как с обычным юзером Supabase. Реализация-эталон лежит в `KJ CRM`:

- Edge Function: `supabase/functions/pwa-auth/index.ts`
- Клиент: `src/lib/pwa-auth.ts`, `src/pages/AuthCallbackPage.tsx`, `src/contexts/AuthContext.tsx`

> Стек оригинала: **React + Vite + TS + react-router-dom + Supabase (self-hosted с Edge Functions) + supabase-js v2**. Если у тебя другой стек — переноси принципы. Backend-агностичный кусок (PKCE + VK ID) можно использовать с любым сервером, не только Supabase Edge.

---

## 0. Что выбираем и почему

VK предлагает **три** разных протокола авторизации — путаются регулярно:

| Протокол | Endpoint | Когда юзать |
|---|---|---|
| **VK ID OAuth 2.0** ✅ | `id.vk.com/authorize` + `id.vk.com/oauth2/auth` | **Внешние сайты и PWA**. Поддерживает PKCE → не нужен `client_secret` на бэке. |
| VK Mini Apps `bridge` | через JS-SDK внутри `vk.com` | Только если приложение запускается **внутри VK** (vk.com/app...). |
| Старый OAuth `oauth.vk.com` | `oauth.vk.com/authorize` | **Deprecated**, не использовать. Без PKCE, требует `client_secret`. |

Для внешнего сайта/PWA **используй VK ID OAuth с PKCE**. Это то, что описано ниже. Главное преимущество: `client_secret` нигде не светится — ни в браузере, ни в env Edge Function. PKCE заменяет его одноразовым `code_verifier`/`code_challenge`.

Поток (на пальцах):
1. Браузер генерирует случайный `code_verifier` (64 символа) и `code_challenge = base64url(sha256(verifier))`.
2. Редирект на `id.vk.com/authorize?code_challenge=...&client_id=...`.
3. VK логинит юзера, редиректит обратно с `?code=...&device_id=...`.
4. Браузер отправляет `code + code_verifier + device_id` на свой бэк.
5. Бэк дёргает `id.vk.com/oauth2/auth` с этими тремя — VK проверяет, что `sha256(verifier) === challenge`, и отвечает `access_token + user_id`.
6. Бэк по `user_id` ищет своего юзера в БД, выдаёт сессию.

`code_verifier` живёт в `sessionStorage` браузера между шагами 1 и 4 — VK его **не видит**, поэтому только тот же браузер сможет завершить флоу. Атака «украл `code` из URL» не работает: без verifier токен не выдадут.

---

## 1. Регистрация приложения в VK

1. Зайти на https://id.vk.com (или dev.vk.com), создать приложение типа **«Веб-приложение»** (не «Сайт», не «Standalone-приложение» — именно «Веб»).
2. В настройках OAuth указать **Trusted Redirect URIs**:
   - Прод: `https://your-app.com/auth/callback`
   - Прев/стейджинг: `https://staging.your-app.com/auth/callback`
   - **Локал: `http://localhost:5173/auth/callback`** (любой dev-порт, но он должен быть в списке — иначе VK не редиректнет).
   - Можно добавить до 10 URI. Wildcard НЕ поддерживается.
3. Скоупы: для базового профиля (vk_id, имя, фото) скоупы не нужны — оставляй `scope=''`. Для email/телефона — отдельная заявка на модерацию VK.
4. Сохранить **App ID** (это то, что станет `VITE_VK_APP_ID` / `VK_APP_ID`).
5. **`Secure key`/`Service key` НЕ нужны** при PKCE-флоу. Если документация VK или туториалы их требуют — это старый OAuth, не наш.

⚠️ Изменение списка Redirect URIs применяется через ~1-2 минуты. На локалке в Safari/iOS бывает залипание — перезайди в режиме инкогнито.

---

## 2. Архитектура

```
┌──────────┐  1. PKCE+redirect      ┌──────────────┐
│ Browser  │ ─────────────────────► │ id.vk.com    │
│          │                        │ (login UI)   │
│          │ ◄───────────────────── │              │
└────┬─────┘  2. ?code&device_id    └──────────────┘
     │                                                                                               
     │ 3. POST {code, codeVerifier, deviceId, redirectUri}
     ▼
┌──────────────────────────────┐  4. POST id.vk.com/oauth2/auth ┌──────────────┐
│ Edge Function (или ваш API)  │ ──────────────────────────────► │ VK token API │
│ pwa-auth                     │ ◄────────────────────────────── │              │
│                              │  {access_token, user_id}        └──────────────┘
│ 5. lookup user by vk_id      │
│ 6. issue JWT (Supabase или   │
│    свой)                     │
└────┬─────────────────────────┘
     │ 7. {user, session}
     ▼
┌──────────┐
│ Browser  │ supabase.auth.setSession(...)
└──────────┘
```

Ключевая идея последнего шага: после VK ID **бэк не возвращает токен VK клиенту**. Возвращается только `vk_id`, по нему ищется свой пользователь, и **выдаётся внутренняя сессия** (Supabase JWT в нашем случае) — она и используется для всех дальнейших запросов с RLS.

Зачем мост через Supabase Auth (а не самописный JWT)?
- RLS-политики ссылаются на `auth.uid()` — без интеграции с `auth.users` они не сработают.
- Refresh-токены, password recovery, магические ссылки — всё бесплатно из коробки.
- supabase-js на клиенте сам ротирует токены через `setSession`.

Хитрость: Supabase Auth не умеет «логинить по vk_id» нативно (нет VK-провайдера на self-hosted). Решение — **детерминированный пароль**: для каждого `vk_id` генерируется одинаковый email + пароль через HMAC, и используется обычный `signInWithPassword`. Видно только service_role на бэке. Описано в §4.4.

---

## 3. Клиент — VK OAuth + PKCE

### 3.1 Файл `lib/vkAuth.ts`

```ts
const VK_APP_ID = import.meta.env.VITE_VK_APP_ID || '';

// ──────────── PKCE helpers ────────────

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, length);
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = generateRandomString(64);
  const hash = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hash);
  sessionStorage.setItem('vk_code_verifier', codeVerifier);
  return { codeVerifier, codeChallenge };
}

// ──────────── OAuth helpers ────────────

export function getRedirectUri(): string {
  return `${window.location.origin}/auth/callback`;
}

/** Шаг 1-2: редирект юзера на VK ID. */
export async function startVKOAuth(): Promise<void> {
  const { codeChallenge } = await generatePKCE();
  const state = generateRandomString(16);
  sessionStorage.setItem('vk_oauth_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: VK_APP_ID,
    redirect_uri: getRedirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 's256',
    scope: '', // basic profile (vk_id, имя, фото)
  });

  window.location.href = `https://id.vk.com/authorize?${params.toString()}`;
}

/** На callback-странице: вытаскиваем code, device_id, error, state. */
export function extractCodeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('code');
}
export function extractDeviceIdFromUrl(): string {
  return new URLSearchParams(window.location.search).get('device_id') || '';
}
export function extractErrorFromUrl(): string | null {
  const p = new URLSearchParams(window.location.search);
  const error = p.get('error');
  if (!error) return null;
  return p.get('error_description') || error;
}
export function extractStateFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('state');
}

export function getCodeVerifier(): string {
  return sessionStorage.getItem('vk_code_verifier') || '';
}
export function getStoredState(): string {
  return sessionStorage.getItem('vk_oauth_state') || '';
}
export function cleanupOAuthState(): void {
  sessionStorage.removeItem('vk_code_verifier');
  sessionStorage.removeItem('vk_oauth_state');
}
```

### 3.2 Кнопка «Войти через VK» на странице логина

```tsx
import { startVKOAuth } from '../lib/vkAuth';

<button onClick={() => startVKOAuth()}>Войти через ВКонтакте</button>
```

Никаких подтверждений, спиннеров, форм — нажал и сразу `window.location.href = ...`. Browser tab уйдёт на VK.

### 3.3 Callback страница `/auth/callback`

В роутере:
```tsx
<Route path="/auth/callback" element={<AuthCallbackPage />} />
```

Сама страница:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  extractCodeFromUrl, extractErrorFromUrl, extractDeviceIdFromUrl,
  extractStateFromUrl, getCodeVerifier, getStoredState,
  getRedirectUri, cleanupOAuthState,
} from '../lib/vkAuth';

export const AuthCallbackPage = () => {
  const { signInWithVKOAuth } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    // Защита от React StrictMode double-invoke + от повторного маунта.
    // VK code одноразовый — второй обмен вернёт invalid_grant.
    if (calledRef.current) return;
    calledRef.current = true;

    (async () => {
      const oauthError = extractErrorFromUrl();
      if (oauthError) { cleanupOAuthState(); setError(oauthError); return; }

      const code = extractCodeFromUrl();
      if (!code) { cleanupOAuthState(); setError('Отсутствует код авторизации'); return; }

      const stateInUrl = extractStateFromUrl();
      const storedState = getStoredState();
      if (!stateInUrl || stateInUrl !== storedState) {
        cleanupOAuthState();
        setError('Несовпадение state — возможна CSRF атака');
        return;
      }

      const codeVerifier = getCodeVerifier();
      const deviceId = extractDeviceIdFromUrl();
      const redirectUri = getRedirectUri();

      try {
        await signInWithVKOAuth(code, redirectUri, codeVerifier, deviceId);
        cleanupOAuthState();
        // дальше навигацию делает корневой роутер по факту наличия user
      } catch (err) {
        cleanupOAuthState();
        setError(err instanceof Error ? err.message : 'Ошибка авторизации');
      }
    })();
  }, [signInWithVKOAuth]);

  if (error) {
    return (
      <div className="p-8 text-center">
        <h1>Ошибка</h1>
        <p>{error}</p>
        <button onClick={() => navigate('/login')}>Назад ко входу</button>
      </div>
    );
  }
  return <div className="p-8 text-center">Авторизация через VK...</div>;
};
```

### 3.4 Грабли клиента

1. **`calledRef`** обязателен. В dev React StrictMode эффекты прогоняются дважды → второй обмен `code` упадёт `invalid_grant: Authorization code already used`. На проде то же самое возможно при двойном маунте на slow connection.
2. **`state`** проверяй на совпадение с тем, что положил в `sessionStorage`. Без этой проверки сайт уязвим к CSRF — атакующий может «запихнуть» свой `code` в URL жертвы.
3. **`device_id`** возвращается VK ID **в URL** на callback. Старый VK OAuth его не использовал — не путай. **Без `device_id` exchange упадёт**.
4. **PKCE-токены через sessionStorage**, НЕ localStorage. sessionStorage уничтожается на закрытии вкладки → меньше шансов на утечку. Cookies тоже плохо: VK редиректит на ваш домен, поэтому cookies придут, но они подвержены SameSite-проблемам в WebView.
5. **iOS PWA standalone**: после редиректа VK браузер может открыть страницу не в standalone, а в Safari — это сломает PWA-сессию. Лечится через `target="_self"` (default), но тестируй на реальном айфоне.

---

## 4. Бэк: Edge Function (или ваш сервер)

### 4.1 Что должна сделать функция

Принимает: `{ code, redirectUri, codeVerifier, deviceId }`.

1. **Обменять `code` на `vk_id`** через `id.vk.com/oauth2/auth`.
2. **Загрузить профиль** через `id.vk.com/oauth2/user_info` (имя, аватар).
3. **Найти пользователя** в своей БД по `vk_id`.
4. Если **нет** — вернуть `{ status: 'not_registered', vk_user_id }` (UI покажет «вас нет в базе, обратитесь к админу»). **Не создавать юзеров автоматически.**
5. Если **есть, но неактивный** — вернуть тот же `not_registered`. (См. §4.5 — club membership gate.)
6. Если **есть и активный** — создать/обновить запись в `auth.users` (см. §4.4), обновить `last_login` + VK имя/аватар, вернуть `{ status: 'ok', user, session }`.

### 4.2 Env-переменные (на сервере)

```
VK_APP_ID                 = 12345678            # из VK
SUPABASE_URL              = https://supabase.your-domain
SUPABASE_SERVICE_ROLE_KEY = eyJh...             # secret!
SUPABASE_ANON_KEY         = eyJh...
APP_AUTH_SECRET           = openssl rand -base64 32   # секрет для HMAC
```

`APP_AUTH_SECRET` — придумай свой, любые 32+ байта. От него зависит детерминированный пароль (см. §4.4) — **никогда не меняй**, иначе все юзеры разлогинятся и больше не залогинятся под тем же `vk_id`.

⚠️ **На self-hosted Supabase** `.env` файла недостаточно. Нужно добавить переменную **И** в `/root/supabase/docker/.env` **И** в `docker-compose.yml` секцию `environment:` сервиса `functions`. Применить через `docker compose up -d functions` (НЕ `restart` — он не подхватит новые env).

### 4.3 Обмен `code` → `vk_id`

```ts
async function exchangeVKCode(
  code: string, redirectUri: string, codeVerifier: string, deviceId: string
): Promise<{ vkUserId: number; firstName?: string; lastName?: string; avatarUrl?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: VK_APP_ID,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    device_id: deviceId,
  });

  const res = await fetch('https://id.vk.com/oauth2/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`VK ID OAuth: ${data.error_description || data.error}`);
  }

  const vkUserId = data.user_id;
  if (!vkUserId || vkUserId <= 0) throw new Error('Invalid user_id from VK');

  // Профиль (необязательный шаг — выкинь если не нужен)
  let firstName: string | undefined, lastName: string | undefined, avatarUrl: string | undefined;
  if (data.access_token) {
    const infoBody = new URLSearchParams({ access_token: data.access_token, client_id: VK_APP_ID });
    const infoResp = await fetch('https://id.vk.com/oauth2/user_info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: infoBody.toString(),
    });
    const info = await infoResp.json().catch(() => ({}));
    if (info?.user) {
      firstName = info.user.first_name;
      lastName = info.user.last_name;
      avatarUrl = info.user.avatar;
    }
  }

  return { vkUserId, firstName, lastName, avatarUrl };
}
```

### 4.4 Мост в Supabase Auth (детерминированный пароль)

Идея: один `vk_id` = один email + пароль, генерируемые из `APP_AUTH_SECRET`. На клиент пароль не уходит. Нужно service_role.

```ts
async function hmacSha256(data: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getAuthCredentials(vkId: number) {
  const email = `vk_${vkId}@vk.app`;                 // фиктивный email
  const password = await hmacSha256(String(vkId), APP_AUTH_SECRET);
  return { email, password };
}

async function ensureAuthUser(userId: string, vkId: number, metadata: Record<string, unknown>) {
  const { email, password } = await getAuthCredentials(vkId);
  const { data: existing } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (existing?.user) {
    // обновляем (вдруг APP_AUTH_SECRET ротировался — нет, не ротируем, но всё равно дешевле обновить)
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      email, password, email_confirm: true, user_metadata: metadata,
    });
    return;
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    id: userId, email, password, email_confirm: true, user_metadata: metadata,
  });
  if (error) {
    if (error.message?.includes('already been registered')) {
      // редкий рейс если auth.users уже есть с другим id
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email, password, email_confirm: true, user_metadata: metadata,
      });
      return;
    }
    throw new Error(`createUser failed: ${error.message}`);
  }
}

async function getSession(vkId: number) {
  const { email, password } = await getAuthCredentials(vkId);
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword failed: ${error.message}`);
  return data.session;   // ← это access_token + refresh_token
}
```

Ключевое — **`auth.users.id == public.users.id`**. То есть свой UUID юзера ты используешь как ID и в `auth.users`. Иначе RLS политики `auth.uid() = users.id` не сработают.

### 4.5 Главный handler

```ts
serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { code, redirectUri, codeVerifier, deviceId } = await req.json();
    if (!code || !redirectUri || !codeVerifier) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // 1. Обмен code → vk_id + профиль
    const { vkUserId, firstName, lastName, avatarUrl } =
      await exchangeVKCode(code, redirectUri, codeVerifier, deviceId || '');

    // 2. Lookup в нашей БД
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, role, first_name, last_name, is_active')
      .eq('vk_id', vkUserId)
      .maybeSingle();

    // 3. Не нашли → not_registered
    if (!user) {
      return new Response(JSON.stringify({ status: 'not_registered', vk_user_id: vkUserId }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // 4. Дополнительный gate: активность/членство — не пускаем деактивированных
    //    Проще всего инкапсулировать в RPC is_member(user_id) → boolean
    const { data: isMember } = await supabaseAdmin.rpc('is_member', { p_user_id: user.id });
    if (isMember !== true) {
      return new Response(JSON.stringify({ status: 'not_registered', vk_user_id: vkUserId }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // 5. Auth user + JWT
    await ensureAuthUser(user.id, vkUserId, {
      vk_id: vkUserId, role: user.role,
      first_name: user.first_name, last_name: user.last_name,
    });

    await supabaseAdmin.from('users').update({
      last_login: new Date().toISOString(),
      vk_first_name: firstName,
      vk_last_name: lastName,
      vk_avatar_url: avatarUrl,
    }).eq('id', user.id);

    const session = await getSession(vkUserId);

    const { data: fullUser } = await supabaseAdmin
      .from('users').select('*').eq('id', user.id).single();

    return new Response(JSON.stringify({ status: 'ok', user: fullUser, session }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
```

⚠️ Возврат `{ status: 'not_registered' }` идёт **со статусом 200**, не 401. Это контракт — клиент по `result.status` различает «нет такого юзера» и «фактическая ошибка».

---

## 5. AuthContext — клиентская сторона

```tsx
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function authViaEdgeFunction(code: string, redirectUri: string, codeVerifier: string, deviceId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pwa-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ code, redirectUri, codeVerifier, deviceId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Auth failed: ${res.status}`);
  }

  const result = await res.json();
  if (result.status === 'not_registered') return { notRegistered: true };

  const { user, session } = result;

  // КЛЮЧЕВОЕ: устанавливаем supabase сессию из JWT, выданного Edge Function.
  // С этого момента supabase-js клиент будет ходить с этим токеном,
  // RLS будет видеть auth.uid() = user.id.
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw new Error(`setSession failed: ${error.message}`);

  return { user };
}

// ... внутри AuthProvider
const signInWithVKOAuth = useCallback(async (code, redirectUri, codeVerifier, deviceId) => {
  setLoading(true); setError(null); setNotRegistered(false);
  try {
    const result = await authViaEdgeFunction(code, redirectUri, codeVerifier, deviceId);
    if ('notRegistered' in result) { setNotRegistered(true); return; }
    setUser(result.user);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Ошибка авторизации');
  } finally {
    setLoading(false);
  }
}, []);
```

### Восстановление сессии (cold start)

При перезагрузке страницы supabase-js хранит токены в localStorage и сам их подцепит:

```ts
useEffect(() => {
  (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // Тащим свой профиль из public.users
      const { data: userData } = await supabase
        .from('users').select('*').eq('id', session.user.id).single();
      if (userData) {
        // вторая линия: проверяем активность ещё раз
        const { data: isMember } = await supabase.rpc('is_member', { p_user_id: userData.id });
        if (isMember === true) { setUser(userData); return; }
        await supabase.auth.signOut();
        setNotRegistered(true);
      }
    }
    setLoading(false);
  })();

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') setUser(null);
  });
  return () => subscription.unsubscribe();
}, []);
```

`onAuthStateChange` нужен для случаев, когда токен протух и supabase-js его не смог обновить — он эмитит SIGNED_OUT, и UI должен очиститься.

---

## 6. UI: страницы и роутинг

```
/login           — страница с кнопкой "Войти через VK"
/auth/callback   — VK редиректит сюда после успешного логина
/unauthorized    — экран "вас нет в базе" (notRegistered === true)
/                — корневой роут, защищён через ProtectedRoute
```

`App.tsx` (псевдокод):
```tsx
const { user, loading, notRegistered } = useAuth();

if (loading) return <Loader />;
if (notRegistered) return <UnauthorizedPage />;   // показывает vk_user_id и кнопку signOut
if (!user) return <LoginPage />;                  // кнопка startVKOAuth()

return (
  <Routes>
    <Route path="/auth/callback" element={<AuthCallbackPage />} />
    <Route path="/*" element={<ProtectedLayout />} />
  </Routes>
);
```

Тонкость: `/auth/callback` должен быть в роутере **до** того, как срабатывает редирект на `/login`. Иначе `AutoRedirect` упрыгает на `/login` ещё до того, как callback успеет обработать `code`.

---

## 7. Схема БД (минимум)

В вашей таблице юзеров должна быть колонка `vk_id`:

```sql
ALTER TABLE users
  ADD COLUMN vk_id BIGINT UNIQUE,            -- VK user_id, по нему ищем
  ADD COLUMN vk_first_name TEXT,
  ADD COLUMN vk_last_name TEXT,
  ADD COLUMN vk_avatar_url TEXT,
  ADD COLUMN last_login TIMESTAMPTZ;
```

Опционально — RPC `is_member(user_id)` для проверки активности:
```sql
CREATE OR REPLACE FUNCTION is_member(p_user_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT COALESCE(is_active, false) FROM users WHERE id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION is_member(UUID) TO anon, authenticated;
```

⚠️ `GRANT TO anon` нужен потому, что Edge Function вызывает её под service_role до выдачи JWT юзеру.

---

## 8. Чек-лист имплементации

1. **VK Console**: создать «Веб-приложение», добавить все Redirect URIs (прод+стейджинг+localhost). Записать `App ID`.
2. **Env**: на клиенте `VITE_VK_APP_ID`. На бэке `VK_APP_ID`, `APP_AUTH_SECRET` (сгенерить новый), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.
3. **Schema**: добавить `vk_id` UNIQUE + опциональные `vk_*_name`, `last_login` в таблицу users. Если у вас другая система ролей/активности — RPC `is_member(user_id)`.
4. **Edge Function `pwa-auth`**: код из §4.3-4.5. Деплой через `supabase functions deploy pwa-auth` или (на self-hosted) копирование в `/root/supabase/docker/volumes/functions/` + `docker compose up -d functions`.
5. **Клиент `lib/vkAuth.ts`**: PKCE + redirect (§3.1).
6. **`AuthCallbackPage`**: §3.3, не забыть `calledRef`.
7. **`AuthContext`**: §5 — `signInWithVKOAuth` + cold-start restore.
8. **Login page**: одна кнопка `onClick={() => startVKOAuth()}`.
9. **Тест**: пройти флоу руками. Проверить:
   - на ошибке VK (`error=access_denied`) показывается экран ошибки;
   - на втором маунте `code` не обменивается дважды;
   - на ребуте страницы юзер остался залогинен;
   - юзера с `vk_id`, которого нет в БД, заворачивает на `/unauthorized`;
   - после signOut redirect на `/login`.
10. **Лог-проверка** в Edge Function: `console.log('PWA Auth: vk_user_id =', vkUserId)` — должен появиться в `docker logs supabase-edge-functions` при первом входе.

---

## 9. Грабли (короткий список)

- **`code` одноразовый.** React StrictMode прогонит useEffect дважды → второй обмен упадёт `invalid_grant`. Лечится `useRef(false)`.
- **`device_id` обязателен** в VK ID OAuth (в отличие от старого VK OAuth).
- **`code_challenge_method=s256`** именно строчными буквами — некоторые библиотеки шлют `S256`, VK ID требует lowercase.
- **Redirect URI должен ТОЧНО совпадать** с прописанным в VK Console, включая trailing slash и порт. `http://localhost:5173/auth/callback` ≠ `http://localhost:5173/auth/callback/`.
- **`auth.users.id == public.users.id`**. Иначе RLS не сматчит `auth.uid()` со своим юзером.
- **`APP_AUTH_SECRET` нельзя ротировать** — старые юзеры разлогинятся (другой пароль).
- **`signInWithPassword` идёт через анонный клиент**, не через service_role. На service_role клиенте этой функции нет.
- **CORS на Edge Function**: `*` в origin ок для PWA, но если у тебя строгий CSP — пропиши конкретные домены.
- **`scope=''`** ≠ отсутствие параметра. Шли пустую строку, не выкидывай ключ.
- **VK timeout**: иногда `id.vk.com/oauth2/auth` отвечает 200 с пустым body. Проверяй `data.user_id` вручную, не доверяй `response.ok`.
- **State проверять обязательно**, иначе CSRF.

---

## 10. Файлы, которые получатся

```
src/
├── lib/
│   └── vkAuth.ts                      # PKCE + редирект (§3.1)
├── contexts/
│   └── AuthContext.tsx                # signInWithVKOAuth + restore (§5)
├── pages/
│   ├── LoginPage.tsx                  # кнопка startVKOAuth
│   ├── AuthCallbackPage.tsx           # обработка ?code (§3.3)
│   └── UnauthorizedPage.tsx           # экран "вас нет в базе"
└── App.tsx                            # роутинг + ProtectedRoute

supabase/
├── functions/
│   └── pwa-auth/
│       └── index.ts                   # Edge Function (§4)
└── migrations/
    └── 0001_vk_id_column.sql          # ALTER TABLE users ADD vk_id (§7)
```

---

## 11. Промпт для Клода в другом проекте

> «Реализуй авторизацию через VK ID OAuth по спеку из `VK_AUTH_SPEC.md`. Стек у нас: [укажи свой]. Адаптируй имена таблиц под наш проект, но сохрани:
> 1. **PKCE-флоу** — `code_verifier` в sessionStorage, `code_challenge` через sha256+base64url.
> 2. **Edge Function pwa-auth** — она единственная точка обмена `code` → `vk_id` → JWT. Нигде на клиенте VK access_token не должен светиться.
> 3. **Детерминированный пароль** через HMAC-SHA256 от `vk_id` с секретом `APP_AUTH_SECRET` — это мост в Supabase Auth.
> 4. **`auth.users.id == public.users.id`**, иначе RLS сломается.
> 5. **calledRef в callback page** — один раз обмениваем code, иначе React StrictMode ломает флоу.
> 6. **Контракт `not_registered`** — статус 200 при отсутствии юзера, не 401.
>
> Делай по чек-листу из §8, между этапами проверяй: после §4 (Edge Function) — `curl` с тестовым code должен вернуть `not_registered`. После §5-6 (клиент) — пройти флоу руками с реальным VK App ID. Не реализуй авто-регистрацию неизвестных юзеров — `not_registered` только показывается. Регистрация юзеров — отдельный флоу (приглашение админом)».
