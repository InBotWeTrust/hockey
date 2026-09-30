# Duel UI Eight Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить восемь согласованных проблем дуэльного интерфейса, бонусных игр и глобального приглашения, затем выпустить один проверенный пакет на dev и выборочно перенести только этот пакет в production.

**Architecture:** Изменения разделены на независимые серверный каталог/миграцию и клиентские UI-контракты. Состояние и лимиты остаются сервер-авторитетными; клиент только корректно отображает недоступность, очередь модалок и подавляет глобальный invite-toast на игровых маршрутах. Каждый пункт проходит отдельный RED→GREEN цикл, затем общий web/server regression и browser acceptance.

**Tech Stack:** TypeScript, React, React Router, TanStack Query, Vitest/Testing Library, Fastify/PostgreSQL migrations, pnpm.

**Spec:** Согласованный пакет из восьми пунктов в текущем чате от 2026-09-30.

## Global Constraints

- Production не получает Арсенича, сюжетный онбординг, конструктор и другие ранее исключённые dev-only изменения.
- Production собирается отдельной веткой от свежего `origin/main` только из коммитов этого плана.
- Никаких ручных правок данных; категория существующих достижений меняется forward-only миграцией.
- Бонусная попытка расходуется только после явного `НАЧАТЬ`, а переход `К игре` не показывает повторную preview-модалку.
- Глобальное приглашение подавляется только во время активной игры; само приглашение не принимается, не отклоняется и не помечается просмотренным.

## Review Focus

- Клавиатурная навигация `GlassSelect` не должна останавливаться на disabled option и не должна вызывать `onChange`.
- Один игрок может исчерпать лимит, а другой нет; причина и toast должны относиться к правильному участнику и формату.
- Переход в бонусную игру и восстановление уже активной попытки не должны повторно списывать попытку или возвращать preview.
- Invite-toast не должен мигнуть до определения игрового маршрута и должен снова работать после выхода с площадки.
- Selective production release не должен зависеть от dev-only файлов или флагов.

---

### Task 1: Перенести месячные достижения в раздел дуэлей

**Files:**
- Modify: `packages/server/src/achievements/catalog.ts`
- Create: `packages/server/db/migrations/168_move_monthly_rating_achievements_to_duels.sql`
- Test: `packages/server/test/achievements/catalog.test.ts`
- Test: migration contract test рядом с существующими achievement migration tests

**Interfaces:**
- Produces: `monthly-top-1` и `monthly-top-3` с `category = 'duel'` в новых и существующих БД.

- [ ] Написать тесты каталога и миграции; увидеть RED на `category: 'rating'`.
- [ ] Изменить seed-каталог и добавить idempotent SQL update только двух achievement id.
- [ ] Запустить targeted server tests и получить GREEN.
- [ ] Commit: `fix: move monthly rating achievements to duels`.

### Task 2: Выровнять карточку отправленного вызова

**Files:**
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/app/design-system.css`
- Test: `packages/web/src/screens/DailyScreen.test.tsx`

**Interfaces:**
- Produces: фиксированная правая колонка отмены; имя, мета и статус образуют ровные строки слева.

- [ ] Добавить DOM/layout regression для статуса и cancel control; увидеть RED.
- [ ] Перестроить grid карточки без изменения обработчиков.
- [ ] Запустить targeted test и получить GREEN.
- [ ] Commit: `fix: align outgoing duel challenge cards`.

### Task 3: Недоступные форматы в выборе вызова

**Files:**
- Modify: `packages/web/src/components/GlassSelect.tsx`
- Test: `packages/web/src/components/GlassSelect.test.tsx`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Test: `packages/web/src/screens/DailyScreen.test.tsx`

**Interfaces:**
- Produces: `GlassSelectOption.disabled?: boolean`; disabled option имеет `aria-disabled`, приглушённый вид, пропускается клавиатурой и не выбирается.

- [ ] Добавить RED-тесты mouse/keyboard disabled option.
- [ ] Реализовать минимальный disabled contract в `GlassSelect`.
- [ ] Добавить RED-тест текста `Лимит: <Формат> (...)` и отсутствия выбора.
- [ ] Передать disabled options и приглушённый label из экрана дуэлей.
- [ ] Запустить оба targeted файла и получить GREEN.
- [ ] Commit: `fix: disable exhausted duel challenge formats`.

### Task 4: Toast при тапе по исчерпанному формату поиска

**Files:**
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Test: `packages/web/src/screens/DailyScreen.test.tsx`

**Interfaces:**
- Produces: верхний `AppToast` с текстом `Месячный лимит формата «<Название>» исчерпан.` без изменения выбранных форматов.

- [ ] Написать RED-тест тапа по limit-only формату.
- [ ] Развести настоящий disabled и интерактивное `aria-disabled` состояние лимита.
- [ ] Запустить targeted test и получить GREEN.
- [ ] Commit: `fix: explain exhausted matchmaking format`.

### Task 5: Иерархия карточек в DuelChallengeModal

**Files:**
- Modify: `packages/web/src/chat/components/DuelChallengeModal.tsx`
- Test: `packages/web/src/chat/components/DuelChallengeModal.test.tsx`

**Interfaces:**
- Produces: порядок `название → параметры/3 мин → приглушённый лимитный текст` для каждого формата.

- [ ] Добавить RED-тест порядка DOM и muted styling.
- [ ] Переставить элементы, не меняя серверную доступность и действие кнопки.
- [ ] Запустить targeted test и получить GREEN.
- [ ] Commit: `fix: reorder duel challenge format details`.

### Task 6: Однократное описание бонусной игры

**Files:**
- Modify: `packages/web/src/screens/BonusGamesScreen.tsx`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.tsx`
- Modify: `packages/web/src/stores/bonusGameStore.ts` при необходимости
- Test: `packages/web/src/screens/BonusGamesScreen.test.tsx`
- Test: `packages/web/src/screens/BonusGamePlayScreen.test.tsx`
- Test: `packages/web/src/stores/bonusGameStore.test.ts` при изменении store

**Interfaces:**
- Produces: `карточка → описание → К игре → площадка с НАЧАТЬ`; preview acknowledge выполняется до навигации, но старт попытки остаётся только на `НАЧАТЬ`.

- [ ] Воспроизвести повторную preview-модалку RED-тестом перехода и восстановления.
- [ ] Перенести/добавить acknowledgement в подтверждение `К игре`, сохранив idempotency.
- [ ] Убедиться тестом, что close описания не стартует и не расходует попытку.
- [ ] Запустить targeted bonus tests и получить GREEN.
- [ ] Commit: `fix: show bonus game preview only once`.

### Task 7: Читаемый таймер обновления бонусных попыток

**Files:**
- Modify: `packages/web/src/screens/BonusGamesScreen.tsx`
- Test: `packages/web/src/screens/BonusGamesScreen.test.tsx`
- Reuse: форматирование из `packages/web/src/components/duel/DuelLimitsSection.tsx` либо общий helper при оправданном переиспользовании.

**Interfaces:**
- Produces: `До обновления: 2 ч 1 мин 46 сек`; при периодах больше суток — `4 д 2 ч 1 мин`.

- [ ] Добавить RED-тесты часов/минут/секунд, дней и обязательного двоеточия.
- [ ] Реализовать единое человекочитаемое форматирование без изменения server timestamp.
- [ ] Запустить targeted test и получить GREEN.
- [ ] Commit: `fix: format bonus allowance countdown`.

### Task 8: Не показывать дуэльный invite-toast во время игры

**Files:**
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/components/DuelInviteToast.tsx` только если route guard удобнее инкапсулировать там
- Test: `packages/web/src/app/App.test.tsx` или `packages/web/src/components/DuelInviteToast.test.tsx`

**Interfaces:**
- Produces: единый route predicate для daily, training play, bonus play, amateur duel и tournament gameplay; неигровые экраны продолжают монтировать toast.

- [ ] Добавить table-driven RED-тест всех игровых и контрольных неигровых маршрутов.
- [ ] Реализовать минимальный route guard без изменения websocket/event semantics.
- [ ] Проверить, что после выхода приглашение снова может показываться, если событие ещё актуально.
- [ ] Запустить targeted test и получить GREEN.
- [ ] Commit: `fix: suppress duel invites during gameplay`.

### Task 9: Общая проверка и релизы

**Files:**
- Review: весь diff от base `origin/dev`.
- Release: PR в `dev`, затем отдельная selective ветка/PR от свежего `origin/main`.

**Interfaces:**
- Consumes: коммиты Tasks 1–8.
- Produces: подтверждённые dev SHA и production SHA без ранее исключённых функций.

- [ ] Запустить targeted tests, web/server typecheck, lint и релевантные package suites; зафиксировать baseline failures отдельно.
- [ ] Провести browser acceptance ключевых визуальных состояний на mobile width.
- [ ] Получить независимый review всего diff и исправить Critical/Important через RED→GREEN.
- [ ] Push task branch, PR/merge в `dev`, дождаться deploy и проверить exact runtime SHA/health.
- [ ] Создать свежую production ветку от `origin/main`, перенести только коммиты Tasks 1–8, проверить diff на исключения.
- [ ] PR/merge в `main`, дождаться production deploy, миграций, exact SHA и smoke; отдельно сообщить границы фактической browser acceptance.
