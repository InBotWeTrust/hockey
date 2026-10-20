# Marksmanship V5 Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Оценивать новые голы «Меткости» по восьми зеркальным геометрическим приёмам, не меняя исход броска и старые попытки.

**Architecture:** Новый чистый V5-классификатор принимает точные игровые хитбоксы и направления, возвращая один приём и целые десятые доли очков. Существующий конвейер броска вычисляет эти входы при пересечении шайбой линий вратаря и ворот, а сервер сохраняет версионированный результат. V1–V4 остаются отдельными ветвями; каталог новых игр переходит на V5 только после калибровки целей.

**Tech Stack:** TypeScript, pnpm, Vitest, Fastify, PostgreSQL, React.

**Spec:** `docs/superpowers/specs/2026-09-25-marksmanship-v5-scoring-design.md`

## Global Constraints

- Новый снимок правил — `scoring.version = 5`; старые попытки V1–V4 не пересчитываются.
- Очки хранятся целыми десятыми долями: 10, 12, 13, 14, 16, 17, 18 или 20; только подтверждённый гол приносит очки.
- Игрок: последнее направление перед нажатием; вратарь: при пересечении его линии; ворота: при пересечении створа.
- Использовать игровые хитбоксы `resolvePerspectiveCourtShot`, не экранные CSS/SVG размеры.
- Бросок, траектории, скорости, полёт, пауза и другие режимы не меняются.
- Сервер — источник подтверждённых очков; клиент не суммирует и не начисляет их самостоятельно.
- Кодовые идентификаторы, комментарии и коммиты — на английском; UI — на русском.
- Перед кодом прочитать `packages/game-core/AGENTS.md`, `packages/server/AGENTS.md`, `packages/web/AGENTS.md`, `docs/engineering/testing.md` и `docs/engineering/game-state.md`, если эти документы доступны в актуальной рабочей базе. Не запускать интеграционные тесты против пользовательской БД.
- Работа ведётся в `feature/marksmanship-v5-scoring` от проверенного `origin/dev`; перед интеграцией повторно проверить свежесть базы. Push, merge и dev/production deployment не входят в этот план без отдельного разрешения.

## Review Focus

1. Шайба на границе хитбокса вратаря — сейв и 0, а не «На грани»; закрепить интеграционным тестом Task 2.
2. Разворот ворот или вратаря ровно в момент пересечения — направление 0, противоход не появляется; закрепить тестом Task 2.
3. Граница двух приёмов, например просвет ровно 6 или внешний зазор ровно 8, даёт один приём с большим числом очков; закрепить таблицей Task 1.
4. Продолжение сохранённой V4-попытки после выпуска V5 сохраняет прежние очки и `score_details.version = 4`; закрепить серверным тестом Task 3.
5. Старый повтор в конструкторе не получает новую подпись V5 при прокрутке или выборе гола; закрепить web-тестом Task 5.

---

## File map

- `packages/game-core/src/marksmanshipV5.ts`: только определения измерений и чистая классификация V5.
- `packages/game-core/src/marksmanship.ts`: выбор версии, вычисление измерений из симуляции, версия правил и формат классификации.
- `packages/game-core/src/index.ts`, `src/version.ts`: публичный контракт и версия ядра.
- `packages/server/src/bonusGames/marksmanshipScoreDetails.ts`, `service.ts`: версионированный ответ, сохранение и допустимые старые версии.
- `packages/server/db/migrations/161_marksmanship_scoring_v5.sql`: каталог будущих попыток; при занятом номере выбрать следующий свободный номер до написания миграции и её теста.
- `packages/web/src/api/bonusGames.ts`, `screens/BonusGamePlayScreen.tsx`, `screens/MarksmanshipConstructorScreen.tsx`: типы, подписи и конструктор; старый replay остаётся на своей версии.
- Тесты рядом с перечисленными модулями. Не выносить правила классификации в web или SQL.

### Task 1: Чистые правила V5

**Files:**
- Create: `packages/game-core/src/marksmanshipV5.ts`
- Create: `packages/game-core/test/marksmanshipV5.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**
- Consumes: `puckX`, `goalMin`, `goalMax`, `goalieMin`, `goalieMax` и три направления `-1 | 0 | 1` в игровых единицах.
- Produces: `classifyMarksmanshipV5Score(m: MarksmanshipV5Measurements): MarksmanshipV5Score`, где score содержит `technique`, `points` и `availableTechniques`.

- [ ] **Step 1: Написать RED-таблицу геометрии.** Тестовые фабрики используют минимальный вход `{ puckX, goalMin, goalMax, goalieMin, goalieMax, shooterDirection, goalDirection, goalieDirection }`. Зафиксировать положительные и отрицательные случаи всех восьми приёмов, включая зеркала: `goalMin=55` и `goalMax=517`, `goalieMin=36.7` и `goalieMax=535.9`. Для «За вратаря» проверить `(+1,-1,-1,puckRight)` и `(-1,+1,+1,puckLeft)`; та же геометрия с шайбой на неправильной стороне не проходит.

  ```ts
  expect(classifyMarksmanshipV5Score({
    puckX: 297, goalMin: 220.2, goalMax: 300,
    goalieMin: 220, goalieMax: 294,
    shooterDirection: 1, goalDirection: -1, goalieDirection: -1,
  })).toMatchObject({ technique: 'super_precise', points: 20 });
  ```
- [ ] **Step 2: Проверить RED.** `pnpm --filter @hockey/game-core exec vitest run test/marksmanshipV5.test.ts`; ожидается ошибка отсутствующего экспорта/классификатора.
- [ ] **Step 3: Реализовать чистый классификатор.** Вычислить сторону шайбы по `puckX < goalieMin ? 'left' : puckX > goalieMax ? 'right' : null`; при `null` V5-приём не назначать. При пересечении хитбоксов `innerGap = side === 'left' ? goalieMin - goalMin : goalMax - goalieMax`; при непересечении `outerGap = Math.max(0, goalMin - goalieMax, goalieMin - goalMax)`. Активные правила — ровно таблица и порядок из spec: `super_precise(20)`, `edge(18)`, `corner(17)`, `behind_goalie(16)`, `precise(14)`, `counter_direction(13)`, `near_goalie(12)`, `ordinary(10)`. Для «сложного» использовать `(overlap && innerGap >= 72) || (!overlap && outerGap <= 8)`. Вернуть первое активное правило и весь список активных.
- [ ] **Step 4: Проверить GREEN и края.** Та же команда; дополнительно тесты `6`, `6+epsilon`, `8`, `30`, `35`, `40`, `72`, `75`, `79.8`, расстояния шайбы `3`/`3+epsilon`, четыре края угловых диапазонов. Проверить `points=20` при совпадении «Суперметкого» и «На грани».
- [ ] **Step 5: Коммит.** `git add packages/game-core/src/marksmanshipV5.ts packages/game-core/src/index.ts packages/game-core/test/marksmanshipV5.test.ts` и `git commit -m "feat: classify marksmanship v5 techniques"`.

### Task 2: Подключение V5 к симуляции броска

**Files:**
- Modify: `packages/game-core/src/marksmanship.ts`
- Modify: `packages/game-core/src/version.ts`
- Modify: `packages/game-core/test/version.test.ts`
- Modify: `packages/game-core/test/marksmanship.test.ts`

**Interfaces:**
- Consumes: `classifyMarksmanshipV5Score` и существующий `MarksmanshipShotInput`.
- Produces: `DEFAULT_MARKSMANSHIP_V5_SCORING_RULES`, `v5Measurements` и `v5Score` в `MarksmanshipShotClassification`, без изменения V1–V4 ветвей.

- [ ] **Step 1: Написать RED-тесты** для `parseMarksmanshipScoringRules({...DEFAULT_MARKSMANSHIP_V4_SCORING_RULES, version: 5})`, двух одинаковых V5-вызовов, V4 на том же input, шайбы точно на границе вратаря (`save`, 0), разных времён пересечения, направления игрока до паузы и нуля направления в точке разворота ворот/вратаря. Отдельно зафиксировать, что `shooterTapTime` используется вместо scene `tapTime` для направления игрока.

  ```ts
  expect(parseMarksmanshipScoringRules({
    ...DEFAULT_MARKSMANSHIP_V4_SCORING_RULES, version: 5,
  }).version).toBe(5);
  ```
- [ ] **Step 2: Проверить RED.** `pnpm --filter @hockey/game-core exec vitest run test/marksmanship.test.ts test/version.test.ts`; ожидается отсутствие V5-константы/полей.
- [ ] **Step 3: Подключить V5.** Новые измерения получить из `getPerspectiveCourtGoalieHitbox` и `getPerspectiveCourtGoalOpening` с теми же `ShotInput`, seed, `shotIndex`, neutral stick и phase offsets, что у `resolvePerspectiveCourtShot`. Направление игрока вычислить из `simulateShooter(shooterTapTime + phase)` и позиции непосредственно до неё; направления ворот/вратаря — из симуляции вокруг их соответствующих crossing-time, возвращая 0 на точке разворота. В `classifyMarksmanshipShot` для V5 при голе вернуть `v5Score.points`, иначе 0 и доступную ближайшую ситуацию по действующему V4-подходу; V4 не переписывать. Расширить parser до версии 5, экспорт, bump `GAME_CORE_VERSION` с текущих 64 до 65 (или следующего значения после обновления базы) и версионный тест.
- [ ] **Step 4: Проверить GREEN.** `pnpm --filter @hockey/game-core test` и `pnpm --filter @hockey/game-core build`; проверить прежние V4 reference и target tests без обновления их ожиданий.
- [ ] **Step 5: Коммит.** `git add packages/game-core/src packages/game-core/test` и `git commit -m "feat: score v5 shots at puck crossing times"`.

### Task 3: Серверный контракт и исторические попытки

**Files:**
- Modify: `packages/server/src/bonusGames/marksmanshipScoreDetails.ts`
- Modify: `packages/server/src/bonusGames/service.ts`
- Modify: `packages/server/test/bonusGames/marksmanshipScoreDetails.test.ts`
- Modify: `packages/server/test/bonusGames/shots.test.ts`

**Interfaces:**
- Consumes: `v5Measurements`, `v5Score`, `scoring.version = 5`.
- Produces: `MarksmanshipScoreDetails` ветку `{ version: 5, measurements, technique, availableTechniques, pointsTenths, result, ... }`; V4 payload остаётся прежним.

- [ ] **Step 1: Написать RED-тесты**: V5 goal сохраняет ровно выбранные десятые доли и версию 5; save/miss сохраняют 0; повтор запроса броска не начисляет очки повторно; V4-snapshot при новой версии сервера возвращает `score_details.version=4` и прежние очки; старый `game_core_version=64` обслуживается для поддерживаемой bonus-попытки без новой формулы.

  ```ts
  expect(toMarksmanshipScoreDetails(v5GoalClassification, v5Rules)).toMatchObject({
    version: 5, result: 'goal', technique: 'edge', pointsTenths: 18,
  });
  expect(toMarksmanshipScoreDetails(v4GoalClassification, v4Rules).version).toBe(4);
  ```
- [ ] **Step 2: Проверить RED.** Запустить только указанные файлы direct Vitest по инструкции `docs/engineering/testing.md`; до интеграционного теста удостовериться в выделенной test DB/Redis. Если они недоступны, провести unit-тесты и пометить интеграционное покрытие как не выполненное.
- [ ] **Step 3: Добавить V5-ветку сериализации и совместимости.** В `toMarksmanshipScoreDetails` вернуть V5-объект только при `scoring.version === 5`, валидировать обязательные `v5Score/v5Measurements`; добавить 64 в `LEGACY_BONUS_GAME_CORE_VERSIONS`, не ослабляя проверку произвольных версий. Сохранить серверное подтверждение результата и идемпотентность существующего обработчика; не менять исходы shot resolver. Проверить действующий ответ initial/advanced training при версии сессии 64: сервер не должен молча применять ядро 65 к старой сессии; если возвращается 409, клиентский сценарий возобновления/ошибки должен быть проверен.
- [ ] **Step 4: Проверить GREEN.** Запустить целевые unit/интеграционные тесты в безопасной тестовой среде и `pnpm --filter @hockey/server typecheck` после сборки game-core. Проверить реальный JSON-контракт `version: 4` и `version: 5` в тестах.
- [ ] **Step 5: Коммит.** `git add packages/server/src/bonusGames packages/server/test/bonusGames` и `git commit -m "feat: persist marksmanship v5 score details"`.

### Task 4: Калибровка целей и каталог новых игр

**Files:**
- Create: `packages/game-core/test/marksmanshipV5Targets.test.ts`
- Create: `packages/server/db/migrations/161_marksmanship_scoring_v5.sql`
- Create: `packages/server/test/db/migration161.test.ts`
- Modify: `packages/server/test/bonusGames/catalog.test.ts`

**Interfaces:**
- Consumes: V5-классификатор и существующий seed/flight/pause калибратор V4.
- Produces: десять воспроизводимых V5 target-points и миграцию только каталога.

- [ ] **Step 1: Написать RED-калибровку.** Скопировать фиксированные 30 seed, длительности `[30,50,70,90,110,130,150,170,190,210]` секунд, стратегии `earliest/highest/rate`, шаг 10 мс, полёт 416 мс и паузу 1000 мс из `marksmanshipV4Targets.test.ts`; заменить только scoring на V5. Для первого RED поставить прежний V4-массив как намеренно проверяемую гипотезу: `expect(targets).toEqual([111, 191, 285, 383, 492, 622, 754, 883, 1037, 1193])`. Тест также проверяет строго возрастающие цели и достижимость каждой не менее чем на 15 seed. Отдельный тест миграции проверяет, что V4 attempt snapshots и `shot_session` не обновляются.
- [ ] **Step 2: Проверить RED и записать факты.** Запустить `pnpm --filter @hockey/game-core exec vitest run test/marksmanshipV5Targets.test.ts`; выписать вычисленный V5-массив из расхождения с V4. Вписать эти десять целых целей явно в ожидаемый массив и SQL, не подбирать вручную ради красивой шкалы.
- [ ] **Step 3: Добавить forward-only SQL.** По образцу `155_marksmanship_visible_techniques.sql` обновить только десять UUID `...0701`–`...0710` в `bonus_game`: `scoring.version=5`, вычисленные `targetPoints`/`target_goals`, русские description/preview с восемью приёмами и ревизии. Процентную долю V5 округлить вниз до целого очка до записи в десятых долях: `Math.floor(median * ratio / 10) * 10`. Добавить version guard для каталожных V4-правил, чтобы повторный прогон не перезаписал более новую конфигурацию. Не менять снимки попыток и историю бросков.
- [ ] **Step 4: Проверить GREEN.** Запустить калибровочный тест, миграционный тест только на отдельной тестовой PostgreSQL и catalog test; затем проверить `git diff` на отсутствие обновления старых попыток. Если номер 161 занят после обновления базы, одновременно переименовать SQL и тест на следующий свободный номер.
- [ ] **Step 5: Коммит.** `git add packages/game-core/test/marksmanshipV5Targets.test.ts packages/server/db/migrations packages/server/test` и `git commit -m "feat: calibrate and catalog marksmanship v5"`.

### Task 5: Web-подписи, конструктор и повтор

**Files:**
- Modify: `packages/web/src/api/bonusGames.ts`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.tsx`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.test.tsx`
- Modify: `packages/web/src/screens/MarksmanshipConstructorScreen.tsx`
- Modify: `packages/web/src/screens/MarksmanshipConstructorScreen.test.tsx`
- Modify: `packages/web/src/screens/MarksmanshipRecordedReplay.test.tsx`

**Interfaces:**
- Consumes: API `score_details.version=5`, V5 names/points and V5 classifier.
- Produces: одна русская подпись подтверждённого приёма; V4 повтор показывает V4 данные.

- [ ] **Step 1: Написать RED-тесты.** V5 `edge` показывает «На грани» и `+1,8`; `corner` показывает «Сложный в углу» и `+1,7`; V5 save/miss не показывает начисления; V4 response по-прежнему показывает старую подпись. В конструкторе фильтр содержит восемь новых вариантов, переход к голу сохраняет выбранное время и V5-оценку; исторический V4 replay при scrub и выборе гола не меняет подпись на V5.

  ```ts
  expect(screen.getByText('На грани')).toBeInTheDocument();
  expect(screen.getByText('+1,8')).toBeInTheDocument();
  ```
- [ ] **Step 2: Проверить RED.** Выполнить direct Vitest для трёх web test-файлов по `docs/engineering/testing.md` после `pnpm --filter @hockey/game-core build`; ожидать отсутствия V5-разветвления.
- [ ] **Step 3: Подключить типы и представление.** Добавить discriminated union `version: 5` в API; вынести V4/V5 таблицу русских названий в узкий helper рядом с экраном либо оставить два полных switch, если helper увеличивает связность. Конструктор использует `DEFAULT_MARKSMANSHIP_V5_SCORING_RULES`; исторический replay сохраняет сохранённый scoring и не вызывает V5 для старой записи. Модалку `ГОЛ/МИМО/СЭЙВ`, табло и CSS площадки не менять.
- [ ] **Step 4: Проверить GREEN.** Запустить целевые web-тесты и `pnpm --filter @hockey/web typecheck`; вручную проверить в браузере малый экран, список/фильтр и один V5 гол, отдельно старый V4 повтор. Не считать demo smoke доказательством реального броска.
- [ ] **Step 5: Коммит.** `git add packages/web/src/api/bonusGames.ts packages/web/src/screens` и `git commit -m "feat: display marksmanship v5 techniques"`.

### Task 6: Сквозная проверка и подготовка интеграции

**Files:**
- No product-code change unless a named test exposes a defect; fix it in the owning task with its own RED/GREEN cycle.

**Interfaces:**
- Consumes: commits Tasks 1–5.
- Produces: reviewable branch and evidence report; no push/deploy.

- [ ] **Step 1: Перечитать spec по пунктам.** Сверить восемь условий, две временные точки, V1–V4 и десять целей с тестами и diff; при обнаружении пропуска вернуться к соответствующей задаче.
- [ ] **Step 2: Запустить проверки.** `pnpm --filter @hockey/game-core build`, `pnpm typecheck`, `pnpm lint`, targeted suites и `pnpm build`; полный `pnpm test` запускать при доступной изолированной test DB/Redis, иначе честно перечислить пропуски. Не объявлять непрогнанный тест успешным.
- [ ] **Step 3: Проверить ветку.** `git diff origin/dev...HEAD --check`, `git diff --stat origin/dev...HEAD`, `git status --short`; выполнить независимый обзор всей ветки и исправить конкретные замечания с регрессионными тестами.
- [ ] **Step 4: Передать результат.** Сообщить SHA, локальные проверки, browser acceptance, CI и deploy отдельно. Предложить PR в `dev` только в рамках нового подтверждения релизного шага; production не трогать.
