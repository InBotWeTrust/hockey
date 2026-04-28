# VK ID OAuth + переключатель источника профиля — design

**Дата:** 2026-04-28
**Статус:** approved (brainstorming), pending implementation
**Связанные документы:** `VK_AUTH_SPEC.md` (адаптируем PKCE-флоу и грабли, мост в Supabase отбрасываем)

## Цель

Добавить вход через VK ID OAuth 2.0 (id.vk.com) с PKCE как второй провайдер рядом с Telegram. Сохранять данные обоих провайдеров (имя/фамилия/аватар) и дать юзеру переключатель «откуда брать отображаемое имя и аватар». Регистрация открытая, симметричная Telegram. Связывание провайдеров через профиль (Bearer-токен в запросе на VK exchange).

## Scope

### В рамках этой задачи

1. PKCE-флоу VK ID OAuth: клиент → `/authorize`, сервер → `/oauth2/auth` обмен `code` на `vk_id`, чтение профиля через `/oauth2/user_info`.
2. Эндпоинт `POST /auth/vk` с тремя ветками: новый юзер / существующий по `vk_id` / линковка к текущему (Bearer).
3. Поля `vk_first_name|last_name|avatar_url|username` и симметричные `tg_*` в `users`. Backfill `tg_*` из `auth_providers.provider_data`.
4. `users.display_source enum('telegram','vk')` + хелпер `recomputeEffectiveProfile` пересчитывающий `users.display_name`/`avatar_url` из выбранного источника.
5. UI: кнопка «Войти через ВКонтакте» в `LoginScreen`, экран `/auth/vk/callback`, секция «Откуда брать имя и аватар» в `ProfileScreen`.
6. Тесты: unit (PKCE helpers, vk-exchange с моком fetch, recomputeEffectiveProfile), интеграционные (5 веток `/auth/vk`), компонентные (callback screen, login screen с VK-кнопкой, profile с переключателем).

### Вне scope (отдельные задачи)

- Кастомные поля `custom_first_name|last_name|avatar_url` и значение `'custom'` в `display_source`.
- Загрузка собственной аватарки (S3 / object storage).
- Email/телефон от VK (требует модерации VK).
- Объединение двух уже существующих аккаунтов (TG-юзер + VK-юзер, заведённые независимо).

## Архитектура

```
Browser /login
  ↓ click "Войти через ВКонтакте"
  ↓ startVkOAuth():
  ↓   generate codeVerifier (64 chars), codeChallenge = base64url(sha256(verifier))
  ↓   sessionStorage.setItem('vk_code_verifier' | 'vk_oauth_state', ...)
  ↓ window.location.href = id.vk.com/authorize?...&code_challenge=...&state=...
  ↓
[id.vk.com login UI]
  ↓ user accepts
  ↓
Browser /auth/vk/callback?code&device_id&state
  ↓ VkAuthCallbackScreen (calledRef guard for StrictMode):
  ↓   validate state matches sessionStorage
  ↓   apiFetch.POST /auth/vk { code, codeVerifier, deviceId, redirectUri, timezone }
  ↓     - Authorization: Bearer <access> сам подмешивается, если юзер уже залогинен
  ↓
Fastify /auth/vk
  ↓ exchangeVkCode → POST id.vk.com/oauth2/auth → { user_id, access_token }
  ↓ fetchVkProfile  → POST id.vk.com/oauth2/user_info → { first_name, last_name, avatar }
  ↓ findOrLinkOrCreateVkUser (advisory-lock на vk_id):
  ↓   ветка зависит от Bearer и наличия vk_id в auth_providers (см. таблицу ниже)
  ↓ recomputeEffectiveProfile (если display_source совпадает с обновлённым провайдером)
  ↓ issueAccessToken + issueRefreshToken + saveRefresh
  ↓ reply.send({ accessToken, refreshToken, user })
  ↓
Browser
  ↓ setSession (Zustand persist) + navigate('/')
```

### Граф ветвлений в `findOrLinkOrCreateVkUser`

| Bearer (auth.userId) | `auth_providers` для `vk_id` | Действие | Код ответа |
|----------------------|------------------------------|----------|------------|
| нет | нет | create new user (`display_source='vk'`) + insert auth_providers + initial wallet/equipment/sticks | 200 |
| нет | да (user Y) | login as Y, обновить `vk_*` поля (`display_source` не трогаем) | 200 |
| да (user X) | нет | insert auth_providers для user X, обновить `vk_*` (`display_source` не трогаем) | 200 |
| да (user X) | да, к user Y, Y ≠ X | reject, ничего не меняем | 409 `vk_already_linked` |
| да (user X) | да, к user X | no-op linking, обновить `vk_*` поля (`display_source` не трогаем) | 200 |

Симметрично: при first insert через Telegram `display_source = 'telegram'` (это же default колонки). При линковке/повторном логине существующего юзера `display_source` менять может только сам юзер через `PATCH /me`.

Advisory-lock берётся на `hashtext('vk:' || vk_id)` чтобы избежать race на одновременной регистрации/линковке одного `vk_id` из двух вкладок.

## Серверная часть

### Новые файлы

**`packages/server/src/auth/vk.ts`** — pure-функции, без Fastify:

```ts
export interface VkExchangeResult {
  vkUserId: number;
  accessToken: string;
  expiresIn: number;
}
export interface VkProfile {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  screenName?: string;
}

export async function exchangeVkCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  deviceId: string;
  appId: string;
  fetchImpl?: typeof fetch; // для тестов
}): Promise<VkExchangeResult>;

export async function fetchVkProfile(input: {
  accessToken: string;
  appId: string;
  fetchImpl?: typeof fetch;
}): Promise<VkProfile>;
```

Граничные кейсы:
- VK ответил `data.user_id <= 0` или нет — `throw new Error('vk_invalid_user_id')`.
- VK ответил `data.error` — `throw new Error('vk_oauth: ' + (error_description ?? error))`.
- `user_info` упал — не критично, профиль становится `{}` (юзер всё равно создастся / залогинится).

**`packages/server/src/auth/profile.ts`** — `recomputeEffectiveProfile(pool, userId)`. Читает `users.display_source`, и в зависимости от `'telegram'` или `'vk'`:
- Берёт `tg_first_name|last_name|avatar_url` или `vk_first_name|last_name|avatar_url`.
- `display_name = firstName + ' ' + lastName` или fallback `'Player'`.
- `UPDATE users SET display_name = ..., avatar_url = ... WHERE id = ...`.

Вызывается:
1. После любого VK-логина (если `display_source = 'vk'`).
2. После любого TG-логина (если `display_source = 'telegram'`).
3. После `PATCH /me { displaySource }`.

### Модификации

**`auth/users.ts`**:
- `findOrCreateTelegramUser`: добавляет `update users set tg_first_name = ..., tg_last_name = ..., tg_avatar_url = ..., tg_username = ...` всегда (и при insert, и при update). При first insert: `display_name = "Имя Фамилия"`, `display_source = 'telegram'` (default). После — зовёт `recomputeEffectiveProfile`.
- Новая функция `findOrLinkOrCreateVkUser(pool, { vkUserId, profile, currentUserId? })`: реализует таблицу веток выше. Возвращает `{ id, displayName }` либо бросает `AppError('conflict', 'vk_already_linked', 409)`.

**`routes/auth.ts`** — новый роут:

```ts
app.post('/auth/vk', async (req, reply) => {
  const parsed = vkBodySchema.safeParse(req.body);
  // ... валидация ...

  // Опциональная аутентификация: если есть Bearer, считываем userId.
  // Не используем preHandler с require=true.
  const currentUserId = await tryReadAccessToken(req, opts.accessSecret);

  const exchange = await exchangeVkCode({ ...parsed.data, appId: opts.vkAppId });
  const profile = await fetchVkProfile({ accessToken: exchange.accessToken, appId: opts.vkAppId })
    .catch(() => ({} as VkProfile));

  const user = await findOrLinkOrCreateVkUser(app.pg, {
    vkUserId: exchange.vkUserId,
    profile,
    currentUserId,
    timezone: parsed.data.timezone,
  });

  await recomputeEffectiveProfile(app.pg, user.id);

  // выдача токенов идентична /auth/telegram
});
```

`tryReadAccessToken` — отдельный хелпер (или inline) поверх `verifyAccessToken`, который при отсутствии/невалидном заголовке возвращает `null`, а не бросает.

**`routes/me.ts`** — расширяем `PATCH /me` полем `displaySource`:
- Принимаем `displaySource: 'telegram' | 'vk'`.
- Перед апдейтом проверяем что у юзера есть `auth_providers` с этим `provider` (иначе 400 `display_source_unavailable`).
- `UPDATE users SET display_source = ...`, затем `recomputeEffectiveProfile`.
- В ответе `/me` отдаём `displaySource`, `tgFirstName`, `tgLastName`, `tgAvatarUrl`, `vkFirstName`, `vkLastName`, `vkAvatarUrl` + список привязанных провайдеров (`linkedProviders: ['telegram', 'vk']`).

**`config.ts`** — `VK_APP_ID: z.string().min(1).optional()`. Опциональный — пока в env не прокинули, `/auth/vk` отвечает 503; всё остальное (TG-логин, daily-game) работает.

### Миграция `010_vk_auth_and_display_source.sql`

```sql
alter table users
  add column tg_first_name text,
  add column tg_last_name  text,
  add column tg_avatar_url text,
  add column tg_username   text,
  add column vk_first_name text,
  add column vk_last_name  text,
  add column vk_avatar_url text,
  add column vk_username   text,
  add column display_source text not null default 'telegram'
    check (display_source in ('telegram', 'vk'));

-- Backfill tg_* из auth_providers.provider_data + текущего avatar_url.
-- avatar_url до этой миграции всегда был из Telegram (других провайдеров не было).
update users u set
  tg_first_name = nullif(ap.provider_data->>'firstName', ''),
  tg_last_name  = nullif(ap.provider_data->>'lastName', ''),
  tg_username   = nullif(ap.provider_data->>'username', ''),
  tg_avatar_url = u.avatar_url
from auth_providers ap
where ap.user_id = u.id and ap.provider = 'telegram';
```

VK-поля и `display_source` для существующих юзеров остаются default (`telegram`), backfill VK не нужен (никто ещё не логинился).

## Клиентская часть

### Новые файлы

**`packages/web/src/auth/vkAuth.ts`** — копия §3.1 спеки, адаптировано к нашему `apiFetch`/`authStore`:

```ts
const VK_APP_ID = import.meta.env.VITE_VK_APP_ID || '';

function generateRandomString(length: number): string;
async function sha256(plain: string): Promise<ArrayBuffer>;
function base64UrlEncode(buffer: ArrayBuffer): string;
async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }>;

export function getRedirectUri(): string;        // window.location.origin + '/auth/vk/callback'
export async function startVkOAuth(): Promise<void>;
export function extractCodeFromUrl(): string | null;
export function extractDeviceIdFromUrl(): string;
export function extractErrorFromUrl(): string | null;
export function extractStateFromUrl(): string | null;
export function getCodeVerifier(): string;
export function getStoredState(): string;
export function cleanupOAuthState(): void;
```

`scope=''` шлём пустой строкой как требует VK. `code_challenge_method=s256` — строчными.

**`packages/web/src/screens/VkAuthCallbackScreen.tsx`** — копия §3.3 спеки, адаптировано под наш `useNavigate`/`apiFetch`/`authStore`:

```tsx
const calledRef = useRef(false);
useEffect(() => {
  if (calledRef.current) return;
  calledRef.current = true;
  (async () => {
    const oauthError = extractErrorFromUrl();
    if (oauthError) { cleanupOAuthState(); setError(...); return; }
    const code = extractCodeFromUrl();
    if (!code) { ... }
    const state = extractStateFromUrl();
    if (state !== getStoredState()) { ... 'state mismatch' ... return; }

    try {
      const session = await apiFetch<AuthSession>('/auth/vk', {
        method: 'POST',
        body: JSON.stringify({
          code,
          codeVerifier: getCodeVerifier(),
          deviceId: extractDeviceIdFromUrl(),
          redirectUri: getRedirectUri(),
          timezone: detectTimezone(),
        }),
      });
      cleanupOAuthState();
      setSession(session);
      navigate('/', { replace: true });
    } catch (err) {
      cleanupOAuthState();
      setError(err instanceof ApiError ? err.message : 'Ошибка авторизации');
    }
  })();
}, []);
```

Если в момент callback'а юзер был залогинен — `apiFetch` сам подмешает `Authorization: Bearer` (см. `apiFetch.ts` — он это уже делает на основе `authStore`). На результат `setSession` всё равно перезатирает старую сессию новой (для линковки это та же сессия по `userId`).

### Модификации

**`App.tsx` (или роутер)** — `<Route path="/auth/vk/callback" element={<VkAuthCallbackScreen/>}/>`. Должен быть **выше** `PrivateRoute`, потому что в момент callback'а Bearer может ещё отсутствовать (первичный логин).

**`screens/LoginScreen.tsx`** — рядом с `<TelegramLoginButton>` добавить:

```tsx
<button
  type="button"
  className="btn btn--ghost"
  onClick={() => startVkOAuth()}
>
  Войти через ВКонтакте
</button>
```

Тот же стиль, без иконки или с Lucide-иконкой.

**`screens/ProfileScreen.tsx`** — новая секция:

```
┌ Имя и аватар ────────────────────┐
│ ◉ Из Telegram   [Иван Иванов]    │
│ ○ Из ВК         [—  привязать]   │
│                                  │
│ (если привязан VK):              │
│ ○ Из ВК         [Иван И. + ava]  │
└──────────────────────────────────┘
```

- Радио-кнопки в стиле существующего grip-переключателя.
- Опция disabled если соответствующего провайдера нет в `linkedProviders`. Под disabled-радио — мини-кнопка «Привязать ВК» / «Привязать Telegram», запускает соответствующий OAuth.
- При смене — `PATCH /me { displaySource }` оптимистично, на ошибке откат.

**`auth/authStore.ts`** — `User` тип расширяем:

```ts
export interface User {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  // ...существующие поля...
  displaySource: 'telegram' | 'vk';
  linkedProviders: ('telegram' | 'vk')[];
  tgFirstName: string | null;
  tgLastName: string | null;
  tgAvatarUrl: string | null;
  tgUsername: string | null;
  vkFirstName: string | null;
  vkLastName: string | null;
  vkAvatarUrl: string | null;
  vkUsername: string | null;
}
```

**`.env.example`** — `VITE_VK_APP_ID=`. **Vite envs в Docker build-arg** — `web/Dockerfile` уже умеет принимать `VITE_TELEGRAM_BOT_USERNAME`, добавляем по тому же паттерну `VITE_VK_APP_ID`. **GitHub Actions deploy.yml** — добавляем `--build-arg VITE_VK_APP_ID=${{ vars.VITE_VK_APP_ID }}`.

## Тесты

### Сервер

**Unit (`packages/server/test/auth/vk.test.ts`):**
- `exchangeVkCode` с моком fetch: проверяет правильные form-параметры (code/code_verifier/device_id/redirect_uri/grant_type/client_id), парсит ответ.
- VK вернул `error` → throw с `error_description`.
- VK вернул 200 с пустым body → throw `vk_invalid_user_id`.
- `fetchVkProfile`: успех / ошибка → пустой профиль.

**Unit (`packages/server/test/auth/profile.test.ts`):**
- `recomputeEffectiveProfile` для `display_source=telegram` берёт `tg_*`, для `vk` берёт `vk_*`.
- При обоих null fallback `display_name='Player'`, `avatar_url=null`.

**Integration (`packages/server/test/routes/auth-vk.test.ts`)** через `app.inject()`, мокая `id.vk.com` через nock или тест-инжектор `fetchImpl`:
- Brand new VK user → 200, юзер создан, `display_source='vk'` (если первый логин — да; иначе остаётся default 'telegram'? **Решение: при first insert через VK ставим `display_source='vk'`**), `vk_*` заполнены.
- Existing VK user → 200, юзер тот же, `vk_*` обновлены.
- Bearer → unlinked vk_id → 200, добавилась строка в `auth_providers`, `vk_*` обновлены.
- Bearer (user X) → vk_id принадлежит user Y → 409 `vk_already_linked`.
- Bearer (user X) → vk_id user X → 200 no-op.
- VK exchange ошибка → 401.

**Integration (`packages/server/test/routes/me-display-source.test.ts`):**
- `PATCH /me { displaySource: 'vk' }` без VK-провайдера → 400.
- С VK-провайдером → 200, `display_name`/`avatar_url` пересчитаны.

### Web

**Unit (`packages/web/src/auth/vkAuth.test.ts`):**
- `generatePKCE` детерминированно (фикс `crypto.getRandomValues`/`crypto.subtle.digest`), правильный base64url.
- Парсинг URL helpers.

**Component (`packages/web/src/screens/VkAuthCallbackScreen.test.tsx`):**
- Двойной маунт (StrictMode) → один POST.
- State mismatch → ошибка, нет POST.
- VK error в URL → ошибка.
- Success → setSession + navigate.

**Component (`packages/web/src/screens/LoginScreen.test.tsx`):**
- VK-кнопка рендерится, клик → `window.location.href` начинается с `id.vk.com/authorize`.

**Component (`packages/web/src/screens/ProfileScreen.test.tsx`):**
- Переключатель disabled когда только один провайдер.
- Клик → `PATCH /me`, оптимистичный апдейт.

## Деплой

1. **VK Console** (ручной шаг для пользователя): создать «Веб-приложение», redirect URIs:
   - `http://localhost:5173/auth/vk/callback`
   - `https://hockey.inbotwetrust.ru/auth/vk/callback`
   - Записать App ID.
2. **GitHub repo vars** (через `gh variable set`): `VITE_VK_APP_ID`, `VK_APP_ID`. Делаю я через `gh` CLI после получения App ID от пользователя.
3. **`docker-compose.yml`** — добавить `VK_APP_ID` в `environment:` сервиса `server`.
4. **`packages/web/Dockerfile`** — `ARG VITE_VK_APP_ID` + `ENV VITE_VK_APP_ID=$VITE_VK_APP_ID`.
5. **`.github/workflows/deploy.yml`** — добавить `--build-arg VITE_VK_APP_ID=${{ vars.VITE_VK_APP_ID }}` в web build step.
6. **Миграция `010_*`** — накатывается автоматически в существующем `migrate-cli` step.

## Грабли (из спеки + наши)

- `code` одноразовый: `calledRef` в callback'е обязателен. StrictMode дважды дёрнет useEffect.
- `device_id` обязателен (новый VK ID, не старый OAuth).
- `code_challenge_method=s256` строчными.
- Redirect URI должен ТОЧНО матчить whitelist VK Console (включая port и trailing slash).
- `state` валидируется на клиенте, не на сервере — сервер не хранит state в Redis (overkill).
- `VK_APP_ID` — публичный, его можно класть в repo var (не secret).
- `users.display_name` и `users.avatar_url` — кеши, всегда обновляются через `recomputeEffectiveProfile`. Никаких прямых `update users set display_name = ...` в новых code-paths.
- При линковке Bearer-токена возможна race: два таба одновременно линкуют один `vk_id` — закрывается advisory-lock.
- Чат и daily-game читают `users.display_name` — после `recomputeEffectiveProfile` обновлённое имя автоматически появится у всех (ничего инвалидировать не надо, кеши на стороне БД).
- WS-сокеты чата при смене `display_name` НЕ ретранслируют — другие участники увидят новое имя только после следующего `GET /chat/list` или ререндера. Это ок для MVP.

## Файлы

```
packages/server/
├── db/migrations/010_vk_auth_and_display_source.sql      # NEW
├── src/auth/
│   ├── vk.ts                                             # NEW
│   ├── profile.ts                                        # NEW (recomputeEffectiveProfile)
│   └── users.ts                                          # MODIFY (tg_* fields, findOrLinkOrCreateVkUser)
├── src/routes/
│   ├── auth.ts                                           # MODIFY (POST /auth/vk)
│   └── me.ts                                             # MODIFY (displaySource в PATCH/GET)
├── src/config.ts                                         # MODIFY (VK_APP_ID)
└── test/
    ├── auth/
    │   ├── vk.test.ts                                    # NEW
    │   └── profile.test.ts                               # NEW
    └── routes/
        ├── auth-vk.test.ts                               # NEW
        └── me-display-source.test.ts                     # NEW

packages/web/
├── src/auth/
│   ├── vkAuth.ts                                         # NEW
│   └── vkAuth.test.ts                                    # NEW
├── src/auth/authStore.ts                                 # MODIFY (User type extension)
├── src/screens/
│   ├── VkAuthCallbackScreen.tsx                          # NEW
│   ├── VkAuthCallbackScreen.test.tsx                     # NEW
│   ├── LoginScreen.tsx                                   # MODIFY (VK button)
│   ├── LoginScreen.test.tsx                              # MODIFY (assert VK button)
│   ├── ProfileScreen.tsx                                 # MODIFY (display source switch)
│   └── ProfileScreen.test.tsx                            # MODIFY (assert switch)
├── src/App.tsx                                           # MODIFY (callback route)
└── Dockerfile                                            # MODIFY (ARG VITE_VK_APP_ID)

infra/
├── docker-compose.yml                                    # MODIFY (VK_APP_ID env)
└── .github/workflows/deploy.yml                          # MODIFY (build-arg)

.env.example                                              # MODIFY
CLAUDE.md                                                 # MODIFY (Auth section)
```

## Open questions (на момент написания спеки — нет)

Все ключевые развилки разрешены в брейнсторме:
- Регистрация: симметрично TG (auto-create).
- Линковка: при логине с Bearer.
- Конфликт линковки: 409, без авто-мержа.
- VK App ID: публичный, через repo var.
- Custom-поля профиля: вне scope.
