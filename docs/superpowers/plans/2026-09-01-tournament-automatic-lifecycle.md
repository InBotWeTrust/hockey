# Tournament Automatic Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автоматизировать регистрацию, подготовку календаря, запуск плей-офф и завершение турнира, оставив администратору только ручной запуск регулярного сезона и обработку исключений.

**Architecture:** Идемпотентный `reconcileTournamentLifecycle()` вычисляет и применяет только разрешённый следующий переход для турниров с опубликованным маркером `automaticLifecycleVersion: 1`. Он вызывается независимым фоновым plugin, лениво из API и после значимых мутаций; старые турниры остаются выключенными до явного dry-run/apply аудита. Существующие транзакционные сервисы генерации календаря, старта плей-офф и завершения финала остаются единственными владельцами записей и блокировок.

**Tech Stack:** TypeScript strict mode, Fastify 4, PostgreSQL 16, React 18, TanStack Query, Vitest, Testing Library, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-01-tournament-automatic-lifecycle-design.md`

## Global Constraints

- Регистрация открывается и закрывается по абсолютным `timestamptz`, рассчитанным из часового пояса турнира; локальные даты плей-офф разрешаются DST-безопасными функциями из `playoffScheduling.ts`.
- Регулярный сезон всегда запускается только администратором действием «Начать регулярный сезон».
- `playoffSize` не уменьшается автоматически и остаётся одним из `2 | 4 | 8 | 16`.
- Для `head_to_head` календарь содержит туры и пары; для `daily_aggregate` и `classic` — только игровые дни.
- Плей-офф для всех трёх источников регулярки создаёт только турнирные дуэли по опубликованным правилам раундов.
- Повторный reconcile не создаёт повторные игровые дни, пары, сетки, награды, push-сообщения или административные события.
- Существующие опубликованные турниры не включаются автоматически до явного аудита; автоматизация применяется только при `rules_snapshot.automaticLifecycleVersion === 1`.
- Новых разрушающих миграций нет; разрешена только add-only миграция шаблона административного уведомления.
- UI-тексты только на русском и без технических статусов/кодов.
- GLM review не запускать по прямому указанию пользователя.
- Реализация остаётся в worktree `.worktrees/tournament-automatic-lifecycle` на ветке `co_dex/tournament-automatic-lifecycle` до отдельного PR в `dev`.

---

### Task 1: Версионирование автоматического lifecycle и чистые решения о переходах

**Files:**
- Modify: `packages/server/src/tournament/lifecycleRules.ts`
- Create: `packages/server/src/tournament/automaticLifecycle.ts`
- Test: `packages/server/test/tournament/automaticLifecycle.test.ts`
- Test: `packages/server/test/tournament/lifecycleRules.test.ts`

**Interfaces:**
- Consumes: `TournamentRulesSnapshot`, `TournamentStatus`, опубликованные даты турнира и `TournamentConfig`.
- Produces: `AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION`, `automaticLifecycleVersion(rules)`, `evaluateTournamentLifecycle(snapshot, now)` и публичные типы состояния, которые будут использовать server DTO, worker и UI.

- [ ] **Step 1: Написать падающие unit-тесты маркера и решений**

```ts
it('marks newly published tournament rules for automatic lifecycle v1', () => {
  const normalized = normalizePublishedTournamentLifecycleRules(validRules);
  expect(normalized.automaticLifecycleVersion).toBe(1);
});

it.each([
  ['before registration opens', 'registration_waiting'],
  ['while registration is open', 'registration_open'],
  ['after registration closes with enough players', 'generate_schedule'],
  ['after registration closes without enough players', 'block_registration'],
  ['with a generated schedule', 'await_manual_regular_start'],
  ['when regular results are complete before playoff time', 'await_playoff_time'],
  ['when regular results are complete after playoff time', 'start_playoff'],
])('%s returns %s', (_label, expected) => {
  expect(evaluateTournamentLifecycle(fixtureFor(_label), NOW).action).toBe(expected);
});

it('skips a published legacy tournament without the marker', () => {
  expect(evaluateTournamentLifecycle(legacySnapshot, NOW)).toMatchObject({
    action: 'legacy_requires_audit',
  });
});
```

- [ ] **Step 2: Запустить тесты и подтвердить RED**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/automaticLifecycle.test.ts test/tournament/lifecycleRules.test.ts`

Expected: FAIL из-за отсутствующих `evaluateTournamentLifecycle` и `automaticLifecycleVersion`.

- [ ] **Step 3: Добавить точные типы и чистый evaluator**

```ts
export const AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION = 1;

export type TournamentLifecycleAction =
  | 'legacy_requires_audit'
  | 'registration_waiting'
  | 'registration_open'
  | 'generate_schedule'
  | 'block_registration'
  | 'await_manual_regular_start'
  | 'regular_active'
  | 'await_regular_results'
  | 'await_playoff_time'
  | 'start_playoff'
  | 'playoff_active'
  | 'terminal'
  | 'unchanged';

export interface TournamentLifecycleSnapshot {
  tournamentId: string;
  status: TournamentStatus;
  revision: number;
  automaticLifecycleVersion: number | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  approvedParticipantCount: number;
  playoffSize: number;
  scheduleExists: boolean;
  regularResultsComplete: boolean;
  playoffStartsAt: Date | null;
}

export interface TournamentLifecycleDecision {
  action: TournamentLifecycleAction;
  dueAt: Date | null;
  approvedParticipantCount: number;
  requiredParticipantCount: number;
  reason: 'not_enough_participants' | 'regular_results_incomplete' | 'legacy_requires_audit' | null;
}
```

`normalizePublishedTournamentLifecycleRules()` должен добавлять `automaticLifecycleVersion: 1` только для новой публикации; чтение старой ревизии не нормализует её задним числом.

- [ ] **Step 4: Запустить unit-тесты и проверить GREEN**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/automaticLifecycle.test.ts test/tournament/lifecycleRules.test.ts`

Expected: PASS; даты до/на/после границы дают разные действия без зависимости от системного часового пояса процесса.

- [ ] **Step 5: Закоммитить чистую модель lifecycle**

```bash
git add packages/server/src/tournament/lifecycleRules.ts packages/server/src/tournament/automaticLifecycle.ts packages/server/test/tournament/automaticLifecycle.test.ts packages/server/test/tournament/lifecycleRules.test.ts
git commit -m "feat(tournaments): define automatic lifecycle decisions"
```

### Task 2: Идемпотентный reconcile регистрации и календаря

**Files:**
- Modify: `packages/server/src/tournament/automaticLifecycle.ts`
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/push/preferences.ts`
- Modify: `packages/server/src/push/tournament.ts`
- Create: `packages/server/db/migrations/085_tournament_admin_attention_notification.sql`
- Create: `packages/server/test/tournament/automaticLifecycle.integration.test.ts`
- Modify: `packages/server/test/tournament/migration-contract.test.ts`

**Interfaces:**
- Consumes: `generateRegularSchedule(pool, tournamentId, expectedRevision)`, `enqueueTournamentPush()` и решение Task 1.
- Produces: `reconcileTournamentLifecycle(pool, options): Promise<TournamentLifecycleReconcileReport>`, стабильные события `tournament.registration_blocked` / `tournament.playoff_blocked` и повторобезопасный переход `registration → scheduling | registration_blocked`.

- [ ] **Step 1: Написать integration-тесты достаточного и недостаточного состава**

```ts
it('creates a head-to-head schedule once after registration closes but leaves regular manual', async () => {
  const tournament = await seedAutomaticTournament({ source: 'head_to_head', approved: 4, playoffSize: 4 });
  const first = await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
  const second = await reconcileTournamentLifecycle(pool, { now: minuteAfter(CLOSES_AT), tournamentId: tournament.id });
  expect(first.items[0]).toMatchObject({ before: 'registration', after: 'scheduling', action: 'generate_schedule' });
  expect(second.items[0]).toMatchObject({ action: 'await_manual_regular_start', changed: false });
  expect(await counts(pool, tournament.id)).toMatchObject({ matchdays: 1, rounds: 3, fixtures: 6 });
});

it.each(['daily_aggregate', 'classic'] as const)('creates only matchdays for %s', async (source) => {
  const tournament = await seedAutomaticTournament({ source, approved: 4, playoffSize: 4 });
  await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id, classicSeedSecret: 'test-secret' });
  expect(await counts(pool, tournament.id)).toMatchObject({ matchdays: 3, rounds: 0, fixtures: 0 });
});

it('blocks without shrinking playoff size and notifies creator and admins once', async () => {
  const tournament = await seedAutomaticTournament({ approved: 3, playoffSize: 4, subscribedAdmins: 2 });
  await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
  await reconcileTournamentLifecycle(pool, { now: minuteAfter(CLOSES_AT), tournamentId: tournament.id });
  expect(await tournamentRow(pool, tournament.id)).toMatchObject({ status: 'registration_blocked', playoffSize: 4 });
  expect(await deliveryCount(pool, `${tournament.id}:registration-blocked:${tournament.revision}`)).toBe(2);
});
```

- [ ] **Step 2: Запустить integration-тест и подтвердить RED**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server exec vitest run test/tournament/automaticLifecycle.integration.test.ts`

Expected: FAIL, потому что reconcile ещё не читает/не применяет состояние и отсутствует `tournament.registration_blocked`.

- [ ] **Step 3: Реализовать загрузку snapshot и reconcile одного/нескольких турниров**

```ts
export interface ReconcileTournamentLifecycleOptions {
  now: Date;
  tournamentId?: string;
  classicSeedSecret?: string;
  dryRun?: boolean;
}

export interface TournamentLifecycleReconcileItem {
  tournamentId: string;
  before: TournamentStatus;
  after: TournamentStatus;
  action: TournamentLifecycleAction;
  changed: boolean;
  reason: TournamentLifecycleDecision['reason'];
}

export interface TournamentLifecycleReconcileReport {
  scanned: number;
  changed: number;
  items: TournamentLifecycleReconcileItem[];
}

export async function reconcileTournamentLifecycle(
  pool: Pool,
  options: ReconcileTournamentLifecycleOptions,
): Promise<TournamentLifecycleReconcileReport>;
```

Алгоритм для каждого ID:

1. Читать статус, опубликованную ревизию, даты, правила, число approved, наличие matchday/round/series и полноту результатов.
2. Вычислить решение чистой функцией.
3. Для `generate_schedule` вызвать существующий транзакционный `generateRegularSchedule`; его `lockTournament()` остаётся единственным row lock.
4. Для `block_registration` использовать тот же путь `generateRegularSchedule`, который атомарно сохраняет `registration_blocked` и не меняет `playoffSize`.
5. После успешной блокировки поставить push создателю и всем пользователям с `role='admin'`, дедуплицируя `eventKey = ${tournamentId}:registration-blocked:${revision}`.
6. На `dryRun` не вызывать mutation/push и вернуть только предлагаемое действие.
7. При повторе вернуть `changed: false`; существующие matchday/round/fixture не удалять и не пересоздавать.
8. В `generateRegularSchedule()` при `status='scheduling'` и уже существующем matchday вернуть текущие количества как unchanged; не выполнять текущий `delete from tournament_matchday`. Это закрывает гонку двух reconcile, которые оба увидели закрывшуюся регистрацию до первого commit.

- [ ] **Step 4: Добавить add-only шаблон уведомления**

```sql
insert into push_notification_templates
  (key, category, title, body, trigger_description, click_url)
values
  (
    'tournament.registration_blocked',
    'tournament',
    'Турнир требует внимания',
    'В турнире «{{tournamentTitle}}» подтверждено {{approvedCount}} из {{requiredCount}} участников.',
    'Регистрация завершилась, но участников недостаточно для выбранного плей-офф.',
    '/admin'
  ),
  (
    'tournament.playoff_blocked',
    'tournament',
    'Плей-офф ожидает результатов',
    'В турнире «{{tournamentTitle}}» ещё не завершены все игры регулярного сезона.',
    'Время старта плей-офф наступило, но результаты регулярного сезона неполны.',
    '/admin'
  )
on conflict (key) do nothing;
```

Расширить `PushEventType` и `isPushEventAllowed()`; не создавать новую настройку предпочтений.

- [ ] **Step 5: Проверить повторное применение миграций и GREEN**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/automaticLifecycle.integration.test.ts test/tournament/migration-contract.test.ts`

Expected: PASS; повторный reconcile оставляет те же количества сущностей и ровно один delivery на администратора.

- [ ] **Step 6: Закоммитить автоматическое закрытие регистрации**

```bash
git add packages/server/src/tournament/automaticLifecycle.ts packages/server/src/tournament/service.ts packages/server/src/push/preferences.ts packages/server/src/push/tournament.ts packages/server/db/migrations/085_tournament_admin_attention_notification.sql packages/server/test/tournament/automaticLifecycle.integration.test.ts packages/server/test/tournament/migration-contract.test.ts
git commit -m "feat(tournaments): reconcile registration and schedules"
```

### Task 3: Автоматический и DST-безопасный запуск плей-офф

**Files:**
- Modify: `packages/server/src/tournament/automaticLifecycle.ts`
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/tournament/playoffScheduling.ts`
- Test: `packages/server/test/tournament/automaticLifecycle.integration.test.ts`
- Modify: `packages/server/test/tournament/playoffScheduling.test.ts`
- Modify: `packages/server/test/tournament/service.integration.test.ts`

**Interfaces:**
- Consumes: `startTournamentPlayoffs(pool, tournamentId, now)`, `finalizeTournamentDailyDay()`, `finalizeClassicTournamentDay()` и `playoffRoundRules()`.
- Produces: `configuredPlayoffStartAt(rules): Date | null`, `rebaseRoundGameDaysAtOrAfter(timezone, days, notBefore)` и автоматические действия `await_regular_results | await_playoff_time | start_playoff`.

- [ ] **Step 1: Написать падающие тесты времени и полноты результатов**

```ts
it('does not start playoffs before the first configured game time', async () => {
  const tournament = await seedCompletedRegular({ playoffStartsAt: '2030-10-27T18:00:00+03:00' });
  await reconcileTournamentLifecycle(pool, { now: new Date('2030-10-27T14:59:59Z'), tournamentId: tournament.id });
  expect((await tournamentRow(pool, tournament.id)).status).toBe('regular');
});

it('starts playoffs once and materializes only duel fixtures at the due instant', async () => {
  const tournament = await seedCompletedRegular({ source: 'classic', playoffStartsAt: '2030-10-27T18:00:00+03:00' });
  await reconcileTournamentLifecycle(pool, { now: new Date('2030-10-27T15:00:00Z'), tournamentId: tournament.id, classicSeedSecret: 'test-secret' });
  await reconcileTournamentLifecycle(pool, { now: new Date('2030-10-27T15:01:00Z'), tournamentId: tournament.id, classicSeedSecret: 'test-secret' });
  expect(await playoffCounts(pool, tournament.id)).toMatchObject({ series: 3, duplicateSeries: 0, duelFixturesOnly: true });
});

it('keeps regular active and reports incomplete results', async () => {
  const tournament = await seedIncompleteRegular();
  const report = await reconcileTournamentLifecycle(pool, { now: PLAYOFF_DUE, tournamentId: tournament.id });
  expect(report.items[0]).toMatchObject({ action: 'await_regular_results', reason: 'regular_results_incomplete' });
  expect(await deliveryCount(pool, `${tournament.id}:playoff-blocked:${tournament.revision}`)).toBe(ADMIN_RECIPIENTS);
});

it('moves a missed playoff schedule into the nearest future local slot', () => {
  const rebased = rebaseRoundGameDaysAtOrAfter('Europe/Berlin', configuredDays, new Date('2030-10-27T02:15:00Z'));
  expect(rebased[0]!.firstGameStartsAt.getTime()).toBeGreaterThan(new Date('2030-10-27T02:15:00Z').getTime());
  expect(rebased.map((day) => day.maxResultGames)).toEqual(configuredDays.map((day) => day.maxResultGames));
});
```

- [ ] **Step 2: Запустить focused tests и подтвердить RED**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/playoffScheduling.test.ts test/tournament/automaticLifecycle.integration.test.ts`

Expected: FAIL на отсутствующем rebase и отсутствии автоматического старта.

- [ ] **Step 3: Реализовать определение готовности регулярки**

Для `head_to_head` считать готовыми только ненулевое количество regular fixtures и все статусы из `settled | forfeit | cancelled`. Для `daily_aggregate` и `classic` перед проверкой вызывать существующие финализаторы истёкших matchday; готовность равна `approved/withdrawn/removed/disqualified participants × dailyDays` строкам `tournament_daily_result`.

`configuredPlayoffStartAt()` берёт первый раунд из `playoffRounds`:

- `scheduleDays[0]` → дата + `firstWaveLocalTime` в `config.timezone`;
- иначе `firstGameStartsAt`;
- если обе настройки отсутствуют, возвращает `null`, а reconcile сообщает административную блокировку вместо самовольного старта.

Когда время плей-офф уже наступило, но результаты неполны, поставить создателю и администраторам `tournament.playoff_blocked` с ключом `${tournamentId}:playoff-blocked:${revision}`. Повторные tick/read requests не создают новые delivery; после устранения причины reconcile запускает плей-офф.

- [ ] **Step 4: Защитить старт от прошлого времени и повторов**

В `startTournamentPlayoffs()` перед `insert tournament_round` проверить отсутствие playoff series под row lock. Для `scheduleDays`, первая дата которых уже прошла, вызвать `rebaseRoundGameDaysAtOrAfter`; все даты раунда сдвигаются на одинаковое число локальных календарных дней, времена и `maxResultGames` сохраняются. Legacy `gameWindowMs` уже использует `maxDate(baseTime, firstGameStartsAt)` и остаётся совместимым.

- [ ] **Step 5: Закрепить автоматическое завершение финала регрессией**

В `service.integration.test.ts` расширить существующий сценарий финала:

```ts
await settleFinalGameOnce(pool, tournament.id);
await settleFinalGameAgainAsRetry(pool, tournament.id);
expect(await tournamentRow(pool, tournament.id)).toMatchObject({ status: 'completed' });
expect(await rewardEventCount(pool, tournament.id, 'playoff')).toBe(expectedRewardCount);
expect(await deliveryCount(pool, `${tournament.id}:completed`)).toBe(APPROVED_PLAYERS);
```

- [ ] **Step 6: Запустить server lifecycle tests и проверить GREEN**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/playoffScheduling.test.ts test/tournament/automaticLifecycle.integration.test.ts test/tournament/service.integration.test.ts`

Expected: PASS, включая Europe/Berlin DST, late start, incomplete regular и повторный settle финала.

- [ ] **Step 7: Закоммитить автоматический плей-офф**

```bash
git add packages/server/src/tournament/automaticLifecycle.ts packages/server/src/tournament/service.ts packages/server/src/tournament/playoffScheduling.ts packages/server/test/tournament/automaticLifecycle.integration.test.ts packages/server/test/tournament/playoffScheduling.test.ts packages/server/test/tournament/service.integration.test.ts
git commit -m "feat(tournaments): start playoffs automatically"
```

### Task 4: Независимый worker, lazy reconcile и mutation hooks

**Files:**
- Create: `packages/server/src/plugins/tournamentLifecycle.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/tournament/routes.ts`
- Create: `packages/server/test/tournament/lifecycle-plugin.integration.test.ts`
- Modify: `packages/server/test/tournament/service.integration.test.ts`
- Modify: `packages/server/test/tournament/classicGame.integration.test.ts`

**Interfaces:**
- Consumes: `reconcileTournamentLifecycle()` из Task 2/3 и `isTournamentFeatureEnabled()`.
- Produces: `tournamentLifecyclePlugin` с отдельными `enabled`, `intervalMs`, `classicSeedSecret`; `reconcileBestEffort()` для lazy API вызовов.

- [ ] **Step 1: Написать падающие тесты worker и lazy fallback**

```ts
it('runs lifecycle when push scheduling and push worker are disabled', async () => {
  const app = await buildApp({ pushSchedulerEnabled: false, pushWorkerEnabled: false, tournamentLifecycleEnabled: true, tournamentLifecycleIntervalMs: 20 });
  await app.ready();
  await waitForTournamentStatus(pool, tournament.id, 'scheduling');
});

it('reconciles on tournament list after a server restart missed the deadline', async () => {
  await app.inject({ method: 'GET', url: '/tournaments', headers: playerAuth });
  expect((await tournamentRow(pool, tournament.id)).status).toBe('scheduling');
});

it('retries a blocked tournament after an admin changes playoffSize', async () => {
  await updatePublishedRulesToValidSize(app, tournament.id, 2);
  expect((await tournamentRow(pool, tournament.id)).status).toBe('scheduling');
});
```

- [ ] **Step 2: Запустить focused integration tests и подтвердить RED**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/lifecycle-plugin.integration.test.ts test/tournament/classicGame.integration.test.ts`

Expected: FAIL, потому что push-off режим сейчас не запускает tournament maintenance.

- [ ] **Step 3: Реализовать отдельный Fastify plugin**

```ts
export interface TournamentLifecyclePluginOptions {
  enabled?: boolean;
  intervalMs?: number;
  classicSeedSecret: string;
}
```

Plugin делает tick на `onReady`, затем раз в 60 секунд, не запускает второй tick пока первый не завершён, проверяет `tournaments.enabled`, логирует только изменённые турниры и очищает timer на `onClose`. В `buildApp()` добавить тестовые overrides:

```ts
tournamentLifecycleEnabled?: boolean;
tournamentLifecycleIntervalMs?: number;
```

Значение по умолчанию: `false` при `NODE_ENV === 'test'`, `true` во всех остальных окружениях. Оно не зависит от `PUSH_SCHEDULER_ENABLED` и `PUSH_WORKER_ENABLED`.

- [ ] **Step 4: Подключить ленивые и mutation-вызовы**

Перед чтением `GET /tournaments`, `GET /tournaments/:id`, `GET /admin/tournaments`, `GET /admin/tournaments/:id`, schedule/standings/bracket вызвать reconcile для списка или конкретного ID. Ошибка best-effort reconcile логируется и не превращает доступный read endpoint в 500.

После успешных операций вызвать reconcile конкретного турнира:

- approve one / approve all;
- update draft/published allowed rules;
- manual finalize daily day;
- завершивший игру `submitClassicGameShot`;
- settle regular tournament duel в общем сервисе завершения fixture;
- исправление административного результата/перенос игры.

В `POST /applications` reconcile вызывается после записи заявки, но дата закрытия остаётся защищена собственной проверкой `applyToTournament()`.

- [ ] **Step 5: Запустить plugin/API tests и проверить GREEN**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/lifecycle-plugin.integration.test.ts test/tournament/service.integration.test.ts test/tournament/classicGame.integration.test.ts`

Expected: PASS; два приложения/два tick одновременно создают один календарь и одну сетку.

- [ ] **Step 6: Закоммитить worker и fallback**

```bash
git add packages/server/src/plugins/tournamentLifecycle.ts packages/server/src/app.ts packages/server/src/tournament/routes.ts packages/server/test/tournament/lifecycle-plugin.integration.test.ts packages/server/test/tournament/service.integration.test.ts packages/server/test/tournament/classicGame.integration.test.ts
git commit -m "feat(tournaments): run lifecycle worker and lazy reconcile"
```

### Task 5: Server DTO ближайшего действия и человеческой блокировки

**Files:**
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/tournament/routes.ts`
- Modify: `packages/web/src/api/tournament.ts`
- Modify: `packages/web/src/tournament/adminApi.ts`
- Modify: `packages/server/test/tournament/catalog.test.ts`
- Modify: `packages/server/test/tournament/service.integration.test.ts`
- Modify: `packages/web/src/tournament/adminApi.test.ts`

**Interfaces:**
- Consumes: `TournamentLifecycleDecision` Task 1.
- Produces: одинаковое поле `lifecycle` в player/admin tournament DTO.

- [ ] **Step 1: Написать падающие contract-тесты DTO**

```ts
expect(adminTournament.lifecycle).toEqual({
  action: 'block_registration',
  dueAt: '2030-08-31T07:00:00.000Z',
  approvedParticipantCount: 3,
  requiredParticipantCount: 4,
  reason: 'not_enough_participants',
});

expect(playerTournament.lifecycle).toMatchObject({
  action: 'registration_waiting',
  dueAt: '2030-08-01T07:00:00.000Z',
});
```

- [ ] **Step 2: Запустить contract tests и подтвердить RED**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/catalog.test.ts test/tournament/service.integration.test.ts && pnpm --filter @hockey/web exec vitest run src/tournament/adminApi.test.ts`

Expected: FAIL, DTO пока не содержит `lifecycle`.

- [ ] **Step 3: Добавить единый DTO**

```ts
export interface TournamentLifecycleDTO {
  action: TournamentLifecycleAction;
  dueAt: string | null;
  approvedParticipantCount: number;
  requiredParticipantCount: number;
  reason: 'not_enough_participants' | 'regular_results_incomplete' | 'legacy_requires_audit' | null;
}
```

DTO вычисляется из фактического read snapshot после lazy reconcile. Не передавать клиенту SQL-статусы ошибок, имена функций или английские сообщения.

- [ ] **Step 4: Запустить server/web contract tests и проверить GREEN**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/catalog.test.ts test/tournament/service.integration.test.ts && pnpm --filter @hockey/web exec vitest run src/tournament/adminApi.test.ts`

Expected: PASS; player/admin типы совпадают с JSON сервера.

- [ ] **Step 5: Закоммитить lifecycle DTO**

```bash
git add packages/server/src/tournament/service.ts packages/server/src/tournament/routes.ts packages/web/src/api/tournament.ts packages/web/src/tournament/adminApi.ts packages/server/test/tournament/catalog.test.ts packages/server/test/tournament/service.integration.test.ts packages/web/src/tournament/adminApi.test.ts
git commit -m "feat(tournaments): expose lifecycle status"
```

### Task 6: Автопубликация мастера и понятные действия админки

**Files:**
- Modify: `packages/web/src/tournament/TournamentAdmin.tsx`
- Modify: `packages/web/src/tournament/TournamentOperations.tsx`
- Modify: `packages/web/src/tournament/adminApi.ts`
- Modify: `packages/web/src/tournament/TournamentAdmin.test.tsx`
- Modify: `packages/web/src/tournament/TournamentOperations.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Consumes: `publishAdminTournament()`, `publishAdminTournamentSchedule()` и `AdminTournament.lifecycle`.
- Produces: мастер, который сохраняет и публикует новый draft одной операцией UI; единственное ручное happy-path действие — `startAdminTournamentRegularSeason()`.

- [ ] **Step 1: Написать падающий тест завершения мастера**

```ts
it('publishes a valid new draft before closing the wizard', async () => {
  createAdminTournament.mockResolvedValue({ tournament: { ...draftTournament, revision: 1, status: 'draft' } });
  publishAdminTournament.mockResolvedValue({ tournamentId: draftTournament.id, status: 'registration', revision: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и опубликовать' }));
  await waitFor(() => expect(publishAdminTournament).toHaveBeenCalledWith(draftTournament.id, 1));
  expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ status: 'registration' }));
});
```

Также проверить: ошибка публикации оставляет мастер открытым; редактирование уже опубликованного турнира только сохраняет допустимую новую ревизию и не вызывает publish повторно.

- [ ] **Step 2: Написать падающие тесты lifecycle панели**

```ts
expect(screen.queryByRole('button', { name: 'Открыть регистрацию' })).not.toBeInTheDocument();
expect(screen.getByText('Регистрация откроется 1 августа в 10:00 мск')).toBeInTheDocument();
expect(screen.getByText('После закрытия календарь создастся автоматически')).toBeInTheDocument();

renderOperations({ status: 'scheduling', lifecycle: awaitingManualStart });
fireEvent.click(screen.getByRole('button', { name: 'Начать регулярный сезон' }));
expect(publishAdminTournamentSchedule).toHaveBeenCalledWith(TOURNAMENT_ID);

renderOperations({ status: 'regular', lifecycle: incompleteResults });
expect(screen.queryByRole('button', { name: /плей-офф/i })).not.toBeInTheDocument();
expect(screen.getByText('Плей-офф начнётся автоматически после завершения всех игр')).toBeInTheDocument();
```

- [ ] **Step 3: Запустить web tests и подтвердить RED**

Run: `pnpm --filter @hockey/web exec vitest run src/tournament/TournamentAdmin.test.tsx src/tournament/TournamentOperations.test.tsx`

Expected: FAIL на старых кнопках и тексте «Календарь создан, но участники его ещё не видят».

- [ ] **Step 4: Реализовать мастер и переименовать API helper**

`finishWizard()` для нового draft делает `create/update → publish → invalidate admin lists → closeWizard`. Текст финальной кнопки: «Сохранить и опубликовать», во время запроса — «Публикуем…».

Переименовать только web helper, сохранив текущий server endpoint:

```ts
export function startAdminTournamentRegularSeason(tournamentId: string) {
  return apiFetch(`/admin/tournaments/${tournamentId}/schedule/publish`, { method: 'POST' });
}
```

- [ ] **Step 5: Реализовать человеческую lifecycle панель**

Отображения:

- `registration_waiting` — «Регистрация откроется …»;
- `registration_open` — «Регистрация открыта до …»;
- `generate_schedule` — «Регистрация завершена. Календарь создаётся автоматически»;
- `block_registration` / `registration_blocked` — «Подтверждено X из Y. Уменьшите размер плей-офф, продлите регистрацию или пригласите игроков»;
- `await_manual_regular_start` — CTA «Начать регулярный сезон»;
- `await_regular_results` — конкретная причина без ручной кнопки плей-офф;
- `await_playoff_time` — «Плей-офф начнётся автоматически …»;
- `legacy_requires_audit` — «Турнир создан по старым правилам. Нужна проверка администратора».

Ручное «Создать календарь» показывать только `head_to_head + registration_blocked` после того, как новая конфигурация уже допускает фактический состав. Для `daily_aggregate`/`classic` эта кнопка отсутствует.

- [ ] **Step 6: Запустить web tests и проверить GREEN**

Run: `pnpm --filter @hockey/web exec vitest run src/tournament/TournamentAdmin.test.tsx src/tournament/TournamentOperations.test.tsx`

Expected: PASS; в DOM отсутствуют «Открыть регистрацию», «Опубликовать календарь» и «Запустить плей-офф».

- [ ] **Step 7: Закоммитить админский интерфейс**

```bash
git add packages/web/src/tournament/TournamentAdmin.tsx packages/web/src/tournament/TournamentOperations.tsx packages/web/src/tournament/adminApi.ts packages/web/src/tournament/TournamentAdmin.test.tsx packages/web/src/tournament/TournamentOperations.test.tsx packages/web/src/app/design-system.css
git commit -m "feat(tournaments): simplify automatic lifecycle controls"
```

### Task 7: Контекст турнирной игры и защита старых ссылок

**Files:**
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/tournament/routes.ts`
- Modify: `packages/server/test/tournament/service.integration.test.ts`
- Modify: `packages/web/src/api/tournament.ts`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/screens/DailyScreen.test.tsx`
- Modify: `packages/web/src/tournament/TournamentScheduleCalendar.tsx`
- Modify: `packages/web/src/tournament/TournamentScheduleCalendar.test.tsx`
- Modify: `packages/web/src/tournament/TournamentCatalog.tsx`
- Modify: `packages/web/src/tournament/TournamentCatalog.test.tsx`

**Interfaces:**
- Consumes: tournament status, current user's participant state, matchdays and `tournament_daily_result`.
- Produces: `GET /tournaments/:tournamentId/game-context` и `TournamentGameContext`, которые разрешают вход в daily/classic только в активный турнирный день.

- [ ] **Step 1: Написать падающие server contract-тесты game context**

```ts
expect(await getTournamentGameContext(pool, { tournamentId, userId, now: ACTIVE_DAY })).toEqual({
  action: 'play_daily', tournamentDay: 2, result: null, message: null,
});

expect(await getTournamentGameContext(pool, { tournamentId, userId, now: AFTER_REGULAR })).toMatchObject({
  action: 'waiting_playoff',
  result: { goals: 24, shots: 90, accuracy: 0.26667, completed: true },
  message: 'Регулярный сезон завершён. Ожидаем начала плей-офф.',
});
```

Проверить также `play_classic`, `round_completed`, `not_started`, `not_participant` и tournament status `playoff/completed`.

- [ ] **Step 2: Написать падающие browser-component tests stale URL**

```ts
renderWith(['/?view=daily&section=tournaments&tournament=daily-1&tab=schedule']);
expect(await screen.findByText('Регулярный сезон завершён. Ожидаем начала плей-офф.')).toBeInTheDocument();
expect(screen.getByText('24 шайбы · точность 26,67%')).toBeInTheDocument();
expect(screen.queryByRole('button', { name: /брос/i })).not.toBeInTheDocument();

renderWith(['/?view=classic&section=tournaments&tournament=classic-1&tab=schedule']);
expect(await screen.findByRole('button', { name: 'Продолжить турнирную игру' })).toBeInTheDocument();

renderCatalog({ lifecycle: { action: 'registration_waiting', dueAt: OPENS_AT } });
expect(screen.getByText('Регистрация откроется 1 сентября в 10:00 мск')).toBeInTheDocument();
expect(screen.queryByRole('button', { name: 'Подать заявку' })).not.toBeInTheDocument();

renderCatalog({ lifecycle: { action: 'await_manual_regular_start' }, myParticipantState: 'approved' });
expect(screen.getByText('Заявка подтверждена. Ожидаем начала регулярного сезона.')).toBeInTheDocument();
```

- [ ] **Step 3: Запустить server/web tests и подтвердить RED**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts -t "game context" && pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/tournament/TournamentScheduleCalendar.test.tsx src/tournament/TournamentCatalog.test.tsx`

Expected: FAIL; старая daily-ссылка сразу рендерит обычную `DailyPlayView`.

- [ ] **Step 4: Реализовать endpoint и тип**

```ts
export type TournamentGameContextAction =
  | 'play_daily'
  | 'play_classic'
  | 'round_completed'
  | 'not_started'
  | 'waiting_playoff'
  | 'playoff_active'
  | 'tournament_completed'
  | 'not_participant';

export interface TournamentGameContext {
  action: TournamentGameContextAction;
  tournamentDay: number | null;
  result: { goals: number; shots: number; accuracy: number; completed: boolean } | null;
  message: string | null;
}
```

Endpoint всегда сверяет `now` с `matchday.starts_at <= now < matchday.ends_at` и `tournament.status === 'regular'`. Он не возвращает generic daily state и не создаёт игровую попытку.

- [ ] **Step 5: Поставить route guard перед игровыми экранами**

При tournament origin `DailyScreen` сначала загружает game context:

- `play_daily` → существующий `DailyPlayView`;
- `play_classic` → существующий `ClassicTournamentPlayView`;
- любой другой action → стандартная светлая tournament state card с результатом, сообщением и CTA «Вернуться к турниру».

`TournamentScheduleCalendar` показывает кнопку только если выбран сегодня активный matchday, `myResult.completed !== true` и серверный tournament status допускает игру. В URL сохраняются `section=tournaments`, `tournament`, `tab=schedule`, `from`.

`TournamentCatalog` использует server lifecycle DTO как источник доступности заявки: до открытия показывает дату без кнопки, после закрытия показывает состояние собственной заявки и ближайший этап турнира.

- [ ] **Step 6: Запустить web/server tests и проверить GREEN**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts -t "game context" && pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/tournament/TournamentScheduleCalendar.test.tsx src/tournament/TournamentCatalog.test.tsx`

Expected: PASS; ни один stale tournament URL не открывает обычную ежедневную игру.

- [ ] **Step 7: Закоммитить пользовательские состояния**

```bash
git add packages/server/src/tournament/service.ts packages/server/src/tournament/routes.ts packages/server/test/tournament/service.integration.test.ts packages/web/src/api/tournament.ts packages/web/src/screens/DailyScreen.tsx packages/web/src/screens/DailyScreen.test.tsx packages/web/src/tournament/TournamentScheduleCalendar.tsx packages/web/src/tournament/TournamentScheduleCalendar.test.tsx packages/web/src/tournament/TournamentCatalog.tsx packages/web/src/tournament/TournamentCatalog.test.tsx
git commit -m "fix(tournaments): guard tournament game routes"
```

### Task 8: Аудит и безопасное включение существующих турниров

**Files:**
- Create: `packages/server/src/tournament/automaticLifecycleAudit.ts`
- Create: `packages/server/src/tournament/automaticLifecycleAuditCli.ts`
- Modify: `packages/server/package.json`
- Modify: `packages/server/src/duel/eventLog.ts`
- Modify: `docker-compose.staging.yml`
- Create: `packages/server/test/tournament/automaticLifecycleAudit.integration.test.ts`

**Interfaces:**
- Consumes: `reconcileTournamentLifecycle(..., dryRun: true)`, published revision rules and existing schedule/series/gameplay rows.
- Produces: `auditAutomaticTournamentLifecycle(pool, options)` и CLI `pnpm --filter @hockey/server tournament:lifecycle-audit`.

- [ ] **Step 1: Написать падающие тесты legacy dry-run/apply**

```ts
it('does not mutate a legacy tournament during dry-run', async () => {
  const before = await tournamentFingerprint(pool, legacy.id);
  const report = await auditAutomaticTournamentLifecycle(pool, { tournamentId: legacy.id, now: NOW, apply: false });
  expect(report.tournaments[0]).toMatchObject({ status: 'ready_to_enable' });
  expect(await tournamentFingerprint(pool, legacy.id)).toEqual(before);
});

it('blocks a legacy tournament with played or conflicting schedule data', async () => {
  const report = await auditAutomaticTournamentLifecycle(pool, { tournamentId: conflicted.id, now: NOW, apply: true });
  expect(report.tournaments[0]).toMatchObject({ status: 'blocked', reasons: expect.arrayContaining(['games_already_started']) });
  expect(await automaticMarker(pool, conflicted.id)).toBeNull();
});

it('enables a safe tournament and reconciles it once', async () => {
  const report = await auditAutomaticTournamentLifecycle(pool, { tournamentId: safe.id, now: NOW, apply: true });
  expect(report.tournaments[0]).toMatchObject({ status: 'enabled' });
  expect(await automaticMarker(pool, safe.id)).toBe(1);
});
```

- [ ] **Step 2: Запустить audit test и подтвердить RED**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/automaticLifecycleAudit.integration.test.ts`

Expected: FAIL, audit service и CLI отсутствуют.

- [ ] **Step 3: Реализовать read-only fingerprint и guarded apply**

Dry-run отчёт содержит slug, status, source, revision, approved count, playoffSize, matchday/round/fixture/series counts, число начатых/завершённых игр, предлагаемое действие и причины блокировки.

`apply: true` разрешён только если:

- tournament не `completed/cancelled/archived`;
- нет active/settled regular или playoff fixture;
- существующий календарь либо отсутствует, либо структурно совпадает с опубликованной конфигурацией;
- published revision не менялась между dry-run read и `FOR UPDATE` apply.

После проверки audit добавляет `automaticLifecycleVersion: 1` в `tournament_revision.rules_snapshot`, расширяет `EventType` и пишет `event_log` с типом `admin_tournament_lifecycle_enabled`, затем вызывает reconcile. Никакие даты, участники, результаты или расписание напрямую не переписываются.

- [ ] **Step 4: Добавить защищённый CLI**

```json
"tournament:lifecycle-audit": "tsx src/tournament/automaticLifecycleAuditCli.ts"
```

CLI требует `--tournament SLUG` или `--all`, по умолчанию dry-run и печатает JSON. `--apply` требует одновременно `DEPLOYMENT_ENV=dev` и `TOURNAMENT_LIFECYCLE_RECONCILE=1`; при любом другом `DEPLOYMENT_ENV` apply запрещён, но dry-run разрешён. В `docker-compose.staging.yml` задать `DEPLOYMENT_ENV: dev` только сервисам `server-dev`/`push-worker-dev`; production compose такого значения не получает.

- [ ] **Step 5: Запустить audit tests и проверить GREEN**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/automaticLifecycleAudit.integration.test.ts`

Expected: PASS; dry-run fingerprint не меняется, конфликтующий турнир не получает маркер.

- [ ] **Step 6: Закоммитить tooling совместимости**

```bash
git add packages/server/src/tournament/automaticLifecycleAudit.ts packages/server/src/tournament/automaticLifecycleAuditCli.ts packages/server/package.json packages/server/src/duel/eventLog.ts docker-compose.staging.yml packages/server/test/tournament/automaticLifecycleAudit.integration.test.ts
git commit -m "feat(tournaments): audit legacy lifecycle state"
```

### Task 9: Полный локальный сценарий и общая проверка

**Files:**
- Modify: `packages/server/test/tournament/synthetic-seasons.integration.test.ts`
- Create: `docs/qa/tournament-automatic-lifecycle-local.md`

**Interfaces:**
- Consumes: все server/web interfaces Tasks 1–8.
- Produces: один воспроизводимый e2e-like integration сценарий для трёх regular sources и ручной browser checklist.

- [ ] **Step 1: Расширить synthetic season тест тремя форматами**

```ts
it.each(['head_to_head', 'daily_aggregate', 'classic'] as const)(
  'runs the automatic lifecycle for %s through tournament completion',
  async (regularSource) => {
    const tournament = await createAutomaticTournament({ regularSource, approved: 4, playoffSize: 4 });
    await reconcileAt('registration_open');
    await reconcileAt('registration_closed');
    expectStatus('scheduling');
    await publishRegularSchedule(pool, tournament.id); // единственное ручное действие
    await settleRegularSeason(regularSource);
    await reconcileAt('playoff_due');
    expectStatus('playoff');
    await settleEveryPlayoffSeries();
    expectStatus('completed');
    expect(await duplicateCounts()).toEqual({ schedule: 0, series: 0, rewards: 0, notifications: 0 });
  },
);
```

- [ ] **Step 2: Запустить полный server/web test suite**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server test && pnpm --filter @hockey/web test`

Expected: все test suites PASS; integration tests не пропускаются при настроенных `TEST_*` env.

- [ ] **Step 3: Запустить статические проверки и сборку**

Run: `pnpm typecheck && pnpm lint && pnpm build && git diff --check`

Expected: все команды exit 0, `git diff --check` без вывода.

- [ ] **Step 4: Провести локальный browser QA**

Запустить локальный server/web на свободных портах и пройти `docs/qa/tournament-automatic-lifecycle-local.md`:

1. Новый H2H турнир: мастер закрывается в регистрации, регистрация открывается/закрывается по дате, календарь появляется, CTA «Начать регулярный сезон», регулярные дуэли, автоматическая сетка, счёт серии, победа в серии и турнире.
2. Daily aggregate: игровые дни без пар, завершённый тур показывает результат, stale URL не открывает обычную ежедневку, автоматический playoff создаёт дуэли.
3. Classic: отдельная турнирная игра, результат дня, автоматический playoff создаёт дуэли.
4. Недостаточный состав: X из Y, одно admin-уведомление, размер playoff не меняется, daily/classic не показывают ручные пары.
5. Перезапуск server между дедлайнами: первый list request восстанавливает правильный статус.

Для каждого экрана сохранить screenshot path и отметить `PASS | FAIL`, expected/actual, роль и URL.

- [ ] **Step 5: Закоммитить e2e-like тест и QA checklist**

```bash
git add packages/server/test/tournament/synthetic-seasons.integration.test.ts docs/qa/tournament-automatic-lifecycle-local.md
git commit -m "test(tournaments): cover automatic lifecycle scenarios"
```

### Task 10: PR в dev, deploy и контролируемый reconcile dev-турниров

**Files:**
- No repository changes expected.

**Interfaces:**
- Consumes: зелёные проверки и audit CLI Tasks 8–9.
- Produces: точный merge SHA/runtime image на dev, dry-run/readback существующих турниров и браузерный результат.

- [ ] **Step 1: Проверить ветку перед публикацией**

Run: `git status --short && git log --oneline --decorate origin/dev..HEAD && git diff --check origin/dev...HEAD`

Expected: только запланированные изменения, серия проверяемых коммитов, diff check без ошибок.

- [ ] **Step 2: Отправить ветку и создать PR в dev**

```bash
git push -u origin co_dex/tournament-automatic-lifecycle
gh pr create --base dev --head co_dex/tournament-automatic-lifecycle --title "feat: automate tournament lifecycle" --body-file /tmp/tournament-automatic-lifecycle-pr.md
```

- [ ] **Step 3: Проверить PR и слить только после локального QA**

Run: `gh pr view --json mergeable,headRefOid,baseRefName,url && gh pr checks`

Expected: `baseRefName=dev`, `mergeable=MERGEABLE`; если checks отсутствуют для dev, это не заменяет локальные проверки Task 9.

- [ ] **Step 4: Дождаться Deploy Dev и подтвердить runtime**

Run: `gh run list --branch dev --limit 6 --json databaseId,workflowName,status,conclusion,headSha,url`

Expected: Deploy Dev для merge SHA завершён `success`; `/api/health` показывает DB/Redis true, а tag запущенных `server-dev/web-dev` равен `dev-sha-` плюс первые семь символов фактического merge SHA.

- [ ] **Step 5: Выполнить только dry-run существующих dev-турниров**

На dev VPS в каталоге `DEPLOY_PATH` выполнить внутри одноразового staging-контейнера:

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml run --rm -T server-dev node packages/server/dist/tournament/automaticLifecycleAuditCli.js --all < /dev/null
```

Expected: JSON-отчёт отдельно по `chempionat-mira`, `turnir-s-novoy-ezhednevnoy-igroy` и другим активным турнирам; никакие fingerprints не изменились. Показать отчёт пользователю до apply, если обнаружен хотя бы один `blocked` или конфликт расписания.

- [ ] **Step 6: Явно включить только безопасные dev-турниры и прочитать результат обратно**

Для заранее известных активных dev-турниров, получивших `ready_to_enable` в dry-run:

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml run --rm -T -e TOURNAMENT_LIFECYCLE_RECONCILE=1 server-dev node packages/server/dist/tournament/automaticLifecycleAuditCli.js --tournament chempionat-mira --apply < /dev/null
docker compose -f docker-compose.yml -f docker-compose.staging.yml run --rm -T -e TOURNAMENT_LIFECYCLE_RECONCILE=1 server-dev node packages/server/dist/tournament/automaticLifecycleAuditCli.js --tournament turnir-s-novoy-ezhednevnoy-igroy --apply < /dev/null
```

Expected: marker `automaticLifecycleVersion=1`, статус соответствует reconcile, количества matchday/fixture/series не задвоились. `blocked` турниры не изменять автоматически.

- [ ] **Step 7: Провести dev browser acceptance**

Проверить админом и игроком те же ключевые состояния, что в Task 9: автодаты регистрации, manual regular CTA, auto playoff, blocked copy, daily stale URL, classic route, series score, completed tournament. Зафиксировать URL, expected/actual, `PASS | FAIL`, merge SHA и runtime image.

---

## Execution Notes

- Tasks 1–5 образуют server dependency chain и выполняются последовательно.
- Task 6 зависит от lifecycle DTO Task 5.
- Task 7 зависит от lazy reconcile Task 4, но не от UI Task 6.
- Task 8 должен быть завершён до включения фонового worker на dev.
- Task 10 выполняется только после локального просмотра пользователем либо его отдельного прямого разрешения грузить в dev.
