# «Меткость»: очки за видимый приём — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Новые попытки «Меткости» получают ровно одну из семи видимых категорий и 10–20 хранимых десятых долей за гол; старые попытки остаются на своих правилах.

**Architecture:** Чистый детерминированный классификатор V4 живёт в game-core и использует геометрию того же броска, который разрешает попадание. Сервер выбирает версию из неизменяемого снимка попытки, сохраняет измерения и единственную награду; клиент только форматирует подтверждённый ответ. Каталог десяти игр получает V4 через forward-only миграцию после воспроизводимой калибровки.

**Tech Stack:** TypeScript, Vitest, Fastify, PostgreSQL migration, React/Pixi, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-23-marksmanship-visible-techniques-design.md`

## Global Constraints

- V4 действует только при `scoring.version = 4`; снимки V1/V2/V3 и их результаты не переписываются.
- Награды в целых десятых долях: простой 10, рядом 12, у борта 13, противоход 13, меткий 14, за вратаря 15, суперметкий 20.
- Приоритет: суперметкий → за вратаря → меткий → противоход → у борта → рядом → простой. Ни серии, ни длительность окна очков не прибавляют.
- Для незабитых бросков искать голевой шанс в ±600 мс; окно <25 мс не считать обычной человеческой ошибкой.
- `GAME_CORE_VERSION` не менять без изменения физики; не трогать дуэли, тренировки, «Скорость» и «Точность».
- Не запускать интеграционные server tests на общей БД/Redis; перед ними проверить отдельные `TEST_DATABASE_URL` и `TEST_REDIS_URL`, не выводя значения.
- Не отправлять на dev или production без отдельного запроса пользователя. Команды из корня этого worktree; после game-core build обновлять его потребителей.

## Review Focus

1. Старый V3-снимок после появления V4: тот же ввод должен сохранить прежние очки и подпись — Task 1, 3, 4.
2. Пограничные значения 12/35/80/200 и разворот в момент броска: категория должна определяться геометрией без случайного скачка — Task 1, 2.
3. Промах с шансом на 319 мс и сверхкоротким окном <25 мс: первый релевантен, второй не именуется обычной человеческой ошибкой — Task 2, 3.
4. Повторная отправка броска и поздний ответ старой попытки: сервер начисляет один раз, экран не показывает старую плашку — Task 3, 4.
5. Дробные очки на табло, в результате, в цели и в плашке на узком экране: одна шкала и ширина не больше табло — Task 4, 5.

## Карта файлов и интерфейсов

- `packages/game-core/src/marksmanship.ts`: оставить V1–V3 ветви; добавить тип `MarksmanshipV4Technique`, `DEFAULT_MARKSMANSHIP_V4_SCORING_RULES`, разбор V4 и чистое определение приёма по измерениям.
- `packages/game-core/test/marksmanship.test.ts`: табличные граничные/отрицательные/направленные тесты V4 и неприкосновенности V3.
- `packages/game-core/test/marksmanshipV4Reference.test.ts` и обезличенный fixture в `packages/game-core/test/fixtures/`: исходы и признаки 87 бросков, отдельная проверка всех 17 незабитых ситуаций. Файл fixture не содержит production IDs/PII.
- `packages/game-core/test/marksmanshipV4Targets.test.ts`: 30 seed × 3 стратегии × 10 длительностей, вычисляет десять целей из V4.
- `packages/server/src/bonusGames/marksmanshipScoreDetails.ts`, `packages/server/src/bonusGames/service.ts` и тесты `packages/server/test/bonusGames/marksmanshipScoreDetails.test.ts`, `shots.test.ts`: запись/чтение V4, идемпотентность и совместимость.
- `packages/web/src/api/bonusGames.ts`, `packages/web/src/screens/BonusGamePlayScreen.tsx` и его тесты: V4 DTO, подпись, десятичное форматирование и двухсекундная плашка.
- `packages/server/db/migrations/155_marksmanship_visible_techniques.sql`: только каталог десяти новых попыток, рассчитанные цели и описание.

### Task 1: Версионированный классификатор семи приёмов

**Files:** Modify `packages/game-core/src/marksmanship.ts`; Test `packages/game-core/test/marksmanship.test.ts`.

**Interfaces:** `MarksmanshipV4Technique = 'ordinary' | 'near_goalie' | 'board_side' | 'counter_direction' | 'precise' | 'behind_goalie' | 'super_precise'`; `MarksmanshipV4Score = { technique: MarksmanshipV4Technique; points: 10 | 12 | 13 | 14 | 15 | 20; availableTechniques: MarksmanshipV4Technique[] }`; `classifyMarksmanshipV4Score(measurements: MarksmanshipV4Measurements): MarksmanshipV4Score`. Снимок `MarksmanshipScoringRules` расширяется строгой V4-ветвью, не меняя V3.

- [ ] Добавить RED-тесты таблицей: все семь положительных примеров и соседние отрицательные (`gap=12/13`, `35/36`, `80/81`, goalieTravel `200/199`; оба края борта и оба направления; нулевое направление при развороте). Проверить ровно одну награду и порядок при пересечении признаков.
- [ ] Запустить `pnpm --filter @hockey/game-core exec vitest run test/marksmanship.test.ts`; зафиксировать конкретный FAIL новых тестов, не засчитывать старые PASS.
- [ ] Добавить измерения от реальных хитбоксов у линии вратаря/ворот и чистый выбор категории. В V4-ветви `classifyMarksmanshipShot` гол получает `awardedPoints = score.points`, не гол — `0`; серии и окно остаются только аналитикой. `parseMarksmanshipScoringRules` отвергает V4 с отсутствующими/чужими полями.
- [ ] Повторить targeted test, затем `pnpm --filter @hockey/game-core test` и `pnpm --filter @hockey/game-core build`; сохранить V3 регрессию.
- [ ] Просмотреть diff только этих файлов и закоммитить `feat: classify visible marksmanship techniques`.

### Task 2: Эталонная дуэль и поиск шанса

**Files:** Create `packages/game-core/test/fixtures/marksmanshipV4Reference.ts`, `packages/game-core/test/marksmanshipV4Reference.test.ts`; Modify `packages/game-core/src/marksmanship.ts`.

**Interfaces:** fixture хранит обезличенные seed/shot index/времена/параметры/ожидаемые фактические исходы и ручные метки; `classifyMarksmanshipShot` возвращает для V4 `opportunity`, `timingErrorMs`, `windowDurationMs`, технику и измерения независимо от результата.

- [ ] Перенести только нужные численные исходные данные 87 бросков из утверждённого разбора/локальной read-only выгрузки; тестом убедиться в отсутствии user/match IDs, имён и неполного набора номеров.
- [ ] Добавить RED-тесты: 87/87 исходов; номера 29, 42, 61, 74, 81 закрыты; №48 с доступным шансом +319 мс; №17 релевантный промах; №16 суперметкий, №30 борт. Для всех расхождений с ручной меткой вывести измерения, не подбирать исключения по номеру.
- [ ] Запустить `pnpm --filter @hockey/game-core exec vitest run test/marksmanshipV4Reference.test.ts`; зафиксировать RED.
- [ ] Для V4 расширить поиск до ±600 мс, оставив V1–V3 ±250 мс; уточнять границы успешного окна после шага 10 мс. Ввести отдельный аналитический признак сверхкороткого окна `<25` и не выдавать ему текст обычной ошибки. Проверять `earliestTapTime` и детерминизм.
- [ ] Повторить reference и V3 tests, затем game-core build; закоммитить `test: pin marksmanship reference situations` вместе с минимальной правкой поиска.

### Task 3: Серверный снимок и очки

**Files:** Modify `packages/server/src/bonusGames/marksmanshipScoreDetails.ts`, `packages/server/src/bonusGames/service.ts`; Test `packages/server/test/bonusGames/marksmanshipScoreDetails.test.ts`, `packages/server/test/bonusGames/shots.test.ts`.

**Interfaces:** `MarksmanshipScoreDetails` получает `{ version: 4, technique, availableTechniques, pointsTenths, result, opportunity, windowDurationMs, timingErrorMs, geometry, measurements, series }`. `toMarksmanshipScoreDetails(classification, scoring)` выбирает V4 только по `scoring.version === 4`; `awarded_points` остаётся целым числом, но в V4 означает десятые доли.

- [ ] Написать RED-тесты на V4 goal/save/miss, повторную отправку одного shot index, неизменность V3 snapshot/score_details и отклонение несогласованной серверной категории/суммы.
- [ ] Запустить targeted `marksmanshipScoreDetails.test.ts`; интеграционный `shots.test.ts` запускать лишь после проверки выделенных тестовых DB/Redis и существующего setup.
- [ ] Сохранить V4 детали атомарно с серверным результатом и начислением; не брать клиентскую категорию/очки как истину. Для старых версий оставить прежнюю форму ответов и вычислений.
- [ ] Запустить targeted tests и `pnpm --filter @hockey/server typecheck`; отметить отдельно любые SKIP интеграции; закоммитить `feat: persist authoritative marksmanship v4 scores`.

### Task 4: Клиентский вывод без перерасчёта

**Files:** Modify `packages/web/src/api/bonusGames.ts`, `packages/web/src/screens/BonusGamePlayScreen.tsx`; Test `packages/web/src/screens/BonusGamePlayScreen.test.tsx` (или существующий фактический файл тестов экрана).

**Interfaces:** `formatMarksmanshipPoints(value: number, version: 4 | 3 | 2 | 1): string` делит на 10 только V4; `marksmanshipResultPresentation` получает V4 details и отдаёт одну часть `{ points, label }` из серверного приёма.

- [ ] Добавить RED-тесты на семь русских подписей, `10→+1`, `12→+1,2`, `20→+2`, не гол без плашки, показ при видимом результате ровно 2 секунды, stale response/смену попытки, старую V3 подпись и дробные итог/цель/остаток.
- [ ] Запустить `pnpm --filter @hockey/web exec vitest run src/screens/BonusGamePlayScreen.test.tsx` с фактическим путём; зафиксировать RED.
- [ ] Добавить V4 DTO и единый формат на границе UI; не менять обычные модалки. Сохранить серверное подтверждение как единственный источник подписи; при новой попытке/размонтаже чистить timeout и pending notice. Ограничить плашку шириной табло на малом экране.
- [ ] Повторить targeted test, `pnpm --filter @hockey/web typecheck`, браузером во внутреннем браузере проверить реальные гол/сейв/промах и узкий viewport. Закоммитить `feat: show visible marksmanship score`.

### Task 5: Воспроизводимые цели и forward-only каталог

**Files:** Create `packages/game-core/test/marksmanshipV4Targets.test.ts`, `packages/server/db/migrations/155_marksmanship_visible_techniques.sql`; Test affected catalog/rules tests.

**Interfaces:** калибратор использует V4 `classifyMarksmanshipShot` и те же `DURATIONS_MS`, `RATIOS`, `SEEDS`, `FLIGHT_MS`, `PAUSE_MS` из V3 контроля; результат — десять возрастающих целых targets в десятых долях.

- [ ] Перенести калибровочную процедуру 30 seed × «раньше/дороже/очки за время», но рассчитывать кандидата V4 классификатором, без V3 `classifyMarksmanshipV3Score`. Записать контрольные медианы/цели тестом и достижимость каждого target на ≥15 seed.
- [ ] Запустить V4 calibration test; зафиксировать конкретные десять чисел и RED до добавления миграции/ожидаемого массива.
- [ ] Написать migration 155: обновить ровно UUID `...701`–`...710`, `qualification_rules.scoring.version=4`, `targetPoints`, `target_goals`, описание семи приёмов и `preview_revision/revision`; ни один `bonus_game_attempt`/shot не UPDATE/DELETE. Не механически масштабировать V3 числа.
- [ ] Проверить миграцию на отдельной тестовой PostgreSQL: ровно 10 catalog rows changed, V4 parse valid, прежняя попытка читает V3 snapshot; проверить повторное применение согласно runner/migration ledger. После тестов сохранить независимый дамп результатов калибровки в тесте, без персональных данных.
- [ ] Запустить `pnpm --filter @hockey/game-core exec vitest run test/marksmanshipV4Targets.test.ts` и targeted server catalog/qualification; закоммитить `feat: calibrate marksmanship v4 levels`.

### Task 6: Сквозная проверка и передача

**Files:** Только тесты/документация, если найдены реальные пробелы; production files без отдельного RED не расширять.

- [ ] Запустить game-core build, затем `pnpm typecheck`, `pnpm lint`, `pnpm build` и затронутые suites; зафиксировать PASS/FAIL/SKIP отдельно и не объявлять неизвестный baseline «старой ошибкой» без доказательства.
- [ ] Проверить `git diff --check`, полный diff против базы задачи и отсутствие посторонних файлов/секретов/PII; пересмотреть replay 87 и 10 targets.
- [ ] Во внутреннем браузере открыть локальную реальную V4 попытку; проверить очки/подпись/2 секунды, сейв/мимо, табло и завершение уровня на маленьком экране. Отдельно открыть существующую V3 попытку и убедиться, что прежняя шкала сохранилась.
- [ ] Передать пользователю ссылку на локальный результат и чётко назвать локальные тесты, браузерный результат и то, что dev/production не обновлялись. Слияние/публикация — только в отдельно разрешённом release scope.
