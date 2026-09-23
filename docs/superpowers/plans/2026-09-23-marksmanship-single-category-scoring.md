# «Меткость»: одна категория за гол — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каждый новый гол «Меткости» даёт ровно 1–4 очка по одной наиболее сложной причине; цели десяти игр согласованы с новой шкалой, а старые попытки не меняются.

**Architecture:** В `game-core` добавить версионированные правила и чистый V3-классификатор поверх существующей симуляции броска. Сервер применяет формулу из сохранённого снимка попытки, отдаёт `score_details.version: 3` и сохраняет старые ветки без изменения. Web отображает одну причину из серверного ответа, а миграция обновляет только каталог будущих попыток.

**Tech Stack:** TypeScript, Vitest, Fastify, PostgreSQL migrations, React, Pixi, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-23-marksmanship-single-category-scoring-design.md`

## Global Constraints

- Новый гол: целое число 1–4, ровно одна категория; промах и сэйв: 0.
- Временные пороги: `<70` → 4, `70–99` → 3, `100–159` → 2, `≥160` мс → 1; шаг сканирования 10 мс.
- Геометрия только повышает категорию до 2/3/4 по порогам 24 и 15 игровых единиц; двойка и тройка не влияют на очки V3.
- Длительности 30–210 секунд шагом 20 секунд; доли целей 50/53/57/60/63/67/70/73/77/80% от медианного контрольного результата.
- Старые snapshots, броски, награды и попытки не переписывать. Поддерживать game-core 62 и 63 при добавлении новой версии.
- Стандартные «ГОЛ», «МИМО», «СЭЙВ» не менять; плашка V3 — одна секция на 2 секунды, не шире табло, одновременно с результатом.
- Код/коммиты на английском, интерфейс на русском. Dev и production не публиковать в рамках выполнения этого плана без отдельного запроса.
- Перед тестами прочесть существующие инструкции тестирования; если `docs/engineering/testing.md` отсутствует в checkout, отметить это и использовать package scripts. После изменений game-core сначала собрать его `dist`.

## Review Focus

- Гол на границе 70/100/160 мс должен попасть ровно в одну соседнюю категорию (Task 1).
- Несколько признаков одной сложности должны дать ровно одну детерминированную причину, а не сумму (Task 1).
- Повторная отправка того же броска не должна начислить очки дважды (Task 2).
- Активная попытка V2 после обновления game-core должна сохранить прежнее начисление и прежнюю расшифровку (Tasks 2 и 4).
- Плашка не должна появиться при нажатии, раньше видимого результата или остаться после следующего броска/размонтирования (Task 4).

---

### Task 1: Версионированный классификатор в игровом ядре

**Files:**
- Modify: `packages/game-core/src/marksmanship.ts`
- Modify: `packages/game-core/src/index.ts` (только если новый тип/функция ещё не экспортируется через существующий export)
- Test: `packages/game-core/test/marksmanship.test.ts`

**Interfaces:**
- `parseMarksmanshipScoringRules(value: unknown): MarksmanshipScoringRulesV1V2 | MarksmanshipScoringRulesV3` принимает точные V1/V2 snapshots и новый `{version: 3, scanStepMs: 10, counterDirectionGoalDistance: 24, brackets: [{minWindowMs, points, code}]}`. V3 brackets имеют пороги 160/100/70/0, очки 1/2/3/4 и отдельные коды/причины без V2-бонусов.
- `classifyMarksmanshipShot(input)` сохраняет V1/V2 результат и для V3 дополнительно возвращает `category: 1 | 2 | 3 | 4` и `reason: MarksmanshipV3Reason | null`; `awardedPoints` у V3 равен категории. `reason` включает обычный/точный/узкий/мгновенный момент, левый/правый борт, вратарь прикрывает ворота, рядом с вратарём, противоход, рядом с уходящим вратарём.
- `MarksmanshipGeometry` расширяется полями `goalieNearGoal: boolean` и `boardSide: 'left' | 'right' | null`; старые булевы поля сохраняются для V1/V2. `goalieNearGoal` вычисляется по зазору игровых хитбоксов, `boardSide` — по координате игрока. Для V3 строгое различение двух бортов обязательно.

- [ ] **Step 1: Добавить RED-тесты парсинга и времени.** В `marksmanship.test.ts` задать `V3_RULES` со снимком выше; проверить, что V1/V2 парсятся без изменений, лишние поля V3 отклоняются, а категории для `[69,70,99,100,159,160]` равны `[4,3,3,2,2,1]`. Проверять через выделенную чистую функцию `classifyMarksmanshipV3Score({windowDurationMs, geometry})`, где `geometry.boardSide` — `'left' | 'right' | null`.

```ts
const EMPTY_GEOMETRY = {
  boardSide: null, goalieNearGoal: false, closeToGoalie: false,
  counterDirection: false, behindGoalie: false,
};
expect([69, 70, 99, 100, 159, 160].map((windowDurationMs) =>
  classifyMarksmanshipV3Score({ windowDurationMs, geometry: EMPTY_GEOMETRY }).category,
)).toEqual([4, 3, 3, 2, 2, 1]);
```
- [ ] **Step 2: Запустить RED.** `pnpm --filter @hockey/game-core test -- test/marksmanship.test.ts`; ожидать провал из-за отсутствующего V3 API, а не из-за окружения.
- [ ] **Step 3: Реализовать минимальный V3 API.** Сохранить существующий V1/V2 parser и `scoreMarksmanshipBreakdown` без замены формулы. В V3-функции взять категорию окна, повысить её по признакам `goalieNearGoal`, `closeToGoalie`, `boardSide` при окне `<160`, `counterDirection`, `behindGoalie`, выбрать одну причину по приоритету спецификации. Для V3 промаха/сэйва вернуть `category: null`, `reason: null`, 0; не вызывать серийный множитель. Отдельно передать видимую сторону борта из `shooterX` и границ движения; не угадывать её по направлению движения.

```ts
const category = Math.max(
  windowDurationMs < 70 ? 4 : windowDurationMs < 100 ? 3 : windowDurationMs < 160 ? 2 : 1,
  geometry.behindGoalie ? 4 : 1,
  geometry.counterDirection ? 3 : 1,
  geometry.boardSide !== null && windowDurationMs < 160 ? 3 : 1,
  geometry.closeToGoalie || geometry.goalieNearGoal ? 2 : 1,
) as 1 | 2 | 3 | 4;
```
- [ ] **Step 4: Дополнить RED/GREEN тестами геометрии.** Таблица: зазор 24/25, близость 15/16, левый/правый борт на границе 24, борт при окне 159/160, противоход у близких/далёких ворот, близкий противоход = 4; пересечение признаков проверяет один выбранный `reason` и 1–4 очка. Протестировать два гола с `previousGoals` в пределах секунды и три за прокат: V3 очки не растут; V2 тесты сохраняют старую сумму.
- [ ] **Step 5: GREEN и коммит.** Запустить целевой тест, `pnpm --filter @hockey/game-core typecheck`, `pnpm --filter @hockey/game-core build`, `git diff --check`; коммит `feat: classify marksmanship goals by one category`.

### Task 2: Серверный снимок и совместимость попыток

**Files:**
- Modify: `packages/server/src/bonusGames/qualification.ts`
- Modify: `packages/server/src/bonusGames/service.ts`
- Modify: `packages/game-core/src/version.ts`
- Test: `packages/server/test/bonusGames/types.test.ts`
- Test: `packages/server/test/bonusGames/shots.test.ts`

**Interfaces:**
- `BonusQualificationRules` использует union правил Task 1; `score_details.version: 3` содержит `windowDurationMs`, `category`, `reason`, `geometry`, `opportunity`, `timingErrorMs`, без `seriesBonus` и `situationBonus`. Старые варианты 1/2 остаются доступны для чтения.
- `GAME_CORE_VERSION` становится 64; сервер поддерживает 62, 63 и 64 для бонусных попыток, но начисляет по `rules_snapshot.qualificationRules.scoring`, а не по версии установленного клиента.

- [ ] **Step 1: Написать RED-тесты сервера.** В `shots.test.ts` создать V3 попытку с голом и проверить `awarded_points`/`total_points` в диапазоне 1–4, один `reason` и `score_details.version = 3`; промах и сэйв = 0; повтор той же пары `attempt_id + shot_index` возвращает тот же результат без нового начисления. Отдельно создать снимок V2 с версией ядра 63, затем продолжить его и сравнить старый `score_details.version = 2` и сумму; проверить принятие 62, 63, 64, отклонение неподдерживаемой версии.
- [ ] **Step 2: Запустить RED.** `pnpm --filter @hockey/server test -- test/bonusGames/shots.test.ts`; интеграционные тесты требуют существующего тестового PostgreSQL. Если БД недоступна, не объявлять RED/GREEN по ним и отдельно выполнить доступные unit-тесты.
- [ ] **Step 3: Реализовать серверную ветку.** Расширить типы/валидацию `points_in_time`, повысить `GAME_CORE_VERSION`, заменить двухверсийную проверку `isSupportedBonusGameCoreVersion` явным набором 62/63/64. В `service.ts` вынести текущий V2 literal в `legacyScoreDetails(classification)` без изменения полей; формировать V3 `scoreDetails` только когда снимок V3. Не менять idempotency, транзакцию и таблицы истории.

```ts
const isV3 = qualificationRules.type === 'points_in_time' &&
  'version' in qualificationRules.scoring && qualificationRules.scoring.version === 3;
const scoreDetails = classification === null ? null : isV3
  ? { version: 3 as const, windowDurationMs: classification.windowDurationMs,
      category: classification.category, reason: classification.reason,
      geometry: classification.geometry, opportunity: classification.opportunity,
      timingErrorMs: classification.timingErrorMs }
  : legacyScoreDetails(classification);
```
- [ ] **Step 4: GREEN, сборка и коммит.** Собрать game-core, запустить целевые server-тесты и `pnpm --filter @hockey/server typecheck`, проверить `git diff --check`; коммит `feat: persist versioned marksmanship scoring`.

### Task 3: Калибровка целей и forward-only миграция

**Files:**
- Modify: `packages/game-core/test/marksmanshipTargets.test.ts`
- Create: `packages/server/db/migrations/154_marksmanship_single_category_scoring.sql`
- Test: `packages/server/test/bonusGames/catalog.test.ts`
- Test: `packages/server/test/bonusGames/types.test.ts`

**Interfaces:**
- Калибратор использует V3 API Task 1 и опубликованные движения: 30 seed `marksmanship-target-phase-01…30`, шаг 10 мс, полёт 416 мс и пауза 1000 мс. Для каждого seed сравнивает три допустимые стратегии выбора броска: ранний гол, максимум очков, максимум очков/затраченное время; контрольное значение — лучший результат из трёх. Цель уровня — `max(1, floor(median(controlResults) × ratio))`.
- Миграция меняет только десять строк `bonus_game` UUID `…701`–`…710`: `qualification_rules`, `target_goals`, описание, `preview_story`, `revision`; старые `bonus_game_attempt.rules_snapshot`, `shot_session`, награды и периоды не меняет.

- [ ] **Step 1: Переписать тест-калибратор под V3 и получить RED.** В существующем `marksmanshipTargets.test.ts` убрать расчёт V2 бонусов/серий из цели. Для каждого seed прогонять все три стратегии до истечения 30–210 секунд с серверными задержками и `deriveShotSeed(seed, 1, shotIndex)`; проверять каждое выбранное очко каноническим `classifyMarksmanshipShot`. Зафиксировать `controlResults`, медиану и десять `TARGETS` в тесте; пока таблица не рассчитана, оставить ожидаемый массив прежним, чтобы видеть RED от новой шкалы (не оставлять его в финальном коде).
- [ ] **Step 2: Рассчитать новые цели и зафиксировать их.** Запустить `pnpm --filter @hockey/game-core test -- test/marksmanshipTargets.test.ts`, записать вычисленные 10 значений в тесте и миграции. Проверить строгое возрастание целей и что для каждого уровня не менее 15 из 30 seed имеют контрольный результат не ниже цели. Не подбирать цели вручную для прохождения теста: если условия не выполняются, остановиться и пересмотреть метод расчёта со спецификацией.
- [ ] **Step 3: Написать миграцию.** В SQL использовать `WITH level(...) VALUES` с десятью рассчитанными целями, `jsonb_build_object('version', 3, 'scanStepMs', 10, 'counterDirectionGoalDistance', 24, 'brackets', ...)`; update по точным UUID и `skill_code = 'marksmanship'`. Удалить обещание серий из `preview_story`, написать понятные правила шкалы 1–4 в описании/предпросмотре. Не делать `UPDATE` исторических таблиц.

```sql
update bonus_game AS game
set qualification_rules = jsonb_set(
      game.qualification_rules,
      '{scoring}',
      definition.scoring
    ),
    target_goals = definition.target_points,
    revision = game.revision + 1
from definition
where game.id = definition.id and game.skill_code = 'marksmanship';
```
- [ ] **Step 4: Проверить миграцию/каталог и коммит.** Тест каталога проверяет десять целей и V3 снимок после миграции в изолированной БД; если миграционный тест в checkout не предусмотрен, выполнить локальную миграцию только в выделенной тестовой БД, сверить 10 строк SQL-запросом и явно описать отсутствие автоматизированного миграционного теста. `git diff --check`; коммит `feat: recalibrate marksmanship track for v3`.

### Task 4: Web-контракт, правила и плашка результата

**Files:**
- Modify: `packages/web/src/api/bonusGames.ts`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.tsx`
- Modify: `packages/web/src/app/design-system.css` (только если одной секции недостаточно существующих правил)
- Test: `packages/web/src/screens/BonusGamePlayScreen.test.tsx`
- Test: `packages/web/src/api/bonusGames.test.ts`

**Interfaces:**
- Web `MarksmanshipScoreDetails` — union `version: 1 | 2 | 3`; у V3 `category` и `reason` из Task 1. V3 `marksmanshipResultPresentation` возвращает ровно `[{points: awardedPoints, label: reasonLabel}]`, V1/V2 сохраняют свои тексты.

- [ ] **Step 1: Написать RED-тесты V3.** Проверить в `BonusGamePlayScreen.test.tsx` серверный гол с несколькими признаками: до `onResultVisibilityChange(true)` плашки нет, после него ровно одна секция и `+4` с одной причиной, через 1999 мс есть, через 2000 мс нет; второй результат заменяет первый; закрытие/размонтирование удаляет таймер. На узком viewport `scrollWidth` плашки не больше ширины табло. В отдельном V2 тесте оставить расшифровку серии как регрессию. Для `miss/save` проверить стандартные модалки и отсутствие плашки.
- [ ] **Step 2: Запустить RED.** `pnpm --filter @hockey/web test -- src/screens/BonusGamePlayScreen.test.tsx`; ожидать отсутствие V3-контракта/одной причины.
- [ ] **Step 3: Реализовать V3 представление.** Добавить DTO union, отображать одну русскую причину из `score_details.reason` только после серверного результата и `onResultVisibilityChange(true)`. Оставить текущий двухсекундный lifecycle и стили табло; убрать из V3 UI серии и суммы. Для V1/V2 выбирать старое представление по `score_details.version`, а не по текущему каталогу. Предпросмотр/правила будущих попыток читать из V3 snapshot и объяснять временное окно без технических миллисекунд; старые попытки показывают их снимок.

```ts
if (details?.version === 3 && details.reason !== null) {
  return { breakdown: [{ points: input.awardedPoints, label: v3ReasonLabel(details.reason) }] };
}
```
- [ ] **Step 4: GREEN, типы, сборка и коммит.** Запустить целевые web-тесты, `pnpm --filter @hockey/web typecheck`, `pnpm --filter @hockey/web build`, `git diff --check`; коммит `feat: show single-category marksmanship results`.

### Task 5: Сквозная проверка и приёмка без публикации

**Files:**
- Modify: только файлы Tasks 1–4 при обнаруженных регрессиях; исправления делать с новым RED-тестом.

**Interfaces:** Нет новых контрактов.

- [ ] **Step 1: Проверить собранный diff.** `git diff origin/dev...HEAD --check`; просмотреть SQL на отсутствие исторических `UPDATE`, убедиться, что `GAME_CORE_VERSION` и поддерживаемые старые версии согласованы, а `TARGETS` теста равны SQL. Проверить, что изменение не касается дуэлей/обычной игры.
- [ ] **Step 2: Запустить регрессию.** `pnpm --filter @hockey/game-core build`, целевые game-core/server/web тесты, затем `pnpm typecheck` и `pnpm lint`; полный `pnpm test` — если тестовая БД доступна. Любой недоступный suite указать как gap, не как PASS.
- [ ] **Step 3: Проверить реальную локальную игру.** В браузере начать новую V3 «Меткость»: гол показывает одну причину и 1–4 очка ровно одновременно с «ГОЛ»; промах/сэйв имеют прежние модалки и 0; цель/табло соответствуют каталогу. Возобновить сохранённую V2 попытку, сверить прежний счёт/разбор. Зафиксировать URL, результаты, ширину плашки на мобильном viewport. Не использовать dev для этой проверки.
- [ ] **Step 4: Отчёт и handoff.** Сообщить точные локальные PASS/FAIL, состояние браузерной приёмки, коммиты и оставшиеся риски. Не push/merge/deploy без отдельного разрешения пользователя.
