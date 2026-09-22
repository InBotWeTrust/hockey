# Stars, Duel Limits and Monthly Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ввести валюту звёзд, безопасные лимиты и награды обычных дуэлей, четыре месячных зачёта с настраиваемыми выплатами и единым поздравлением.

**Architecture:** Расширять существующие Fastify-транзакции, `game_settings`, `monthlyRewards.ts` и React-экраны, не создавать параллельный механизм выплат. Общий рейтинг, его поздравление и достижения уже работают на свежем `origin/dev`; сохранить их идемпотентность и расширить хранение до измерения `rating_scope`.

**Tech Stack:** TypeScript, Fastify, PostgreSQL migrations, React, TanStack Query, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-22-stars-duel-limits-monthly-ratings-design.md`

## Global Constraints

- Только обычные дуэли; турнирные матчи не входят в лимиты и четыре зачёта. Существующие ограничения плей-офф и восстановления сохранить.
- Москва: 8 новых принятых в день, 40 в неделю с понедельника, 129 в месяц и 43 на каждый формат в месяц; максимум 2 исходящих ожидающих вызова.
- Награды за дуэль: победа над более опытным 5/5, равным 3/3, менее опытным 2/2 звёзд/опыта; ничья 0/2, поражение 0/1. Допуск равенства `max(20, 10% опыта менее опытного)`.
- Звёздная цена инвентаря `ceil(currency_price / 25)`, оплата одной валютой. Четыре рейтинга: общий порог 30 матчей, форматный 10, минимум населения отсутствует; форматный приз только первому 30 звёзд/30 опыта.
- Сохранить существующие выплаты общего зачёта, его достижения и одноразовую очередь поздравлений, меняя только согласованные правила. Все тексты UI — русский, идентификаторы и комментарии — английский.
- Не менять prod и не интегрировать в `dev` без отдельного разрешения. Перед кодом обновить `origin/dev`, проверить владение checkout и базовый SHA, создать отдельную `feature/` ветку; грязный основной checkout не трогать. Прочитать scoped `AGENTS.md` и `docs/engineering/testing.md` перед тестами.

## Review Focus

1. Два одновременных принятия при одном месте: ровно одна резервация, без отрицательного остатка — Task 2 concurrency test.
2. Вызов принят до полуночи, первый бросок после неё: лимит и сезон остаются датой принятия — Task 2 boundary test и Task 6 season test.
3. Принял и отменил до первого броска: оба места возвращены, приглашение не зачтено — Task 3 integration test.
4. Повторная покупка за звёзды или повторное закрытие сезона: ни предмет, ни валюта не дублируются — Tasks 5 и 7 idempotency tests.
5. Победы в двух зачётах при одном выключенном/нулевом: одна модалка только с фактическими выплатами; общий achievement не повторён — Tasks 7 и 9 tests.

## File map and execution order

Проверять фактические схемы и имена функций непосредственно перед изменением: ниже указаны текущие точки входа, а новые интерфейсы являются контрактом плана. Порядок задач сохраняет работающий срез после каждого коммита. Server integration suites не запускать параллельно на общей test DB/Redis.

| Task | Responsibility | Primary files |
| --- | --- | --- |
| 1 | Единые настройки и календарные правила | `packages/server/src/duel/gameSettings.ts`, новый `packages/server/src/duel/amateur/limitRules.ts`, `packages/server/test/duel/gameSettings.test.ts` |
| 2 | Атомарное бронирование и проверки обоих игроков | `packages/server/src/duel/amateur/routes.ts`, новая миграция после проверки последнего номера, `packages/server/test/duel/amateur.test.ts` |
| 3 | Освобождение до броска и недельное задание | `packages/server/src/duel/amateur/routes.ts`, `packages/server/src/weeklyChallenge/progress.ts`, соответствующие server tests |
| 4 | Снимок опыта и награда результата | `packages/server/src/duel/amateur/rewardRules.ts`, `routes.ts`, миграция, server tests |
| 5 | Покупка инвентаря за звёзды | `packages/server/src/routes/inventory.ts`, магазинные React-компоненты после трассировки, `inventory-transactions.test.ts`, web tests |
| 6 | Четыре таблицы и фильтр | `routes.ts`, `AmateurDuelRatingTab.tsx`, миграция, server/web tests |
| 7 | Закрытие четырёх зачётов и админские суммы | `monthlyRewards.ts`, `gameSettings.ts`, `AdminScreen.tsx`, миграция, monthly/admin tests |
| 8 | Лимиты в UI и поясняющая модалка рейтинга | компоненты профиля/поиска/рейтинга после трассировки, web tests |
| 9 | Объединённое поздравление | `MonthlyRatingRewardModal.tsx`, `SectionsScreen.tsx`, server pending API, tests |

## Task 1: Typed settings and Moscow calendar

**Interfaces:** `DuelLimitSettings = { daily: number; weekly: number; monthly: number; perFormatMonthly: number; outgoingInvites: number }`; `limitWindows(now: Date): { dayStart: Date; weekStart: Date; monthStart: Date; nextDay: Date; nextWeek: Date; nextMonth: Date }`. Настройки должны валидироваться как положительные целые и отображаться в админке, без обхода шаблонными настройками.

- [ ] Добавить в `gameSettings.test.ts` RED cases для defaults 8/40/129/43/2, неверного значения, понедельника и переходов месяца/года/DST Москвы; тестировать точные UTC-границы.
- [ ] Запустить `pnpm --filter @hockey/server exec vitest run test/duel/gameSettings.test.ts`; увидеть ожидаемый RED новых assertions.
- [ ] Реализовать типизированное чтение/валидацию в `gameSettings.ts` и чистую календарную функцию в `limitRules.ts`; не вводить глобальное mutable state. Добавить admin API settings по существующему образцу.
- [ ] Запустить тот же тест до GREEN; проверить `pnpm --filter @hockey/server typecheck`.
- [ ] Commit только Task 1; перед коммитом `git diff --check`.

## Task 2: Atomic admission, invitations and search

**Interfaces:** новая reservation-row с `match_id`, `user_id`, `duel_kind`, `accepted_at`, `released_at` и уникальностью `(match_id,user_id)`; `reserveRankedDuel(client, matchId, players, kind, acceptedAt)` сериализует по обоим user IDs в стабильном порядке. Счётчики SQL берут `accepted_at` в окнах Task 1 и `released_at IS NULL`. Сервер возвращает структурированную причину `daily|weekly|monthly|format|outgoing` и `retryAt`.

- [ ] В `amateur.test.ts` написать RED tests: границы 8/40/129/43; отправка без резервации; одновременно 2 принятых при одном месте; адресат исчерпал формат; подбор поиском с истёкшим местом; 2 исходящих и 1 исходящий при 1 оставшемся месте; вызов одной пары в другом формате; попытка через старую template-настройку; турнирный матч не считается.
- [ ] Запустить только этот suite в изолированной test DB/Redis, зафиксировать RED. До запуска прочитать `docs/engineering/testing.md`; если `TEST_DATABASE_URL`/`TEST_REDIS_URL` не выделены, не запускать destructive integration test и зафиксировать gap.
- [ ] Добавить миграцию и транзакционный допуск в `routes.ts` для вызова, принятия и поиска. Убрать старый 100/скользящие 24 часа из `assertRankedLimits` именно для новых бронирований; состояние `ready` не должно повторно расходовать лимит. Существующий `MAX_OPEN_DUEL_SLOTS=5` оставить отдельным ограничением.
- [ ] GREEN: тот же suite, затем `pnpm --filter @hockey/server typecheck`; отдельный SQL/concurrency case должен доказать 1 успех и 1 отказ.
- [ ] Commit Task 2 с миграцией; `git diff --check`.

## Task 3: Release before first accepted shot and weekly challenge

**Interfaces:** `releaseUnstartedReservation(client, matchId)` идемпотентно выставляет `released_at` обоим только когда сервер не зафиксировал ни одного принятого броска. Event `amateur_duel_challenge_accepted` испускается один раз при первом принятом броске прямого вызова, не при принятии вызова и не для поиска.

- [ ] RED в `amateur.test.ts` и `weeklyChallenge.test.ts`: принять → отменить без броска возвращает оба места и 0 прогресса; повторная отмена ничего не меняет; первый бросок → отмена оставляет 2 места занятыми и 1 приглашение; поиск не увеличивает приглашения; гонка броска и отмены даёт только один допустимый исход.
- [ ] Запустить оба targeted suites последовательно, подтвердить RED новых tests.
- [ ] Переместить выдачу challenge event в авторитетную транзакцию первого броска; добавить атомарное освобождение при всех pre-start cancel/expiry путях. Проверить и другой writer прогресса поиском `rg 'amateur_duel_challenge_accepted'`.
- [ ] GREEN targeted suites, server typecheck; commit Task 3.

## Task 4: Duel reward snapshot and settlement

**Interfaces:** `classifyExperience(myExperience, otherExperience, thresholdPercent, minGap)` возвращает `stronger|equal|weaker`; снимок `experience`, правил и сумм обоих игроков фиксируется при принятии. Единственный settlement writer начисляет stars (`users.xp`) и experience (`users.experience`) под уникальным match/user ключом.

- [ ] RED в `rewardRules`/`amateur.test.ts`: пары 20/25, 100/115, 100/125, 1000/1100, 1000/1105, 0/20, 0/21; победа 5/5, 3/3, 2/2, ничья 0/2, проигрыш 0/1; неявка победителя, который завершил свою часть; никто не завершил = 0; админская правка после принятия не меняет снимок; повтор settlement не дублирует выплату.
- [ ] Запустить targeted tests и подтвердить RED.
- [ ] Расширить `rewardRules.ts`, snapshot schema и settlement в `routes.ts`; проверить все writers `users.xp`, `users.experience`, legacy `win_star_reward` и исключить двойное начисление. Настройки сумм и порогов разместить в общей админке дуэлей.
- [ ] GREEN targeted suites и server typecheck; commit Task 4.

## Task 5: Stars as optional inventory currency

**Interfaces:** purchase route принимает `currency: 'coins'|'stars'` (отсутствие = `coins` ради старых клиентов) и idempotency key; цену вычисляет сервер `Math.ceil(currencyPrice / divisor)`. Баланс, ledger и выдача в одной транзакции.

- [ ] RED в `inventory-transactions.test.ts`: 6490→260, 7490→300, 4990→200; изменённая цена сервера отвергает stale quote с понятным сообщением; недостаток звёзд без частичного списания; повтор idempotency key выдаёт один предмет; concurrent purchase не уводит баланс ниже 0; существующая монетная покупка неизменна.
- [ ] Запустить targeted server suite и увидеть RED.
- [ ] Расширить `purchaseInventoryItem` и POST route; использовать существующий ledger/transaction pattern. В UI магазина показать две самостоятельные цены и явный выбор одной валюты; добавить web tests на подтверждение, нехватку средств и stale quote.
- [ ] Запустить server и targeted web suites до GREEN, оба typecheck; commit Task 5.

## Task 6: Four ranking reads and switcher

**Interfaces:** рейтинг GET принимает `scope=overall|express|express_plus|classic`, default `overall`; каждая строка содержит `completedMatches`, `eligible`, `matchesToQualify`, `place|null`. Сервер считает только обычные рейтинговые завершённые матчи, относит матч к месяцу `accepted_at` и сохраняет действующий tie-break: points, head-to-head points, matches, wins, name, user ID.

- [ ] RED в `amateur.test.ts`: три формата суммируются в общий; месячная граница принятия/игры; 29/30 общего и 9/10 форматного; один eligible игрок = место 1; неeligible в блоке «Пока вне зачёта» без места; турнирные/товарищеские/pre-shot cancel исключены; tie-break равных независимо от порядка выборки; старый месяц читается.
- [ ] RED в новом `AmateurDuelRatingTab.test.tsx`: четыре фильтра, default «Общий», сохранение месяца при переключении, пустое состояние и число недостающих матчей.
- [ ] Запустить targeted suites и подтвердить RED; расширить SQL/response `routes.ts`, типы web API и переключатель в `AmateurDuelRatingTab.tsx`.
- [ ] GREEN targeted tests, server/web typecheck; commit Task 6.

## Task 7: One monthly settlement with four award scopes

**Interfaces:** существующие season/placement/economy_event расширить `rating_scope` с unique `(season_key, rating_scope, user_id)` и уникальным operation key per scope/user; не переписывать исторические выплаты. Admin settings каждого scope: enabled, qualification threshold, rank rewards `{coins, stars, experience, tokens}`. Снимок настроек закрытого сезона immutable.

- [ ] RED в `monthlyRewards.test.ts`: общий прежний preset и форматный 30/30; 30/10 пороги; 1 eligible получает форматный приз; общий призовой count `min(N,50,max(3,floor(N*0.2)))`; отключённый или нулевой scope не начисляется; при изменении админки после закрытия приз прежний; concurrent/repeated close выдаёт выплаты однократно; прошлые месяцы закрываются по порядку; достижения `monthly-top-1`/`monthly-top-3` работают один раз только для общего.
- [ ] RED в `AdminScreen.test.tsx`: отдельные переключатели и суммы четырёх зачётов, сохранение выключенной суммы, видимое предупреждение о применении правок к открытому месяцу, нулевые выплаты, объяснение порогов.
- [ ] Запустить targeted suites до RED; расширить миграцией действующие таблицы без повторной выплаты существующих сезонов, `monthlyRewards.ts` и admin settings/API/UI. Особо проверить механизм `evaluateMonthlyRatingSettledAchievements`.
- [ ] GREEN оба targeted suites и typecheck; commit Task 7.

## Task 8: Availability UI and rating information

**Interfaces:** server availability response включает по каждому формату доступность для текущего игрока и выбранного соперника, причину и `retryAt`; клиентская блокировка лишь подсказка, сервер остаётся авторитетным. Рейтинговая `i`-кнопка открывает текст именно выбранного scope и показывает действующие награды/порог.

- [ ] RED web tests для профиля/вызова/поиска: формат заблокирован у себя или соперника; при одном остатке нельзя держать два исходящих; stale UI после серверного `409` показывает русскую причину и время сброса; работа других форматов сохраняется. RED `AmateurDuelRatingTab.test.tsx` для кнопки с доступным именем, четырёх наборов правил, выключенных/нулевых наград и закрытия модалки.
- [ ] Запустить targeted web tests и подтвердить RED; добавить API availability, клиентское отображение и модалку в существующем стиле иконки рядом с «КОНЬКИ»; не полагаться на disabled-button как на контроль лимита.
- [ ] GREEN targeted web suites, web typecheck, проверка клавиатурного открытия/закрытия и мобильной ширины; commit Task 8.

## Task 9: One congratulations modal per season

**Interfaces:** pending API возвращает сгруппированные по месяцу `awards[]` с scope/place и суммарным фактически начисленным reward; acknowledge остаётся отдельной идемпотентной записью. Изображение `/modes/amateur-duel.webp`.

- [ ] RED в `monthlyRewards.test.ts`, `MonthlyRatingRewardModal.test.tsx`, `SectionsScreen.test.tsx`: две положительные награды = одна модалка/две строки и сумма; disabled/zero scopes не входят; нет выплат = нет модалки; несколько месяцев = хронологическая очередь; ошибка ack удерживает модалку; повтор входа и повтор ack не начисляют; картинка одна; существующее поздравление за один общий приз сохраняется.
- [ ] Запустить targeted suites до RED; расширить существующие pending/ack routes и компоненты, не добавляя второй клиентской очереди.
- [ ] GREEN targeted suites, server/web typecheck; commit Task 9.

## Final verification and release gate

- [ ] Прочитать актуальный `docs/engineering/testing.md`; убедиться, что server integration использует выделенные `TEST_DATABASE_URL`/`TEST_REDIS_URL`. Не печатать URL/секреты, не запускать параллельные suite на одной DB.
- [ ] Последовательно запустить все touched targeted suites; затем `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` при безопасно выделенной test инфраструктуре. Перед consumer checks game-core (если изменён) выполнить `pnpm --filter @hockey/game-core build`.
- [ ] Проверить rendered browser flow: профиль → вызов/поиск с лимитами, магазин с двумя валютами, четыре рейтинга и `i`, вход в «Разделы» после двух выплат. Зафиксировать скриншоты и отдельный результат браузера; unit tests этого не заменяют.
- [ ] Просмотреть `git diff --check`, миграции, экономические суммы и совместимость API; отдельно сравнить старый общий рейтинг/достижения. Выполнить review ветки. Не считать локальные проверки доказательством CI/dev/prod.
- [ ] Перед интеграцией прочитать `docs/engineering/release.md`, получить отдельное разрешение на push/merge/deploy. Перед prod сделать новый read-only снимок настроек и баланс-расчёт; миграции и изменение экономики prod отдельно согласовать.
