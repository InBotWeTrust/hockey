# Final review fix report — Bonus Games and Home Arenas

- Дата проверки: 2026-08-24
- Ветка: `co_dex/bonus-games-home-arenas`
- Worktree: `/Users/egorgumenyuk/Projects/Ultimate Hockey/.worktrees/bonus-games-home-arenas`
- Fix base: `f10f0c2cd92bfb026ef1b5bc5a5a96c2339ebbb2`
- Implementation commit: `708a64ed4379454822f434e591460f00cd021afe`

## Итоговый статус

- Все 12 пунктов из `final-review-findings.md` закрыты кодом и focused regression tests.
- Focused server: **PASS**, 6/6 файлов, 103/103 теста.
- Focused web: **PASS**, 8/8 файлов, 101/101 тест.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, Prettier и `git diff --check`: **PASS**.
- Canonical `pnpm test`: **FAIL**, потому что один неизменённый server suite не завершил `beforeAll` за 10 секунд. Это не переименовано в PASS: 56 server-файлов прошли, `test/duel/amateur.test.ts` не поднялся, итог команды — `exit 1`.
- Тот же `test/duel/amateur.test.ts` отдельно: **PASS**, 43/43, `exit 0`, 9.82 секунды. Это указывает на timing/resource contention полного запуска, но не отменяет canonical FAIL.
- Browser/render QA: **NOT RUN / BLOCKED по заданной auth/session-границе**. UI PASS не заявляется.
- Release/dev/prod acceptance: **BLOCKED** до зелёного полного suite и отдельно разрешённого rendered QA на exact SHA.

## Решения по findings

| Severity | Finding | Root cause | Исправление и доказательство |
| --- | --- | --- | --- |
| Critical | Bonus puck speed расходился между client/server | `PlayView` использовал четыре знака, а server сохранял и резолвил полную дробную точность | `puckSpeedPerMs` нормализуется до четырёх знаков на server Zod boundary до persistence/snapshot/resolver; regression для `1.234549 → 1.2345` зелёный |
| Important | Покупка списывала изменившуюся цену | Клиент подтверждал только `gameId`, server списывал текущую mutable цену | Клиент отправляет `expected_price_stars`; server блокирует definition через `FOR UPDATE OF game`, сравнивает цену до debit и возвращает стабильный `bonus_price_changed`; UI закрывает stale modal, показывает безопасный русский текст и обновляет каталог |
| Important | Archived game с active attempt была недоступна | Действие выводилось только из `state`, без authoritative `active_attempt` | Такая карточка показывает `Продолжить` и открывает сохранённый attempt; новые старты archived game по-прежнему запрещены server contract |
| Important | Seeded slug перекрывал authoritative thumbnail | UI предпочитал bundled mapping вместо `arena.thumbnail_url` | Каталог всегда использует server `thumbnail_url`; regression покрывает изменённый signed URL для seeded `beach` slug |
| Important | Admin не загружал arena/thumbnail | Upload controls были только для goalkeeper media | Добавлены `arena` и `thumbnail` WebP uploads через существующий guarded endpoint; сохранены editor identity, generation и pending guards, включая StrictMode/stale response regressions |
| Important | Game-only edit shared arena конфликтовал | Web отправлял полный arena payload, server считал само присутствие payload мутацией | Server блокирует arena row и допускает полный effective no-op; реальное изменение shared arena всё ещё возвращает конфликт |
| Important | Login regression ожидал внутренний текст | Тест закреплял английскую/internal ошибку вместо публичного safe contract | Тест требует точный русский fallback и отдельно проверяет, что `bad hash`/`unauthenticated` не раскрываются |
| Important | Новые modals не имели общего accessibility contract | Purchase, abandon, Sections и admin использовали разные ad-hoc реализации | Добавлен reusable `AccessibleModal`: portal, initial focus, Tab/Shift+Tab trap, Escape, pending block, inert + `aria-hidden` background, backdrop close и exact trigger restoration; применён к player/admin flows |
| Important | Три `Promise.all` работали на одном `PoolClient` | Параллельные `query()` на одном pg client создавали unsupported concurrency | Запросы выполняются последовательно; измеряющий proxy regression подтверждает `maxConcurrentQueries = 1` для purchase, attempt start и duel venue |
| Minor | Русские числительные были захардкожены | Разные экраны склеивали число с одной формой слова | Общий `formatRussianCount` применён к звёздам, шайбам, периодам, броскам, монетам и очкам опыта; покрыты 0/1/2/4/5/11/14/21/22/25 |
| Minor | Reorder менял будущую chain без подтверждения | Mutation отправлялась сразу по `Выше/Ниже` | Перед mutation показывается accessible confirmation с явным предупреждением о будущих попытках; pending guard исключает double submit |
| Minor / Trivial | Admin focus restoration и англоязычные labels | Старый modal не восстанавливал exact trigger; формы показывали `Slug` | Create/Edit/Archive/Reorder используют общий modal contract; labels заменены на `Код игры` и `Код площадки` |

## `GAME_CORE_VERSION` ruling

`GAME_CORE_VERSION` не изменён.

Причина: код и чистые функции `@hockey/game-core` не менялись; PRNG, формулы, seed derivation и engine result для одинакового нормализованного input остались прежними. Исправлен внешний bonus-config contract: server теперь подаёт движку ту же четырёхзнаковую скорость, которую уже подавал `PlayView`. Поэтому это boundary normalization, а не новая версия детерминированного движка.

Проверка: `git diff f10f0c2cd92bfb026ef1b5bc5a5a96c2339ebbb2..708a64ed4379454822f434e591460f00cd021afe -- packages/game-core` пуста; обязательная сборка game-core прошла.

## RED → GREEN evidence

До исправлений focused regressions воспроизводили:

- speed contract: actual `1.234549`, expected `1.2345`;
- stale purchase: подтверждение старой цены приводило к списанию новой цены;
- archived active attempt: disabled card вместо `Продолжить`;
- authoritative thumbnail: bundled asset использовался вместо изменённого signed URL;
- plural forms: неверные формы для 21/22/25 и других окончаний;
- shared arena no-op: `bonus_game_arena_shared` на game-only edit;
- three single-client paths: `maxConcurrentQueries = 2`;
- modal flows: initial focus/Tab trap/exact trigger restoration отсутствовали;
- Login test: ожидался внутренний английский error contract.

После исправлений:

- server focused suites: 103/103 PASS;
- web focused suites: 101/101 PASS;
- отдельный previously timed-out amateur suite: 43/43 PASS.

## Команды и результаты

DB-dependent команды выполнялись только с:

- PostgreSQL database: `hockey_test` на localhost;
- Redis: localhost DB 15;
- никаких dev/prod DB, реальных аккаунтов или реальных денежных данных.

| Команда | Результат |
| --- | --- |
| `pnpm --filter @hockey/game-core build` | PASS, exit 0 |
| `pnpm --filter @hockey/server exec vitest run test/arenas/routes.test.ts test/bonusGames/admin.test.ts test/bonusGames/attempts.test.ts test/bonusGames/catalog.test.ts test/bonusGames/routes.test.ts test/bonusGames/types.test.ts` | PASS, 6 files, 103/103, exit 0 |
| `pnpm --filter @hockey/web exec vitest run src/admin/BonusGamesAdmin.test.tsx src/api/apiFetch.test.ts src/components/AccessibleModal.test.tsx src/lib/russianPlural.test.ts src/screens/BonusGamePlayScreen.test.tsx src/screens/BonusGamesScreen.test.tsx src/screens/LoginScreen.test.tsx src/screens/SectionsScreen.test.tsx` | PASS, 8 files, 101/101, exit 0 |
| `pnpm typecheck` | PASS, exit 0 |
| `pnpm lint` | PASS, exit 0 |
| `pnpm build` | PASS, exit 0; web 2674 modules transformed, PWA artifacts generated |
| `pnpm exec prettier --check <29 changed code/test files>` | PASS |
| `git diff --check` и `git diff --cached --check` | PASS |
| canonical `pnpm test` с `hockey_test` и Redis DB 15 | **FAIL**, exit 1; game-core 74/74 PASS, основной web batch 522/522 PASS до abort, server 56 files PASS + 1 suite setup timeout, 438 tests PASS |
| isolated `test/duel/amateur.test.ts` с теми же test services | PASS, 43/43, exit 0, duration 9.82s |

Локальный runtime: Node `v25.2.1`, pnpm `10.28.1`, PostgreSQL server `15.15`, Redis binary `8.4.0`. Это не заменяет CI parity с project Node 20 / PostgreSQL 16 / Redis 7.

## Canonical failure investigation

Canonical suite был запущен ровно один раз и не перезапускался.

Фактический failure:

1. `test/duel/amateur.test.ts` — `beforeAll` timed out after 10000ms;
2. suite body не стартовал;
3. `afterAll` затем получил `app === undefined` и упал на `app.close()`;
4. сам test file, `test/setup.ts`, Vitest config и app/plugin setup этим diff не менялись;
5. отдельный запуск того же файла с теми же `hockey_test`/Redis 15 прошёл 43/43.

Ruling: evidence совместима с transient scheduling/resource contention полного recursive run. Кодовый фикс или увеличение timeout вслепую не вносились. Canonical результат остаётся FAIL и должен быть перепроверен в CI/следующем разрешённом полном прогоне.

Первый isolated diagnostic внутри network sandbox получил ожидаемый `EPERM` на localhost sockets; валидным считается только разрешённый запуск с доступом к локальным test services.

## Изменённые поверхности

Server:

- bonus rule normalization и route/body/error contracts;
- paid unlock locking/price validation;
- shared-arena no-op handling;
- sequential single-client DB reads;
- integration/unit regressions и измеряющий concurrency helper.

Web:

- reusable `AccessibleModal`;
- reusable Russian pluralization;
- catalog purchase/resume/thumbnail/error behavior;
- play reward/abandon modal;
- Sections locked modal;
- admin media uploads/reorder/focus/labels;
- safe Login fallback regression.

## Остаточные warnings и границы

- Focused server остаётся зелёным при существующем `MaxListenersExceededWarning` для `WebSocketServer`.
- Admin negative-path tests намеренно логируют object-storage 503 и forced DB insert failure.
- Web tests остаются зелёными при существующих React Router future-flag warnings.
- Canonical web output содержит существующий jsdom canvas warning; это не browser/render evidence.
- Browser/render QA сознательно не выполнялся: задача запрещала менять auth/session state и запускать rendered QA. Поэтому focus, signed thumbnails, upload controls и modal appearance подтверждены automated DOM contracts, но не помечены как визуальный PASS.
- GLM/Z.AI/opencode и subagents не использовались; данные наружу не передавались.
- Credentials, auth roles, sessions, реальные аккаунты, реальные деньги и remote data не менялись.
- Push, merge, PR, GitHub Actions, dev deploy, main и production не выполнялись.

## Handoff

Implementation сохранена локально в commit `708a64ed4379454822f434e591460f00cd021afe`. Этот файл будет добавлен отдельным report-only commit; SHA собственного commit невозможно самоссылочно зафиксировать внутри его содержимого, поэтому final report commit SHA указывается во внешнем handoff после commit readback.
