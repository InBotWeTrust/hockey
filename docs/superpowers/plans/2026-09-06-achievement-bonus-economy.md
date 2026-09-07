# Achievement and Bonus Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Обновить награды достижений и бонусных игр, добавить отдельные токены и ограничить бонусные игры двумя ежедневными попытками на каждое направление.

**Architecture:** Значения каталога обновляются forward-only миграцией и теми же значениями в TypeScript seed-каталоге. Дневной лимит бонусных попыток проверяется сервером транзакционно по часовому поясу пользователя и истории созданных попыток; клиент только показывает серверный остаток. Награда достижения начисляет монеты, звёзды, опыт и новые токены в одной транзакции, а старые завершённые и уже полученные достижения не переоткрываются.

**Tech Stack:** PostgreSQL 16 migrations, Fastify 4, TypeScript strict/NodeNext, React 18, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-achievement-bonus-economy-design.md`

## Global Constraints

- Опыт равен звёздам для всех изменяемых наград.
- Уровни достижений не добавляются.
- `monthly-top-3` и настраиваемые призы турниров не изменяются.
- Награды уже полученных достижений и уже созданных бонусных попыток не пересчитываются.
- Граница дневного лимита бонусных попыток определяется `users.timezone`.
- Существующий глобальный порядок блокировок экономики сохраняется: `users` → `user_currency_account` → token account.
- Изменения БД выполняются только forward-only миграцией; ручное изменение dev/prod БД запрещено.
- Перед server-тестами обязательно собрать `@hockey/game-core`.
- GLM-review для этой работы отключён по прямому указанию пользователя.

---

### Task 1: Зафиксировать новую экономику каталога миграцией

**Files:**
- Create: `packages/server/db/migrations/106_achievement_bonus_economy.sql`
- Modify: `packages/server/src/achievements/catalog.ts`
- Create: `packages/server/test/achievements/catalog.test.ts`
- Test: `packages/server/test/bonusGames/catalog.test.ts`

**Interfaces:**
- Consumes: существующие `achievements`, `bonus_game`, `user_achievements`, `bonus_game_attempt`.
- Produces: `achievements.reward_tokens integer not null default 0`; согласованные значения каталога; скрытые удалённые достижения; бесплатный последовательный каталог бонусных игр.

- [ ] **Step 1: Написать падающий тест миграции каталога достижений**

Добавить табличный тест, который после `applyMigrations` читает все изменяемые ID и сравнивает `{reward_currency, reward_stars, reward_experience, reward_tokens, availability}` с таблицей из спека. Отдельно проверить:

```ts
expect(byId.get('pro-ticket')).toMatchObject({
  reward_currency: 0,
  reward_stars: 0,
  reward_experience: 0,
  reward_tokens: 0,
});
expect(byId.get('monthly-top-3')).toMatchObject(previousMonthlyTop3Reward);
for (const id of ['almost-perfect-training', 'handled-pressure', 'master-arsenal']) {
  expect(byId.get(id)?.availability).toBe('hidden');
}
```

- [ ] **Step 2: Написать падающий тест 23 бонусных наград и бесплатного доступа**

Проверить все 23 `slug`: `reward_coins = 0`, `reward_experience = reward_stars`, точные звёзды из спека, `access_type = 'free'`, `unlock_price_stars = 0`. Для десяти `skill_code = 'speed'` проверить уменьшение общего `qualification_rules.activeTimeMs` ровно на `5000`, равенство нового `activeTimeMs` сумме `period_rules[*].durationMs` и увеличение `revision`; для `accuracy` время не меняется.

- [ ] **Step 3: Запустить тесты и увидеть ожидаемое падение**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/achievements/catalog.test.ts test/bonusGames/catalog.test.ts
```

Expected: FAIL — отсутствует `reward_tokens`, а значения наград и доступа ещё старые.

- [ ] **Step 4: Реализовать forward-only миграцию `106_achievement_bonus_economy.sql`**

Миграция должна:

1. добавить `achievements.reward_tokens integer not null default 0 check (reward_tokens >= 0)`;
2. одной временной таблицей `(id, coins, stars, experience, tokens)` обновить точные значения достижений из спека;
3. установить `availability = 'hidden'` для трёх исключённых ID, не удаляя `user_achievements`;
4. не обновлять `monthly-top-3`;
5. временной таблицей `(slug, stars)` обновить 23 бонусные игры: `reward_coins = 0`, `reward_stars = stars`, `reward_experience = stars`, `access_type = 'free'`, `unlock_price_stars = 0`, `revision = revision + 1`;
6. только для `skill_code = 'speed'` уменьшить `qualification_rules.activeTimeMs` ровно на `5000` и заново распределить новый общий лимит по периодам: целую часть деления дать каждому периоду, остаток миллисекунд добавить последнему периоду; сумма периодов обязана совпасть с новым `activeTimeMs`;
7. не изменять `rules_snapshot` и `reward_snapshot` уже созданных попыток.

- [ ] **Step 5: Синхронизировать `ACHIEVEMENT_SEEDS`**

Добавить `rewardTokens` в `AchievementSeed`, задать значения точно по спеку, убрать три исключённые записи из активного seed-каталога через `availability: 'hidden'`, оставить `monthly-top-3` без изменений. Seed и миграция должны иметь один табличный тест на равенство значений, чтобы они больше не расходились.

- [ ] **Step 6: Запустить тесты каталога**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/achievements/catalog.test.ts test/bonusGames/catalog.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/db/migrations/106_achievement_bonus_economy.sql packages/server/src/achievements/catalog.ts packages/server/test/achievements/catalog.test.ts packages/server/test/bonusGames/catalog.test.ts
git commit -m "feat(economy): rebalance achievements and bonus games"
```

---

### Task 2: Добавить отдельные токены в получение достижения

**Files:**
- Modify: `packages/server/db/migrations/106_achievement_bonus_economy.sql`
- Modify: `packages/server/src/achievements/routes.ts`
- Modify: `packages/server/src/achievements/service.ts`
- Modify: `packages/server/src/admin/routes.ts`
- Modify: `packages/web/src/api/achievements.ts`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Modify: `packages/web/src/screens/AchievementsScreen.tsx`
- Test: `packages/server/test/achievements/claim.test.ts`
- Test: `packages/server/test/admin/routes.test.ts`
- Test: `packages/web/src/screens/AchievementsScreen.test.tsx`
- Test: `packages/web/src/admin/AdminScreen.test.tsx`

**Interfaces:**
- Consumes: `achievements.reward_tokens`; существующие claim endpoint и `user_currency_account`.
- Produces: `user_reward_token_account(user_id, balance, created_at, updated_at)`; `achievement_token_ledger`; DTO-поле `rewardTokens`; claim response `rewards.tokens` и `balances.tokenBalance`.

- [ ] **Step 1: Написать падающий интеграционный тест атомарного claim**

Настроить `first-goal` как `12 монет / 3 звезды / 3 опыта / 2 токена`, завершить достижение и вызвать claim. Проверить:

```ts
expect(response.json()).toMatchObject({
  rewards: { currency: 12, stars: 3, experience: 3, tokens: 2 },
  balances: { currencyBalance: 12, starBalance: 3, experienceBalance: 3, tokenBalance: 2 },
});
```

Повторный claim должен вернуть `409`, а баланс токенов и token ledger должны содержать ровно одно начисление.

- [ ] **Step 2: Дополнить миграцию токен-счётом и журналом**

Создать:

```sql
create table user_reward_token_account (
  user_id uuid primary key references users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table achievement_token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  achievement_id text not null references achievements(id) on delete restrict,
  amount integer not null check (amount > 0),
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);
```

- [ ] **Step 3: Начислять четыре части награды атомарно**

В `POST /achievements/:achievementId/claim` выбрать `reward_tokens`, сохранить порядок блокировок `users` → `user_currency_account` → `user_reward_token_account`, затем:

- увеличить `users.xp` и `users.experience`;
- увеличить монеты в `user_currency_account`;
- `insert ... on conflict do nothing` token account и увеличить его balance;
- при `reward_tokens > 0` вставить `achievement_token_ledger`;
- только после всех операций выставить `claimed_at` и сделать commit.

Любая ошибка должна откатить все четыре баланса и оставить достижение неполученным.

- [ ] **Step 4: Провести токены через публичные и административные DTO**

Добавить `rewardTokens: number` в `ProfileAchievementDTO`, `AchievementDto`, admin DTO и patch schema. В UI деталей/получения отображать токены только при значении больше нуля, используя отдельный tone/icon, не переименовывая монеты.

- [ ] **Step 5: Запустить focused server/web тесты**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/achievements/claim.test.ts test/admin/routes.test.ts
pnpm --filter @hockey/web exec vitest run src/screens/AchievementsScreen.test.tsx src/admin/AdminScreen.test.tsx
```

Expected: PASS; повторный claim не дублирует ни одну валюту.

- [ ] **Step 6: Commit**

```bash
git add packages/server/db/migrations/106_achievement_bonus_economy.sql packages/server/src/achievements/routes.ts packages/server/src/achievements/service.ts packages/server/src/admin/routes.ts packages/web/src/api/achievements.ts packages/web/src/admin/api.ts packages/web/src/admin/AdminScreen.tsx packages/web/src/screens/AchievementsScreen.tsx packages/server/test/achievements/claim.test.ts packages/server/test/admin/routes.test.ts packages/web/src/screens/AchievementsScreen.test.tsx packages/web/src/admin/AdminScreen.test.tsx
git commit -m "feat(achievements): grant token rewards"
```

---

### Task 3: Ограничить бонусные попытки отдельно по направлениям

**Files:**
- Modify: `packages/server/db/migrations/106_achievement_bonus_economy.sql`
- Modify: `packages/server/src/bonusGames/types.ts`
- Modify: `packages/server/src/bonusGames/catalog.ts`
- Modify: `packages/server/src/bonusGames/service.ts`
- Modify: `packages/server/src/bonusGames/routes.ts`
- Test: `packages/server/test/bonusGames/attempts.test.ts`
- Test: `packages/server/test/bonusGames/routes.test.ts`

**Interfaces:**
- Consumes: `bonus_game.skill_code`, `bonus_game_attempt.created_at`, `users.timezone`, последовательность `sort_order`.
- Produces: `BonusAttemptAllowanceDTO { skillCode, dailyLimit, used, remaining, resetsAt }`; catalog response `attempt_allowances` для `speed` и `accuracy`.

- [ ] **Step 1: Написать падающие тесты дневной квоты**

Покрыть сценарии:

1. две новые speed-попытки в одном локальном дне разрешены, третья возвращает `409 bonus_daily_attempt_limit`;
2. две accuracy-попытки считаются независимо от speed;
3. две попытки можно создать для одной игры или разных уже открытых игр;
4. возобновление активной попытки не увеличивает `used`;
5. `failed` и `abandoned` считаются использованными;
6. после локальной полуночи по `users.timezone` квота снова равна двум;
7. параллельные запросы на последнюю попытку дают один `201`, а второй `409`.

- [ ] **Step 2: Добавить журнал дневных слотов**

В миграции создать таблицу:

```sql
create table bonus_game_daily_attempt_slot (
  user_id uuid not null references users(id) on delete cascade,
  local_date date not null,
  skill_code text not null check (skill_code in ('speed', 'accuracy')),
  slot smallint not null check (slot between 1 and 2),
  attempt_id uuid not null unique references bonus_game_attempt(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, local_date, skill_code, slot)
);
```

Существующие исторические попытки не backfill-ить: лимит начинает действовать с деплоя и не блокирует пользователя из-за старых запусков того же дня.

- [ ] **Step 3: Резервировать слот в транзакции создания попытки**

В `startOrResumeBonusAttempt` после проверки/возобновления активной попытки:

- вычислить локальную дату пользователя через PostgreSQL `($now at time zone users.timezone)::date`;
- получить advisory transaction lock по `(user_id, local_date, skill_code)`;
- выбрать первый свободный слот `1..2`;
- создать попытку и строку slot в одной транзакции;
- при отсутствии слота бросить `AppError('bonus_daily_attempt_limit', ..., 409)`.

- [ ] **Step 4: Вернуть остаток и время сброса в каталоге**

`GET /bonus-games` должен возвращать:

```ts
attempt_allowances: {
  speed: { skillCode: 'speed', dailyLimit: 2, used: 0 | 1 | 2, remaining: 2 | 1 | 0, resetsAt: string },
  accuracy: { skillCode: 'accuracy', dailyLimit: 2, used: 0 | 1 | 2, remaining: 2 | 1 | 0, resetsAt: string },
}
```

`resetsAt` — ближайшая локальная полночь пользователя, переведённая в ISO UTC.

- [ ] **Step 5: Запустить focused server tests**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/bonusGames/attempts.test.ts test/bonusGames/routes.test.ts
```

Expected: PASS, включая конкурентный сценарий.

- [ ] **Step 6: Commit**

```bash
git add packages/server/db/migrations/106_achievement_bonus_economy.sql packages/server/src/bonusGames/types.ts packages/server/src/bonusGames/catalog.ts packages/server/src/bonusGames/service.ts packages/server/src/bonusGames/routes.ts packages/server/test/bonusGames/attempts.test.ts packages/server/test/bonusGames/routes.test.ts
git commit -m "feat(bonus-games): add daily skill attempt limits"
```

---

### Task 4: Убрать покупку и показать остаток попыток в бонусных играх

**Files:**
- Modify: `packages/web/src/api/apiFetch.ts`
- Modify: `packages/web/src/api/bonusGames.ts`
- Modify: `packages/web/src/screens/BonusGamesScreen.tsx`
- Modify: `packages/web/src/screens/BonusGamesScreen.test.tsx`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.test.tsx`

**Interfaces:**
- Consumes: catalog `attempt_allowances`; все игры имеют `access_type = 'free'` и открываются только через predecessor completion.
- Produces: две видимые квоты попыток; отсутствие purchase CTA; понятное сообщение при исчерпании дневного лимита.

- [ ] **Step 1: Написать падающие UI-тесты**

Проверить:

- вкладка «Скорость» показывает «Попытки сегодня: 2 из 2», а «Точность» — свой независимый остаток;
- после одного запуска выбранный раздел показывает `1 из 2`;
- при `remaining = 0` открытые карточки не запускают новую попытку и показывают время следующего доступа;
- нигде нет текста «Открыть за … звёзд» и запроса `POST /unlock`;
- закрытая последовательностью карточка объясняет, какую предыдущую игру нужно пройти;
- обе попытки разрешено направить в одну и ту же карточку.

- [ ] **Step 2: Обновить API-типы и пользовательскую ошибку**

Добавить `BonusAttemptAllowance` и `attempt_allowances` в `BonusGameCatalogResponse`; для `bonus_daily_attempt_limit` добавить текст «Попытки на сегодня закончились. Новые будут доступны после полуночи.».

- [ ] **Step 3: Удалить purchase-flow из пользовательского каталога**

Удалить из `BonusGamesScreen` состояние `purchaseGame`, `expectedPriceStars`, confirmation modal и вызов unlock endpoint. Не удалять серверный endpoint в этой миграции: оставить совместимым для старого клиента, но при бесплатном каталоге он становится идемпотентным no-op.

- [ ] **Step 4: Показать квоту выбранного направления**

Под tabs вывести компактную строку без отдельной тяжёлой карточки: `Попытки сегодня: {remaining} из 2`. При нуле дополнить локализованным временем `resetsAt`; кнопка запуска должна быть disabled до сброса, кроме возобновления уже активной попытки.

- [ ] **Step 5: Запустить focused web tests**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/screens/BonusGamesScreen.test.tsx src/screens/BonusGamePlayScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/api/apiFetch.ts packages/web/src/api/bonusGames.ts packages/web/src/screens/BonusGamesScreen.tsx packages/web/src/screens/BonusGamesScreen.test.tsx packages/web/src/screens/BonusGamePlayScreen.test.tsx
git commit -m "feat(bonus-games): show daily attempt allowance"
```

---

### Task 5: Проверить миграцию, регрессии и dev-ready состояние

**Files:**
- Modify if required by generated formatting only: files from Tasks 1–4
- Test: all affected packages

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: locally verified commit ready for separate explicit dev deployment.

- [ ] **Step 1: Проверить миграцию на чистой тестовой БД**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server db:migrate
```

Expected: migration `106_achievement_bonus_economy.sql` applies once; second run is a no-op; all constraints valid.

- [ ] **Step 2: Запустить полную статическую проверку и сборку**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Запустить focused integration and UI suite**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/achievements test/bonusGames
pnpm --filter @hockey/web exec vitest run src/screens/AchievementsScreen.test.tsx src/screens/BonusGamesScreen.test.tsx src/screens/BonusGamePlayScreen.test.tsx src/admin/AdminScreen.test.tsx
```

Expected: PASS. Если `TEST_*` инфраструктура отсутствует, интеграционные тесты должны быть отмечены `BLOCKED`, а не выданы за пройденные.

- [ ] **Step 4: Запустить полный набор тестов**

Run:

```bash
pnpm test
```

Expected: PASS без новых падений.

- [ ] **Step 5: Провести локальный smoke сценариев**

Проверить под обычным любительским пользователем:

1. каталоги показывают точные награды;
2. исключённые достижения отсутствуют;
3. achievement claim начисляет все четыре указанные части ровно один раз;
4. две speed-попытки разрешены, третья блокируется;
5. accuracy всё ещё имеет свои две попытки;
6. после прохождения открывается следующая игра;
7. старый purchase CTA отсутствует;
8. speed countdown короче на 5 секунд;
9. активная попытка после обновления страницы возобновляется без дополнительного списания слота.

Expected: PASS на мобильной ширине 360 px и desktop 1280 px.

- [ ] **Step 6: Проверить diff и создать итоговый коммит**

Run:

```bash
git diff --check
git status --short
```

Не добавлять пользовательский каталог `output/`. Затем:

```bash
git add packages/server packages/web docs/superpowers/specs/2026-09-06-achievement-bonus-economy-design.md docs/superpowers/plans/2026-09-06-achievement-bonus-economy.md
git commit -m "test(economy): verify achievement and bonus rewards"
```

Expected: рабочее дерево чистое, кроме существующего `output/`; dev не изменён до отдельной прямой команды пользователя.
