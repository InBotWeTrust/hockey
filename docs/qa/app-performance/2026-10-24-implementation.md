# Локальная оптимизация приложения — 24 октября 2026

Рабочий каталог: `/Users/egorgumenyuk/.codex/worktrees/service-proxies/Ultimate Hockey`.
Ветка: `fix/app-performance`, база `origin/dev` `86b5102a8e15bd00b782d3e8985ce018f17d0cd5` (свежесть проверена fetch).
**Push, PR, merge, dev/prod deploy и изменения настоящих аккаунтов не выполнялись.**

## Что реализовано

- PostgreSQL хранит готовые счётчики достижений/уровней и общие итоги каталога. Миграция 242 делает transactional backfill; triggers обновляют результаты при завершении/удалении прогресса и изменении каталога. Чужой компактный профиль не выдаёт достижения и не проверяет платежи.
- Собственная сводка общая для startup/access/map. Сохраняются баланс, уровень и счётчик непринятых наград; invalidation обновляет сводку, кеш не переходит между владельцами. Полный собственный профиль сохраняет карточки.
- Чужие профили используют общий viewer-scoped кеш и показывают известные имя/аватар до API. Задания/уровни отображаются числами без artwork. Bio приходит в ответе профиля.
- История наград загружается по нажатию и по выбранной категории, по 20 записей. Прогресс челленджей загружается одним batch SQL. У нового `/users/:id/trophies` категория обязательна; без неё 400. Старые full profile API сохранены.
- GameHub/formatMs извлечены; игровая сцена/Pixi и онбординг загружаются отдельно от оболочки. Старт не ждёт daily/training и старые картинки арены.
- Разрешение карты учитывает размер экрана/ограничения устройства. Удержание ограничено 64 artwork-ссылками и двумя картами. Освещение использует общий минутный clock, останавливается в hidden и пересчитывается по возвращению.
- Тёплое открытие чата использует историю в кеше; после разрыва WS истории инвалидируются для сверки edits/deletes. Отметка прочтения привязана к хвосту, list/unread reconciliation объединены. Параллельные запросы одинакового bar lobby одной сессии объединены без кеширования завершённых snapshots.
- PWA precache содержит оболочку, карту и статические зависимости; вторичные модули кешируются по запросу. Старый failed chunk допускает явное обновление приложения; автоматического reload во время игры нет. Nginx возвращает 404 вместо HTML для отсутствующего `/assets`.
- Добавлены локальные Navigation Timing, build budget и CI gate. `APP_PERFORMANCE_METRICS=1` включает серверные Server-Timing/duration/pool pressure/event-loop P95; по умолчанию выключено. Новые метрики не содержат URL, UUID, query values, SQL, тексты или токены.

## Измеренные результаты

| Метрика | До | После |
| --- | --- | --- |
| Initial JS gzip | 327383 bytes | 180539 bytes (-44,85%) |
| Initial JS+CSS gzip | 408283 bytes | 258816 bytes (-36,61%) |
| Critical PWA precache | все secondary chunks | 36 entries, 1230,62 KiB |
| Round-trips истории 20 челленджей | 21 | 2 |
| Пересчёт освещения за 55 секунд внутри одной фазы | 55 | менее 3 |

Размеры получены из локальной production-mode сборки, не из опубликованного бинарника. Уменьшение размера и числа запросов не подменяет измерение пользовательской задержки. JSON: `2026-10-24-initial-before.json`, `2026-10-24-initial-after.json`, `2026-10-24-initial-final.json`.

## Проверки

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: **PASS**. Build предупреждает о chunk >500KB и устаревшем caniuse-lite; предупреждения не скрывались.
- Node test budget checker и `node packages/web/scripts/audit-performance-build.mjs packages/web/dist --check`: **PASS**. Те же команды добавлены в CI после build; Actions не запускались.
- Широкая web-регрессия после исправлений: **397 файлов / 3134 теста PASS**. Отдельно проверены предусмотренные изолированные suites: **4 файла / 134 теста PASS**. `DailyScreen.test.tsx`: **240/240 PASS**. Суммарно 3508 PASS в этих непересекающихся запусках.
- Затронутые server integration: **129/129 PASS** на выделенном локальном PostgreSQL Unix socket + Redis. Финальная проверка ограниченного trophy API, batch PostgreSQL parity, timing plugin: **29/29 PASS** на второй отдельной тестовой БД/Redis DB.
- SQL parity проверяет несколько диапазонов времени, границу недели, исключение чужих пользователей/bonus-голов, distinct comments и совпадение scalar/batch прогресса. Миграционные тесты проверяют backfill, completion/claim, rollback, concurrency, изменение/удаление каталога и нового игрока.
- Браузер: локальный fixture чужого профиля осмотрен; переход карта→собственный профиль→карта выполнен **30 раз**, все назначения открылись. Начальный переход выявил устаревший URL mock `/me`, исправлен только QA handler. Это desktop preview, не мобильная/authenticated production приёмка, не heap/FPS/filmstrip.
- Независимое финальное ревью: один Important — обход ограничения истории без category — воспроизведён через API (RED200 вместо400), исправлен, полный routes suite GREEN. Подтверждённых minors нет. Предположение о zero-row statement trigger снято: PostgreSQL вызывает FOR EACH STATEMENT даже при 0 rows; backfill тест GREEN.

## Красные полные suites и ограничения

Первый полный web запуск не зелёный. Наши обнаруженные регрессии (путь перенесённого GameHub в contract test, новый URL `/me` в daily mock, Node test в коллекции Vitest) исправлены и перепроверены. Остались **9 исходных падений**, повторённых в копии `origin/dev`:

- `OpenWindowObservationPlay.test.tsx`: 5 stale-observation-scene cases;
- `recordedObservation.test.ts`: 2 stale-observation-scene cases;
- `ChatInfoScreen.test.tsx` и `ChannelPostCommentsScreen.test.tsx`: 2 ожидания «Написать в личку» без авторизованного social context.

Они не исправлялись под видом оптимизации; исходные тесты сохранены. Поэтому весь web suite **не объявляется зелёным**.

Полный server suite: **2489 PASS, 9 FAIL, 51 SKIP**, 2 дополнительных suite setup errors из-за проверки localhost hostname у Unix-socket URL. Все 9 падений повторены на исходном `origin/dev` в отдельной source copy:

- `test/db/migration071.test.ts`: ожидает 13 старых accuracy игр, каталог уже содержит 10;
- `test/db/migration103.test.ts`: ожидает прежний version suffix artwork у всех достижений;
- `test/db/migration122.test.ts`: ожидает прежние города/награды accuracy каталога;
- `test/duel/openWindowCourse.test.ts`: 6 сценариев observation не получают state после ошибки устаревшей записи.

Контрольный baseline run: **9 FAIL / 6 PASS** в этих четырёх файлах. Locality guard failures — `src/bar/conflictPhrase.test.ts` и `src/bar/roomInvitationView.test.ts` — вызваны пустым hostname socket URL, а не изменением продукта. После использования явного localhost hostname с тем же локальным Unix socket оба проходят. Дополнительный финальный прогон этих тестов вместе с migration242, trophy routes и batch parity: **33/33 PASS**. Полные suites не объявляются зелёными; 51 SKIP не засчитаны как PASS.

Не выполнены: авторизованные cold/warm замеры реальных профилей, EXPLAIN на масштабе dev, мобильные heap/FPS/long tasks, установка/обновление/offline/quota PWA, screenshot filmstrip выходов из настоящей игры. Виртуализация 2000 сообщений не реализована; рейтинг/chat-list SQL, GPU/media/worker рефакторинг остаются этапами по результатам измерений. Граница завершённой локальной реализации указана в §9 плана. Новый релиз не разрешён и не выполнялся.

## Принятые решения и цена

- Работа ведётся в уже существовавшем каталоге задачи: основной checkout с несвязанными изменениями сохранён. Исполнение inline; отдельный агент использован только для финального read-only review.
- Счётчики игрока пересчитываются при смене completion/claim boolean, а не на каждом промежуточном progress. Общие итоги не дублируются у каждого игрока. Изменение каталога делает общий rebuild в транзакции: перед релизом нужно проверить его время/блокировки на dev.
- Legacy full/summary profile API сохранил repair для совместимости со старым клиентом. Цена — старые клиенты до обновления сохраняют прежнюю нагрузку. Новый компактный UI использует read-only countersOnly.
- Полный кеш профиля служит только начальным значением с исходным timestamp; явная invalidation запускает новый лёгкий запрос. Цена — дополнительный лёгкий запрос после invalidation вместо риска старого уровня/баланса.
- Не выполнялись speculative GPU/gameplay/media/rating переписывания без замеров. Цена — неподтверждённые bottlenecks остаются до аппаратного/авторизованного профиля. Численные цели 200мс/1с не выдаются за достигнутый факт.
