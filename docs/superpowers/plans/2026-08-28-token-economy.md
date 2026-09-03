# Token Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить на dev самостоятельный ресурс «токен» для дополнительных активностей с серверным журналом, покупкой за звёзды или резервно за монеты, административными настройками и безопасной интеграцией в тренировку, бонусные игры и обычные дополнительные дуэли.

**Architecture:** Новый серверный модуль `tokenEconomy` владеет балансом, календарными лимитами, идемпотентностью, журналом и покупкой; игровые режимы создают сессию и списывают токен в одной PostgreSQL-транзакции. Глобальные параметры используют существующий `game_settings`, режимные параметры хранятся отдельно там, где они принадлежат каталогу режима. Web читает единое состояние экономики через TanStack Query и не рассчитывает доступность самостоятельно.

**Tech Stack:** TypeScript strict, Fastify 4, PostgreSQL 16 raw SQL migrations, React 18, TanStack Query, Zustand, Vitest, Testing Library, pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-08-28-token-economy-design.md`

## Global Constraints

- Реализация и проверка выполняются только на `dev`; production требует отдельного решения.
- Начинать выполнение в отдельном worktree от актуального `origin/dev`; план исследован по `origin/dev` `5e1ff8355b71`.
- Следующая миграция по исследованному ref — `072_token_economy.sql`; перед выполнением механически увеличить номер, если `origin/dev` уже занял `072`.
- Сервер является единственным источником баланса, лимитов и права на дополнительную активность.
- Глобальный порядок блокировок экономики: `users` → `user_currency_account` → `user_token_account`; режимные строки блокируются после пользовательских счетов.
- Токены не сгорают, не имеют верхней границы баланса, не обмениваются обратно и не покупают инвентарь.
- Покупка: максимум 1 за локальный день, 3 за локальную неделю, из них максимум 1 за монеты; при достаточных звёздах монеты запрещены.
- Базовый расход: максимум 3 токена за локальный день и один оплаченный дополнительный запуск каждого реализованного вида активности за день.
- Бонусная игра стартово имеет 1 бесплатную новую попытку в день на каждую игру; resume активной попытки не считается новым запуском.
- Не менять детерминированное поведение `@hockey/game-core`; `GAME_CORE_VERSION` для этой работы не повышается.
- Не переименовывать существующий `balances.tokens` атомарно: в текущем API это монеты. Добавить `coins` и `activityTokens`, сохранить `tokens` как временный alias монет до отдельной cleanup-миграции клиента.
- Все обычные подтверждения используют `AccessibleModal` и существующие `.modal-*` / `.btn--cta` стили; текстовые кнопки остаются без иконок.
- Не включать в этот план цветовую палитру статусных звёзд, статусные лиги, формулу коэффициента силы, рейтинговую «дуэль-вызов», месячные квесты и специальные события с расходом 10–20+ токенов. Для них нужны отдельные утверждённые спецификации.
- Дополнительные задания, челленджи и квесты остаются выключенными, пока соответствующий каталог не поддержит создание дополнительного экземпляра; этот план добавляет источники наград, но не выдумывает отсутствующую контентную модель.

---

## File Map

### Server — new files

- `packages/server/db/migrations/072_token_economy.sql` — счета, журнал, настройки, поля режимов и reward-поля.
- `packages/server/src/tokenEconomy/types.ts` — общие activity codes и DTO.
- `packages/server/src/tokenEconomy/calendar.ts` — локальный день, начало недели и границы периодов.
- `packages/server/src/tokenEconomy/settings.ts` — чтение и валидация глобальных/режимных параметров.
- `packages/server/src/tokenEconomy/ledger.ts` — блокировки счетов и неизменяемые проводки.
- `packages/server/src/tokenEconomy/service.ts` — starter grant, покупка, расход, возврат и корректировка.
- `packages/server/src/tokenEconomy/routes.ts` — player API состояния, покупки и истории.
- `packages/server/src/tokenEconomy/admin.ts` — admin API политик, корректировок, аудита и аналитики.
- `packages/server/test/tokenEconomy/migration.test.ts` — контракт миграции и constraints.
- `packages/server/test/tokenEconomy/service.test.ts` — конкурентность, приоритет оплаты, лимиты и идемпотентность.
- `packages/server/test/tokenEconomy/routes.test.ts` — HTTP-контракт и безопасные ошибки.
- `packages/server/test/tokenEconomy/admin.test.ts` — настройки, аудит, корректировки и аналитика.

### Server — modified files

- `packages/server/src/app.ts` — регистрация player/admin token routes.
- `packages/server/src/routes/me.ts` — `tokenBalance` без изменения смысла `currencyBalance`.
- `packages/server/src/routes/inventory.ts` — канонические `coins`/`activityTokens` плюс legacy alias.
- `packages/server/src/duel/gameSettings.ts` — определения глобальных token settings.
- `packages/server/src/duel/training/routes.ts` — вторая дневная тренировка за токен.
- `packages/server/src/bonusGames/types.ts` — token/free-attempt поля каталога и DTO.
- `packages/server/src/bonusGames/service.ts` — атомарное создание бесплатной или token-attempt.
- `packages/server/src/bonusGames/routes.ts` — idempotency contract запуска.
- `packages/server/src/bonusGames/admin.ts` — редактирование лимита бесплатных попыток и token policy.
- `packages/server/src/duel/amateur/routes.ts` — token intent обычной дополнительной дуэли и нерейтинговый settlement.
- `packages/server/src/achievements/routes.ts` — начисление `reward_tokens`.
- `packages/server/src/weeklyChallenge/admin.ts` — ранний token reward и deadline.
- `packages/server/src/weeklyChallenge/progress.ts` — серверный `completedAt` по N-му qualifying event.
- `packages/server/src/weeklyChallenge/rewards.ts` — идемпотентное начисление раннего token reward.
- `packages/server/src/weeklyChallenge/routes.ts` — передача `completedAt` в claim.
- `packages/server/src/admin/routes.ts` — подключение token-admin API и token metrics к summary.
- Тесты существующих модулей рядом с перечисленными файлами.

### Web — new files

- `packages/web/src/api/tokenEconomy.ts` — DTO, query keys и player API.
- `packages/web/src/components/ResourceBar.tsx` — монеты, звёзды, токены и справка.
- `packages/web/src/components/TokenWalletModal.tsx` — кошелёк, покупка и лимиты.
- `packages/web/src/components/TokenSpendModal.tsx` — подтверждение расхода без будущего остатка.
- `packages/web/src/admin/TokenEconomyAdmin.tsx` — глобальные параметры, политики, аудит и метрики.
- Соответствующие `*.test.tsx` рядом с компонентами.

### Web — modified files

- `packages/web/src/api/inventory.ts` — переходный balance DTO.
- `packages/web/src/api/training.ts` — token option и idempotency key запуска.
- `packages/web/src/api/bonusGames.ts` — free-attempt/token state и idempotency key.
- `packages/web/src/api/amateurDuel.ts` — token intent обычной дополнительной дуэли.
- `packages/web/src/auth/authStore.ts` — необязательный `tokenBalance`.
- `packages/web/src/app/App.tsx` — постоянный ResourceBar на стандартных игровых экранах.
- `packages/web/src/screens/ProfileScreen.tsx` — убрать опыт из строки ресурсов, оставить точное значение в статистике.
- `packages/web/src/screens/DailyOverviewScreen.tsx` — token CTA для второй тренировки.
- `packages/web/src/screens/BonusGamesScreen.tsx` — бесплатный остаток, token CTA и подтверждение.
- `packages/web/src/screens/DuelScreen.tsx` — token intent после бесплатного лимита.
- `packages/web/src/admin/AdminScreen.tsx` и `packages/web/src/admin/api.ts` — вкладка «Токены».
- `packages/web/src/api/apiFetch.ts` — локализованные token errors.

---

### Task 1: Add the persistence contract

**Files:**
- Create: `packages/server/db/migrations/072_token_economy.sql`
- Create: `packages/server/test/tokenEconomy/migration.test.ts`
- Modify: `packages/server/test/db/migrations.test.ts`

**Interfaces:**
- Produces: `user_token_account`, `token_ledger`, `token_activity_policy`, `token_admin_audit`.
- Produces: reward and access columns used by Tasks 2–9.
- Consumes: existing `users`, `user_currency_account`, `game_settings`, `bonus_game`, `training_session`, `amateur_duel_match`, `achievements`, and weekly-challenge tables.

- [ ] **Step 1: Write the migration contract test**

Add assertions that the new tables and exact constraints exist:

```ts
expect(names).toEqual(
  expect.arrayContaining([
    'user_token_account',
    'token_ledger',
    'token_activity_policy',
    'token_admin_audit',
  ]),
);
expect(constraints.get('user_token_account_balance_check')).toContain('balance >= 0');
expect(constraints.get('token_ledger_idempotency_unique')).toBeDefined();
expect(constraints.get('token_activity_policy_cost_check')).toContain('token_cost > 0');
```

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/migration.test.ts
```

Expected: FAIL because migration `072_token_economy.sql` and its tables do not exist.

- [ ] **Step 3: Create the forward-only migration**

Use additive SQL with these core shapes:

```sql
create table user_token_account (
  user_id uuid primary key references users(id) on delete cascade,
  balance int not null default 0,
  intro_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_token_account_balance_check check (balance >= 0)
);

create table token_ledger (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  operation text not null check (operation in (
    'starter_grant', 'reward_grant', 'purchase', 'activity_spend',
    'technical_refund', 'admin_adjustment'
  )),
  delta int not null check (delta <> 0),
  balance_after int not null check (balance_after >= 0),
  activity_code text check (activity_code in ('training', 'bonus_game', 'duel')),
  source_type text not null,
  source_id text,
  source_key text,
  idempotency_key text not null,
  local_day date not null,
  local_week_start date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint token_ledger_idempotency_unique unique (user_id, idempotency_key)
);

create unique index token_ledger_source_unique
  on token_ledger (user_id, source_key)
  where source_key is not null;

create table token_activity_policy (
  activity_code text primary key check (activity_code in ('training', 'bonus_game', 'duel')),
  enabled boolean not null default false,
  token_cost int not null default 1,
  paid_launches_per_day int not null default 1,
  paid_launches_per_week int,
  pack_size int not null default 1,
  min_competition_level text not null default 'amateur'
    check (min_competition_level in ('amateur', 'professional')),
  help_text text not null default '',
  active_from timestamptz,
  active_until timestamptz,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint token_activity_policy_cost_check check (token_cost > 0),
  check (paid_launches_per_day between 0 and 1),
  check (paid_launches_per_week is null or paid_launches_per_week >= paid_launches_per_day),
  check (pack_size > 0),
  check (active_until is null or active_from is null or active_from < active_until)
);

create table token_admin_audit (
  id bigserial primary key,
  admin_user_id uuid not null references users(id) on delete restrict,
  entity_type text not null,
  entity_key text not null,
  old_value jsonb not null,
  new_value jsonb not null,
  reason text not null check (length(trim(reason)) between 1 and 1000),
  created_at timestamptz not null default now()
);
```

Also add:

```sql
alter table bonus_game
  add column free_attempts_per_day int not null default 1 check (free_attempts_per_day >= 0),
  add column token_extra_enabled boolean not null default true,
  add column token_cost int not null default 1 check (token_cost > 0);

alter table training_session
  drop constraint training_session_user_id_day_date_key,
  add column session_number smallint not null default 1 check (session_number between 1 and 2),
  add column access_kind text not null default 'free' check (access_kind in ('free', 'token')),
  add column token_ledger_id bigint references token_ledger(id) on delete restrict,
  add constraint training_session_user_day_number_unique unique (user_id, day_date, session_number),
  add constraint training_session_token_link_check check (
    (access_kind = 'free' and token_ledger_id is null)
    or (access_kind = 'token' and token_ledger_id is not null)
  );

alter table bonus_game_attempt
  add column access_kind text not null default 'free' check (access_kind in ('free', 'token')),
  add column token_ledger_id bigint references token_ledger(id) on delete restrict;

alter table amateur_duel_match
  add column token_intent_user_id uuid references users(id) on delete set null,
  add column token_idempotency_key text,
  add column token_ledger_id bigint references token_ledger(id) on delete restrict;

alter table achievements
  add column reward_tokens int not null default 0 check (reward_tokens >= 0);

alter table weekly_challenges
  add column early_reward_tokens int not null default 0 check (early_reward_tokens >= 0),
  add column early_reward_until timestamptz;

alter table weekly_challenge_reward_claims
  add column tokens int not null default 0 check (tokens >= 0),
  add column completed_at timestamptz;
```

Seed the three policies disabled, and add `game_settings` rows for:

```text
token.enabled = false
token.amateur_starter_grant = 3
token.star_price = 1
token.coin_price = 1
token.purchase_daily_limit = 1
token.purchase_weekly_limit = 3
token.coin_purchase_weekly_limit = 1
token.spend_daily_limit = 3
```

The safe disabled defaults `1` keep constraints valid while `token.enabled=false`; admins must set reviewed dev prices before enabling.

- [ ] **Step 4: Run migration tests and verify GREEN**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/migration.test.ts test/db/migrations.test.ts
```

Expected: PASS; existing migrations still apply from an empty test database.

- [ ] **Step 5: Commit the persistence contract**

```bash
git add packages/server/db/migrations/072_token_economy.sql packages/server/test/tokenEconomy/migration.test.ts packages/server/test/db/migrations.test.ts
git commit -m "feat(token-economy): add persistence contract"
```

### Task 2: Implement the token economy domain service

**Files:**
- Create: `packages/server/src/tokenEconomy/types.ts`
- Create: `packages/server/src/tokenEconomy/calendar.ts`
- Create: `packages/server/src/tokenEconomy/settings.ts`
- Create: `packages/server/src/tokenEconomy/ledger.ts`
- Create: `packages/server/src/tokenEconomy/service.ts`
- Create: `packages/server/test/tokenEconomy/service.test.ts`

**Interfaces:**
- Produces: `getTokenState`, `ensureAmateurStarterGrant`, `purchaseToken`, `spendForCreatedActivity`, `refundTechnicalSpend`, `adjustTokenBalance`.
- Consumes: Task 1 tables and existing `resolveCompetitionLevel()`.

- [ ] **Step 1: Define contracts in a failing service test**

Use explicit inputs and outputs:

```ts
export type TokenActivityCode = 'training' | 'bonus_game' | 'duel';

export interface TokenStateDTO {
  available: boolean;
  balance: number;
  prices: { stars: number; coins: number };
  purchaseLimits: {
    canPurchase: boolean;
    dailyRemaining: number;
    weeklyRemaining: number;
    coinWeeklyRemaining: number;
    resetsAt: string;
  };
  spendLimits: { dailyRemaining: number; resetsAt: string };
}

export interface SpendForCreatedActivityInput {
  userId: string;
  activityCode: TokenActivityCode;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  now: Date;
  costOverride?: number;
}
```

Test at least: starter grant once, no grant for beginner, persistent balance, stars-first purchase, coin fallback only on insufficient stars, daily/weekly limits, one coin purchase per week, spend limit, per-activity limit, idempotent replay, concurrent spend with one token, refund exactly once, and DST-safe local calendar boundaries.

- [ ] **Step 2: Run the service test and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/service.test.ts
```

Expected: FAIL because the module exports do not exist.

- [ ] **Step 3: Implement local calendar helpers**

`resolveTokenCalendar(client, userId, now)` must ask PostgreSQL for the user's saved timezone and return local day/week plus the next day boundary:

```ts
export interface TokenCalendar {
  timezone: string;
  localDay: string;
  localWeekStart: string;
  nextDayStartsAt: Date;
  nextWeekStartsAt: Date;
}
```

Use `date_trunc('week', $1::timestamptz at time zone timezone)::date`; do not calculate a week by subtracting fixed milliseconds.

- [ ] **Step 4: Implement strict settings loading**

`getTokenSettings()` returns numbers/booleans validated against the same bounds as admin. `getTokenActivityPolicy()` returns disabled outside `active_from` / `active_until`. Invalid stored settings throw a server error instead of silently enabling purchases.

- [ ] **Step 5: Implement ledger primitives and lock order**

The only balance mutation primitive is:

```ts
async function postTokenLedgerEntry(
  client: PoolClient,
  input: {
    userId: string;
    operation: TokenOperation;
    delta: number;
    activityCode?: TokenActivityCode;
    sourceType: string;
    sourceId?: string;
    sourceKey?: string;
    idempotencyKey: string;
    calendar: TokenCalendar;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ledgerId: number; balance: number; replayed: boolean }>;
```

It first returns an existing `(user_id, idempotency_key)` result, otherwise updates `user_token_account` with `balance + delta >= 0` and inserts the immutable ledger row. All callers lock `users`, then coin and token accounts in the global order.

- [ ] **Step 6: Implement starter grant, purchase, spend, refund and adjustment**

Key behavior:

```ts
const paymentCurrency = user.xp >= settings.starPrice ? 'stars' : 'coins';
if (paymentCurrency === 'coins' && coinBalance < settings.coinPrice) {
  throw new AppError('token_insufficient_funds', 'not enough stars or coins', 409);
}
```

- Starter source key: `amateur-starter:<userId>`.
- Purchase idempotency comes from the client UUID and records price snapshots.
- Spend counts negative `activity_spend` rows for the local day and activity.
- Refund source key: `technical-refund:<originalLedgerId>` and requires the original negative ledger row.
- Admin adjustment requires non-empty reason metadata.

- [ ] **Step 7: Run service tests and verify GREEN**

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/service.test.ts
```

Expected: PASS, including the parallel `Promise.all` test where only one of two spends can consume the last token.

- [ ] **Step 8: Commit the domain service**

```bash
git add packages/server/src/tokenEconomy packages/server/test/tokenEconomy/service.test.ts
git commit -m "feat(token-economy): add atomic balance service"
```

### Task 3: Expose player state and purchase API without breaking coin clients

**Files:**
- Create: `packages/server/src/tokenEconomy/routes.ts`
- Create: `packages/server/test/tokenEconomy/routes.test.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/routes/me.ts`
- Modify: `packages/server/src/routes/inventory.ts`
- Modify: `packages/web/src/api/inventory.ts`
- Modify: `packages/web/src/auth/authStore.ts`

**Interfaces:**
- Produces: `GET /token-economy/state`, `POST /token-economy/purchases`, `GET /token-economy/ledger`, `POST /token-economy/onboarding/ack`.
- Produces: `tokenBalance` on `/me`; `balances.coins`, `balances.activityTokens`, and legacy `balances.tokens` on inventory.
- Consumes: Task 2 service.

- [ ] **Step 1: Write failing HTTP and compatibility tests**

Cover these responses:

```ts
expect((await app.inject({ method: 'GET', url: '/token-economy/state', headers })).json())
  .toMatchObject({ available: true, balance: 3 });

expect(inventory.balances).toEqual({
  coins: 25,
  tokens: 25, // legacy alias for coins
  activityTokens: 3,
  stars: 10,
});
```

Assert beginners receive `{ available: false }` without a disclosed balance, a stale expected price returns `token_price_changed`, and replaying the same purchase UUID does not double-charge.

- [ ] **Step 2: Run the route tests and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/routes.test.ts test/routes/me.test.ts
```

- [ ] **Step 3: Implement and register player routes**

Purchase body:

```ts
const purchaseSchema = z.object({
  idempotency_key: z.string().uuid(),
  expected_star_price: z.number().int().positive(),
  expected_coin_price: z.number().int().positive(),
}).strict();
```

Return the authoritative new state and `{ paid_with: 'stars' | 'coins' }`. Ledger history returns the newest 50 rows with user-safe titles and no internal SQL/error details. State includes `show_onboarding: true` only for an eligible account whose `intro_acknowledged_at` is null; the acknowledgement endpoint updates that timestamp idempotently.

- [ ] **Step 4: Add additive balance fields**

Keep meanings stable during mixed client/server deployment:

```ts
balances: {
  coins: Number(account.balance),
  tokens: Number(account.balance),
  activityTokens: Number(tokenAccount.balance),
  stars: Number(account.stars),
  experience: Number(account.experience),
}
```

Add `tokenBalance` to `/me` and `AuthUser`, but make web parsing tolerate its absence until the server deploy completes.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/routes.test.ts test/routes/me.test.ts
pnpm --filter @hockey/server typecheck
pnpm --filter @hockey/web typecheck
```

- [ ] **Step 6: Commit the player contract**

```bash
git add packages/server/src/app.ts packages/server/src/routes/me.ts packages/server/src/routes/inventory.ts packages/server/src/tokenEconomy/routes.ts packages/server/test/tokenEconomy/routes.test.ts packages/server/test/routes/me.test.ts packages/web/src/api/inventory.ts packages/web/src/auth/authStore.ts
git commit -m "feat(token-economy): expose player balance and purchase API"
```

### Task 4: Add admin settings, audit, adjustments and the token admin tab

**Files:**
- Create: `packages/server/src/tokenEconomy/admin.ts`
- Create: `packages/server/test/tokenEconomy/admin.test.ts`
- Create: `packages/web/src/admin/TokenEconomyAdmin.tsx`
- Create: `packages/web/src/admin/TokenEconomyAdmin.test.tsx`
- Modify: `packages/server/src/duel/gameSettings.ts`
- Modify: `packages/server/src/admin/routes.ts`
- Modify: `packages/server/src/bonusGames/admin.ts`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/BonusGamesAdmin.tsx`
- Modify: relevant admin tests.

**Interfaces:**
- Produces: admin token settings/policies, manual adjustment, audit and metrics endpoints.
- Consumes: Tasks 1–3 and existing admin role prehandlers.

- [ ] **Step 1: Write failing server admin tests**

Assert:

- non-admin receives 403;
- negative prices and weekly limit below daily limit receive 400;
- PATCH requires `reason` and stores old/new values in `token_admin_audit`;
- manual adjustment cannot make balance negative;
- technical refund accepts only an existing negative `activity_spend`, requires a reason, and is idempotent;
- bonus-game patch accepts `freeAttemptsPerDay`, `tokenExtraEnabled`, `tokenCost`;
- changes do not alter existing attempt snapshots.

- [ ] **Step 2: Write failing web admin tests**

Render the new tab and verify fields for starter grant, two prices, purchase/spend limits, three policies, bonus free-attempt limit, reason input, save/readback and disabled-state validation.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/admin.test.ts test/bonusGames/admin.test.ts
pnpm --filter @hockey/web exec vitest run src/admin/TokenEconomyAdmin.test.tsx src/admin/BonusGamesAdmin.test.tsx
```

- [ ] **Step 4: Implement admin API**

Endpoints:

```text
GET   /admin/token-economy
PATCH /admin/token-economy/settings
PATCH /admin/token-economy/policies/:activityCode
POST  /admin/token-economy/users/:userId/adjustments
POST  /admin/token-economy/ledger/:ledgerId/refund
GET   /admin/token-economy/audit
GET   /admin/token-economy/metrics?period=7d|30d|90d
```

Every mutation inserts `token_admin_audit {admin_user_id, entity_type, entity_key, old_value, new_value, reason}` in the same transaction as the change.

- [ ] **Step 5: Extend bonus-game admin snapshots**

Add the three fields to create/patch/read DTOs and the form. Existing attempts retain their original access decision; only newly created attempts use changed limits.

- [ ] **Step 6: Implement the web tab with readback**

Use controlled forms and invalidate `['admin', 'token-economy']` after save. Show the server-returned value, not the optimistic input, and keep the save action disabled until a reason is entered.

- [ ] **Step 7: Run focused tests and typecheck**

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/admin.test.ts test/bonusGames/admin.test.ts
pnpm --filter @hockey/web exec vitest run src/admin/TokenEconomyAdmin.test.tsx src/admin/BonusGamesAdmin.test.tsx
pnpm typecheck
```

- [ ] **Step 8: Commit admin control**

```bash
git add packages/server/src/tokenEconomy/admin.ts packages/server/src/duel/gameSettings.ts packages/server/src/admin/routes.ts packages/server/src/bonusGames/admin.ts packages/server/test/tokenEconomy/admin.test.ts packages/server/test/bonusGames/admin.test.ts packages/web/src/admin/TokenEconomyAdmin.tsx packages/web/src/admin/TokenEconomyAdmin.test.tsx packages/web/src/admin/AdminScreen.tsx packages/web/src/admin/api.ts packages/web/src/admin/BonusGamesAdmin.tsx packages/web/src/admin/BonusGamesAdmin.test.tsx
git commit -m "feat(token-economy): add audited admin controls"
```

### Task 5: Grant starter and achievement tokens exactly once

**Files:**
- Modify: `packages/server/src/tokenEconomy/service.ts`
- Modify: `packages/server/src/achievements/routes.ts`
- Modify: `packages/server/src/admin/routes.ts`
- Modify: `packages/web/src/api/achievements.ts`
- Modify: achievement admin UI in `packages/web/src/admin/AdminScreen.tsx` and `packages/web/src/admin/api.ts`
- Modify: `packages/server/test/achievements/claim.test.ts`
- Modify: `packages/web/src/screens/AchievementsScreen.test.tsx`

**Interfaces:**
- Produces: starter grant on first amateur token-state access and `reward_tokens` claims.
- Consumes: `ensureAmateurStarterGrant()` and `postTokenLedgerEntry()`.

- [ ] **Step 1: Add failing starter and achievement tests**

Verify:

- beginner state never creates a token account credit;
- reaching amateur then calling state twice yields exactly one `starter_grant` row and balance 3;
- concurrent first state calls still yield one grant;
- achievement claim adds configured tokens once and returns the new token balance;
- re-claim preserves all balances.

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/routes.test.ts test/achievements/claim.test.ts
```

- [ ] **Step 3: Implement the lazy starter grant**

Inside the authenticated state transaction, lock the user, compute `resolveCompetitionLevel`, and post source key `amateur-starter:<userId>`. Do not trust `level` alone because amateur access also derives from lifetime goals and current game settings.

- [ ] **Step 4: Extend achievement admin and claim**

Add `rewardTokens` to admin DTO/schema and `reward_tokens` to the locked claim query. Post `reward_grant` with source key `achievement:<achievementId>` in the same transaction as coins/stars/experience and `claimed_at`.

- [ ] **Step 5: Run tests and typecheck**

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/routes.test.ts test/achievements/claim.test.ts
pnpm --filter @hockey/web exec vitest run src/screens/AchievementsScreen.test.tsx
pnpm typecheck
```

- [ ] **Step 6: Commit grant sources**

```bash
git add packages/server/src/tokenEconomy/service.ts packages/server/src/achievements/routes.ts packages/server/src/admin/routes.ts packages/server/test/achievements/claim.test.ts packages/web/src/api/achievements.ts packages/web/src/admin/AdminScreen.tsx packages/web/src/admin/api.ts packages/web/src/screens/AchievementsScreen.test.tsx
git commit -m "feat(token-economy): grant starter and achievement tokens"
```

### Task 6: Add an evidence-based early weekly challenge reward

**Files:**
- Modify: `packages/server/src/weeklyChallenge/progress.ts`
- Modify: `packages/server/src/weeklyChallenge/rewards.ts`
- Modify: `packages/server/src/weeklyChallenge/routes.ts`
- Modify: `packages/server/src/weeklyChallenge/admin.ts`
- Modify: `packages/web/src/api/weeklyChallenge.ts`
- Modify: `packages/web/src/admin/WeeklyChallengesAdmin.tsx`
- Modify: `packages/server/test/weeklyChallenge/progress.test.ts`
- Modify: `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts`
- Modify: `packages/server/test/weeklyChallenge/admin.test.ts`
- Modify: `packages/web/src/admin/WeeklyChallengesAdmin.test.tsx`

**Interfaces:**
- Produces: `computeWeeklyChallengeCompletedAt(client, challenge, participant): Date | null`.
- Consumes: Task 2 ledger grant.

- [ ] **Step 1: Write failing threshold-time tests**

For every task type, insert more events than required and assert that completion time is the timestamp of the N-th qualifying event. Overall completion is the maximum threshold timestamp across all required tasks. Actions before `max(start_at, joined_at)` and after `end_at` are ignored.

- [ ] **Step 2: Run progress tests and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/progress.test.ts
```

- [ ] **Step 3: Implement authoritative completion time**

Use ordered SQL over existing sources:

```text
goals_scored      -> N-th goal shot_session.created_at
duels_played      -> N-th settled amateur_duel_match.settled_at
duels_won         -> N-th won amateur_duel_match.settled_at
duel_invites_sent -> N-th challenge match.created_at
trainings_completed -> N-th closed training_session.closed_at
```

Do not use the claim click time as completion time.

- [ ] **Step 4: Add early reward configuration and atomic claim**

Admin requires both `earlyRewardTokens > 0` and `earlyRewardUntil`, with the deadline inside the challenge interval. On claim:

```ts
const tokenReward =
  completedAt !== null && completedAt <= challenge.earlyRewardUntil
    ? challenge.earlyRewardTokens
    : 0;
```

Post source key `weekly-challenge:<challengeId>` in the same transaction and store `tokens` plus `completed_at` in the claim snapshot.

- [ ] **Step 5: Run server and web tests**

```bash
pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/progress.test.ts test/weeklyChallenge/weeklyChallenge.test.ts test/weeklyChallenge/admin.test.ts
pnpm --filter @hockey/web exec vitest run src/admin/WeeklyChallengesAdmin.test.tsx
```

- [ ] **Step 6: Commit weekly rewards**

```bash
git add packages/server/src/weeklyChallenge packages/server/test/weeklyChallenge packages/web/src/api/weeklyChallenge.ts packages/web/src/admin/WeeklyChallengesAdmin.tsx packages/web/src/admin/WeeklyChallengesAdmin.test.tsx
git commit -m "feat(token-economy): reward early weekly completion"
```

### Task 7: Add one token-funded daily training session

**Files:**
- Modify: `packages/server/src/duel/training/routes.ts`
- Modify: `packages/server/test/duel/training.test.ts`
- Modify: `packages/web/src/api/training.ts`
- Modify: `packages/web/src/stores/trainingStore.ts`
- Modify: `packages/web/src/stores/trainingStore.test.ts`

**Interfaces:**
- Produces: training state `token_option` and start body `idempotency_key` / `use_token`.
- Consumes: `spendForCreatedActivity()`.

- [ ] **Step 1: Write failing training server tests**

Cover:

- first session is free and `session_number=1`;
- a closed first session exposes `token_option` when policy is enabled;
- second start creates `session_number=2`, then posts the spend in the same transaction;
- insufficient balance rolls back the inserted session;
- repeated idempotency key returns the same second session;
- a third session is rejected;
- active-session resume never spends again;
- local-day rollover restores the free session.

- [ ] **Step 2: Run training tests and verify RED**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/duel/training.test.ts
```

- [ ] **Step 3: Refactor reconciliation from one row to the active/latest row**

Replace `fetchTodayTrainingSession()` with:

```ts
async function fetchTodayTrainingSessions(
  client: PoolClient,
  userId: string,
  localToday: string,
): Promise<TrainingSessionRow[]>;
```

Order by `session_number`, lock the user first, and derive `freeUsed` / `tokenUsed` from server rows.

- [ ] **Step 4: Create and spend atomically**

Extend start body:

```ts
const startBodySchema = z.object({
  period_number: z.number().int().min(1).max(3),
  use_token: z.boolean().optional(),
  idempotency_key: z.string().uuid().optional(),
}).strict();
```

If a free slot exists, ignore `use_token` and create free. If only the paid slot exists, require both fields, insert session 2, call `spendForCreatedActivity`, write `token_ledger_id`, then commit.

- [ ] **Step 5: Update store contracts and run tests**

```bash
pnpm --filter @hockey/server exec vitest run test/duel/training.test.ts
pnpm --filter @hockey/web exec vitest run src/stores/trainingStore.test.ts
pnpm typecheck
```

- [ ] **Step 6: Commit training integration**

```bash
git add packages/server/src/duel/training/routes.ts packages/server/test/duel/training.test.ts packages/web/src/api/training.ts packages/web/src/stores/trainingStore.ts packages/web/src/stores/trainingStore.test.ts
git commit -m "feat(token-economy): add extra training session"
```

### Task 8: Gate new bonus attempts by per-game free limit and token

**Files:**
- Modify: `packages/server/src/bonusGames/types.ts`
- Modify: `packages/server/src/bonusGames/catalog.ts`
- Modify: `packages/server/src/bonusGames/service.ts`
- Modify: `packages/server/src/bonusGames/routes.ts`
- Modify: `packages/server/test/bonusGames/attempts.test.ts`
- Modify: `packages/server/test/bonusGames/catalog.test.ts`
- Modify: `packages/server/test/bonusGames/routes.test.ts`
- Modify: `packages/web/src/api/bonusGames.ts`

**Interfaces:**
- Produces: per-card `attempt_access` and atomic paid attempt creation.
- Consumes: Task 2 spend service and Task 4 per-game settings.

- [ ] **Step 1: Write failing bonus-game tests**

Assert:

- first new attempt per game/local day is free by default;
- resuming an active attempt returns 200 and never consumes quota/token;
- after the free attempt becomes failed/completed/abandoned, the next start requires explicit token confirmation;
- token creation inserts attempt and spend atomically;
- insufficient balance or spend limit leaves no attempt;
- changing admin limit affects only later starts;
- two concurrent paid starts produce one active attempt and one spend;
- next local day restores one free attempt.

- [ ] **Step 2: Run bonus tests and verify RED**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/bonusGames/attempts.test.ts test/bonusGames/catalog.test.ts test/bonusGames/routes.test.ts
```

- [ ] **Step 3: Add authoritative catalog access state**

Return:

```ts
attempt_access: {
  free_attempts_per_day: number;
  free_attempts_used: number;
  can_start_free: boolean;
  token_enabled: boolean;
  token_cost: number;
  can_start_with_token: boolean;
  unavailable_reason: string | null;
}
```

Count newly created attempts by `(user_id, bonus_game_id, created_at at user timezone)`. Do not count resume requests.

- [ ] **Step 4: Extend start contract and service transaction**

Body:

```ts
const startAttemptBody = z.object({
  use_token: z.boolean().optional(),
  idempotency_key: z.string().uuid().optional(),
}).strict();
```

`startOrResumeBonusAttempt()` already locks the user. After all catalog/unlock checks, choose free access if quota remains. Otherwise require token intent, insert the attempt, post the spend using the attempt ID, update `token_ledger_id`, and commit.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm --filter @hockey/server exec vitest run test/bonusGames/attempts.test.ts test/bonusGames/catalog.test.ts test/bonusGames/routes.test.ts
pnpm typecheck
```

- [ ] **Step 6: Commit bonus integration**

```bash
git add packages/server/src/bonusGames packages/server/test/bonusGames packages/web/src/api/bonusGames.ts
git commit -m "feat(token-economy): gate extra bonus attempts"
```

### Task 9: Add ordinary non-ranked token duels after the free limit

**Files:**
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/server/test/duel/amateur.test.ts`
- Modify: `packages/web/src/api/amateurDuel.ts`

**Interfaces:**
- Produces: direct-challenge token intent; accepted token-extra matches have `ranked=false` and normal reward snapshots.
- Produces: duel state `token_option` with server-provided cost, availability and reset reason.
- Consumes: Task 2 spend service.

- [ ] **Step 1: Write failing duel tests**

Cover:

- a challenge within the free ranked limit remains ranked and free;
- after the free limit, creating an invite with token intent does not spend immediately;
- decline/expiry never spends;
- accept rechecks the free limit, uses free access if available, otherwise spends the challenger's token;
- insufficient balance leaves the invite unaccepted and no ledger row;
- accepted token-extra match is `ranked=false`, retains configured win/draw rewards, and never changes rating/qualification tables;
- a second paid extra duel in the same local day is rejected;
- replaying accept is idempotent.

- [ ] **Step 2: Run duel tests and verify RED**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts
```

- [ ] **Step 3: Add token intent to direct challenge only**

Extend the existing challenge body with:

```ts
token_intent: z.object({
  idempotency_key: z.string().uuid(),
}).optional(),
```

Automatic matchmaking is unchanged in this plan. The stronger-opponent duel and token matchmaking require the separate power-coefficient design.

- [ ] **Step 4: Charge on accept, not invite**

Inside the accept transaction, lock both users in sorted UUID order, recalculate the initiating player's free ranked limit, and either keep the match ranked/free or:

```ts
const spend = await spendForCreatedActivity(client, {
  userId: match.token_intent_user_id,
  activityCode: 'duel',
  sourceType: 'amateur_duel_match',
  sourceId: match.id,
  idempotencyKey: match.token_idempotency_key,
  now,
});
```

Then set `ranked=false`, snapshot `rankedEnabled=false`, persist `token_ledger_id`, and continue the existing accept flow. Any failure rolls back acceptance and spend together.

- [ ] **Step 5: Run duel regression and typecheck**

```bash
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts test/tournament/duel-settlement-policy.test.ts
pnpm typecheck
```

- [ ] **Step 6: Commit duel integration**

```bash
git add packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts packages/web/src/api/amateurDuel.ts
git commit -m "feat(token-economy): add ordinary extra duel"
```

### Task 10: Build the shared resource bar and wallet

**Files:**
- Create: `packages/web/src/api/tokenEconomy.ts`
- Create: `packages/web/src/components/ResourceBar.tsx`
- Create: `packages/web/src/components/ResourceBar.test.tsx`
- Create: `packages/web/src/components/TokenWalletModal.tsx`
- Create: `packages/web/src/components/TokenWalletModal.test.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.test.tsx`
- Modify: `packages/web/src/api/apiFetch.ts`

**Interfaces:**
- Produces: `tokenEconomyKeys.state`, `fetchTokenState()`, `purchaseToken()` and shared resource UI.
- Consumes: Task 3 player API.

- [ ] **Step 1: Write failing resource-bar tests**

Verify:

- beginner sees coins/stars but no token resource;
- amateur sees coins/stars/tokens and not experience;
- a new amateur sees the 3-token onboarding modal once and acknowledgement survives reload/device change;
- each visible resource has a small accessible help action;
- help opens a standard modal;
- gameplay, login, admin and chat routes do not get an overlapping global bar;
- profile statistics still show exact experience.

- [ ] **Step 2: Write failing wallet tests**

Verify stars-only purchase when stars suffice, coin fallback only when stars do not suffice, disabled button plus reset explanation at limits, UUID idempotency reuse across retry, and no optimistic balance mutation before server success.

- [ ] **Step 3: Run web tests and verify RED**

```bash
pnpm --filter @hockey/web exec vitest run src/components/ResourceBar.test.tsx src/components/TokenWalletModal.test.tsx src/screens/ProfileScreen.test.tsx
```

- [ ] **Step 4: Implement API and query cache**

```ts
export const tokenEconomyKeys = {
  all: ['token-economy'] as const,
  state: () => [...tokenEconomyKeys.all, 'state'] as const,
  ledger: () => [...tokenEconomyKeys.all, 'ledger'] as const,
};
```

On purchase success, replace the state cache with the server response and invalidate `/me`/inventory consumers. On network failure, retain the same generated idempotency UUID for retry.

- [ ] **Step 5: Implement the shared UI**

Render the bar only on standard authenticated non-game screens. Token tap opens the wallet. Help copy explains each resource. When `show_onboarding` is true, show the standard modal with the approved 3-token copy and acknowledge it only after the user closes/accepts it. Move experience from `ProfileLockerIdentityCard` resource cells into the existing profile statistics area; do not create colored status stars in this task.

- [ ] **Step 6: Localize safe errors**

Add mappings for:

```text
token_feature_disabled
token_not_available_for_beginner
token_price_changed
token_purchase_daily_limit
token_purchase_weekly_limit
token_coin_weekly_limit
token_insufficient_funds
token_spend_daily_limit
token_activity_daily_limit
token_insufficient_balance
```

Browser alerts must show Russian product copy, never raw internal codes.

- [ ] **Step 7: Run web tests and typecheck**

```bash
pnpm --filter @hockey/web exec vitest run src/components/ResourceBar.test.tsx src/components/TokenWalletModal.test.tsx src/screens/ProfileScreen.test.tsx
pnpm --filter @hockey/web typecheck
```

- [ ] **Step 8: Commit shared token UI**

```bash
git add packages/web/src/api/tokenEconomy.ts packages/web/src/components/ResourceBar.tsx packages/web/src/components/ResourceBar.test.tsx packages/web/src/components/TokenWalletModal.tsx packages/web/src/components/TokenWalletModal.test.tsx packages/web/src/app/App.tsx packages/web/src/screens/ProfileScreen.tsx packages/web/src/screens/ProfileScreen.test.tsx packages/web/src/api/apiFetch.ts
git commit -m "feat(token-economy): add resource bar and wallet"
```

### Task 11: Add contextual spend confirmations to supported activities

**Files:**
- Create: `packages/web/src/components/TokenSpendModal.tsx`
- Create: `packages/web/src/components/TokenSpendModal.test.tsx`
- Modify: `packages/web/src/screens/DailyOverviewScreen.tsx`
- Modify: `packages/web/src/screens/BonusGamesScreen.tsx`
- Modify: `packages/web/src/screens/DuelScreen.tsx`
- Modify: their focused tests.

**Interfaces:**
- Produces: reusable confirmation and consistent cache refresh.
- Consumes: Tasks 7–10 activity contracts.

- [ ] **Step 1: Write failing interaction tests**

For each screen verify:

- free action remains primary while available;
- after the server reports free exhaustion, CTA becomes `Взять за 1 токен`;
- disabled limit state explains reason and reset time;
- confirmation names the activity and price but not the future balance;
- double tap sends one mutation with one idempotency UUID;
- successful creation closes the modal and updates token state;
- technical failure keeps authoritative balance and shows safe copy;
- voluntary exit never promises a refund.

- [ ] **Step 2: Run interaction tests and verify RED**

```bash
pnpm --filter @hockey/web exec vitest run src/components/TokenSpendModal.test.tsx src/screens/DailyOverviewScreen.test.tsx src/screens/BonusGamesScreen.test.tsx src/screens/DuelScreen.test.tsx
```

- [ ] **Step 3: Implement the standard modal**

```tsx
<AccessibleModal
  title={`Дополнительная ${activityLabel}?`}
  copy={`Потратить ${tokenCost} ${tokenWord} на запуск?`}
  closeBlocked={pending}
  onClose={onClose}
>
  <div className="modal-actions">
    <button className="btn btn--ghost" type="button" onClick={onClose}>Отмена</button>
    <button className="modal-primary btn btn--cta" type="button" onClick={onConfirm}>
      Взять за токен
    </button>
  </div>
</AccessibleModal>
```

No icon inside either text button.

- [ ] **Step 4: Wire training, bonus and direct-duel flows**

All screens render server-provided cost/availability and share a synchronous `pendingRef` double-tap guard. They never subtract a token locally; they update from the successful server response or refetch state.

- [ ] **Step 5: Run web regression and typecheck**

```bash
pnpm --filter @hockey/web exec vitest run src/components/TokenSpendModal.test.tsx src/screens/DailyOverviewScreen.test.tsx src/screens/BonusGamesScreen.test.tsx src/screens/DuelScreen.test.tsx
pnpm --filter @hockey/web typecheck
```

- [ ] **Step 6: Commit activity UI**

```bash
git add packages/web/src/components/TokenSpendModal.tsx packages/web/src/components/TokenSpendModal.test.tsx packages/web/src/screens/DailyOverviewScreen.tsx packages/web/src/screens/DailyOverviewScreen.test.tsx packages/web/src/screens/BonusGamesScreen.tsx packages/web/src/screens/BonusGamesScreen.test.tsx packages/web/src/screens/DuelScreen.tsx packages/web/src/screens/DuelScreen.test.tsx
git commit -m "feat(token-economy): add contextual spend flows"
```

### Task 12: Add ledger-backed analytics and operational visibility

**Files:**
- Modify: `packages/server/src/tokenEconomy/admin.ts`
- Modify: `packages/server/src/admin/routes.ts`
- Modify: `packages/server/test/tokenEconomy/admin.test.ts`
- Modify: `packages/web/src/admin/TokenEconomyAdmin.tsx`
- Modify: `packages/web/src/admin/TokenEconomyAdmin.test.tsx`
- Modify: `packages/web/src/admin/api.ts`

**Interfaces:**
- Produces: source/sink metrics, denial counts, balances, refund rate and reconciliation totals.
- Consumes: immutable token ledger and existing `event_log`.

- [ ] **Step 1: Write failing metric tests**

Insert deterministic ledger fixtures and assert exact totals for grants by source, purchase currency, spend by activity, balance distribution, daily/weekly limit denials, technical refunds, unique earners/spenders and reconciliation:

```ts
expect(metrics.reconciliation).toEqual({
  accountBalanceTotal: 17,
  ledgerDeltaTotal: 17,
  matches: true,
});
```

- [ ] **Step 2: Run analytics tests and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/admin.test.ts -t "analytics"
pnpm --filter @hockey/web exec vitest run src/admin/TokenEconomyAdmin.test.tsx -t "metrics"
```

- [ ] **Step 3: Implement SQL aggregates**

Use `generate_series` only for bounded dashboard periods and aggregate from `token_ledger`; do not duplicate financial truth in an analytics table. Record denied operations to `event_log` with safe categorical reasons and no client secrets.

- [ ] **Step 4: Add admin monitoring UI**

Show 7/30/90-day filters, source/sink tables, current total balance, refund rate and a red reconciliation warning when account totals differ from ledger deltas.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm --filter @hockey/server exec vitest run test/tokenEconomy/admin.test.ts
pnpm --filter @hockey/web exec vitest run src/admin/TokenEconomyAdmin.test.tsx
git add packages/server/src/tokenEconomy/admin.ts packages/server/src/admin/routes.ts packages/server/test/tokenEconomy/admin.test.ts packages/web/src/admin/TokenEconomyAdmin.tsx packages/web/src/admin/TokenEconomyAdmin.test.tsx packages/web/src/admin/api.ts
git commit -m "feat(token-economy): add economy monitoring"
```

### Task 13: Run full verification and prepare a dev-only rollout

**Files:**
- Modify: `docs/superpowers/specs/2026-08-28-token-economy-design.md` only if implementation evidence reveals a necessary clarification.
- Create: no production data scripts.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified dev candidate; no production release.

- [ ] **Step 1: Rebuild the shared game package**

```bash
pnpm --filter @hockey/game-core build
```

Expected: exit 0. This is required before server tests even though game-core behavior is unchanged.

- [ ] **Step 2: Run focused server suites**

```bash
pnpm --filter @hockey/server exec vitest run \
  test/tokenEconomy \
  test/achievements/claim.test.ts \
  test/weeklyChallenge \
  test/duel/training.test.ts \
  test/bonusGames \
  test/duel/amateur.test.ts \
  test/tournament/duel-settlement-policy.test.ts \
  test/routes/me.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 3: Run focused web suites**

```bash
pnpm --filter @hockey/web exec vitest run \
  src/components/ResourceBar.test.tsx \
  src/components/TokenWalletModal.test.tsx \
  src/components/TokenSpendModal.test.tsx \
  src/admin/TokenEconomyAdmin.test.tsx \
  src/admin/BonusGamesAdmin.test.tsx \
  src/admin/WeeklyChallengesAdmin.test.tsx \
  src/screens/ProfileScreen.test.tsx \
  src/screens/DailyOverviewScreen.test.tsx \
  src/screens/BonusGamesScreen.test.tsx \
  src/screens/DuelScreen.test.tsx \
  src/stores/trainingStore.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 4: Run monorepo gates**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: every command exits 0.

- [ ] **Step 5: Verify migration safety on a disposable dev database**

Apply the full migration chain to an empty database and a copy of synthetic pre-072 schema data. Verify existing coin balances, star balances, experience, bonus attempts, training sessions and duel matches are unchanged; every existing bonus game reads `free_attempts_per_day=1`.

- [ ] **Step 6: Perform rendered dev QA with synthetic users**

Check separately:

```text
beginner: token hidden, no starter ledger row
new amateur: exactly 3 tokens and one onboarding message
purchase: stars first; coin fallback only when stars are insufficient
limits: 1/day, 3/week, 1 coin/week, 3 spent/day
training: first free, second token, third blocked
bonus: first new attempt free, resume free, second new attempt token
duel: invite free until limit, no charge on decline, token charge on accept, no rating impact
failure: repeated taps/network retry create one operation
admin: save/readback/audit and per-game free limit
analytics: ledger and account totals reconcile
```

- [ ] **Step 7: Commit verified corrections in their owning task**

If verification reveals a defect, return to the task that owns that file, add a failing regression test, implement the minimal correction, rerun that task's focused suite, and commit the exact test plus implementation files with `fix(token-economy): address dev verification finding`. If verification is clean, create no commit.

- [ ] **Step 8: Deploy only after explicit user approval for execution and dev rollout**

Use the normal `dev` branch GitHub Actions path. Record the exact commit SHA, green CI/deploy run, applied migration, `/api/health`, and authenticated rendered QA. Do not merge to `main` and do not describe dev success as production acceptance.

---

## Follow-up Specifications Required

These are intentionally not implementation tasks in this plan:

1. **Experience status visual system** — final colors, tier names, iconography and placement in tables.
2. **Player power coefficient** — exact inputs, weights, caps, anti-gaming rules and recalculation policy.
3. **Ranked duel challenge** — stronger-opponent selection, twice-weekly limit and graded rewards using the approved power coefficient.
4. **Token-funded extra quests/challenges** — only after those catalogs support multiple concurrent/extra instances.
5. **Special competitions** — event-specific token spending above the base daily limit.
6. **Legacy economy DTO cleanup** — remove `balances.tokens` as the old coin alias only after all deployed clients consume `balances.coins` and `balances.activityTokens`.
