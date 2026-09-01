# Локальная QA-проверка автоматического жизненного цикла турниров

Дата проверки: 1 сентября 2026 года.

Итог browser QA: **PASS — 17 экранов, 0 продуктовых FAIL**. Проверены H2H, дневной зачёт, Классика, недостаточный состав, lazy recovery после перезапуска и единственное ручное действие администратора перед регулярным сезоном.

## Контур

- Web: `http://127.0.0.1:5189`
- Server API: `http://127.0.0.1:3310`
- PostgreSQL: `hockey_task9_qa_20260901`
- Redis: локальный Redis, database `9`
- Игрок: dev-код `TASK9-PLAYER`
- Администратор: dev-код `TASK9-ADMIN`
- Viewport: `430 × 932`
- Данные: отдельные синтетические пользователи и турниры с префиксом `QA`; прод и dev не затрагивались.

Игроковые URL ниже используют обычный маршрут каталога:

```text
/?view=amateur&section=tournaments&tournament=<tournament-id>&tab=<tab>
```

Админские проверки выполнялись на `/admin`. UUID принадлежат только этой локальной базе.

## Browser checklist

| #   | Роль          | URL / сценарий                                                                                                         | Expected                                                                                       | Actual                                                                               | Результат | Screenshot                                                                                                                                            |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=7c00d37b-650f-4674-9bf1-d56ea51d5f78&tab=schedule` | Первый list/detail read после пропущенного дедлайна восстанавливает состояние в `scheduling`   | После перезапуска и первого открытия каталога показано «Готовится расписание»        | PASS      | [01-player-lazy-recovery-scheduling.png](screenshots/tournament-automatic-lifecycle-local/01-player-lazy-recovery-scheduling.png)                     |
| 2   | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=0b686d5c-91d4-4697-b351-dacbd44145a1&tab=overview` | В открытом окне можно подать заявку; виден срок закрытия                                       | Экран показывает открытую регистрацию и корректный дедлайн                           | PASS      | [02-player-h2h-registration-open.png](screenshots/tournament-automatic-lifecycle-local/02-player-h2h-registration-open.png)                           |
| 3   | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=7e6b7455-3886-4b79-b7bb-78e67daa19ac&tab=schedule` | H2H-регулярка создаёт личные дуэли для всех пар                                                | Показаны 6 уникальных дуэлей для 4 участников                                        | PASS      | [03-player-h2h-regular-duels.png](screenshots/tournament-automatic-lifecycle-local/03-player-h2h-regular-duels.png)                                   |
| 4   | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=55e36004-ff78-4b75-8dc8-a8b2b5c65b07&tab=bracket`  | Автоматический playoff показывает игры, счёт серии и технический результат                     | В сетке видны счёт `1:0` и техническая победа в игре серии                           | PASS      | [04-player-h2h-playoff-series-score.png](screenshots/tournament-automatic-lifecycle-local/04-player-h2h-playoff-series-score.png)                     |
| 5   | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=57258b2a-1180-446b-b0ff-499db247f1cc&tab=bracket`  | После финала видны чемпион и итоговое место                                                    | Турнир завершён, игрок показан чемпионом и на 1-м месте                              | PASS      | [05-player-h2h-tournament-winner.png](screenshots/tournament-automatic-lifecycle-local/05-player-h2h-tournament-winner.png)                           |
| 6   | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=11fa05fa-bf66-451a-8417-e8607de24647&tab=schedule` | Дневной зачёт не создаёт ручных пар и показывает результат закрытого дня                       | Показан результат игрового дня; пар/дуэлей регулярки нет                             | PASS      | [06-player-daily-result-no-pairs.png](screenshots/tournament-automatic-lifecycle-local/06-player-daily-result-no-pairs.png)                           |
| 7   | Игрок         | `http://127.0.0.1:5189/?view=daily&section=tournaments&tournament=11fa05fa-bf66-451a-8417-e8607de24647&tab=schedule`   | Просроченная tournament-ссылка не должна открыть обычную ежедневную игру                       | Server game-context блокирует переход; обычная daily-сессия не открылась             | PASS      | [07-player-daily-stale-url-guard.png](screenshots/tournament-automatic-lifecycle-local/07-player-daily-stale-url-guard.png)                           |
| 8   | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=1ffbf7d3-dc4e-4a84-849d-917cb681e8d3&tab=bracket`  | После дневной регулярки playoff автоматически создаёт личные дуэли                             | В сетке показаны playoff-дуэли                                                       | PASS      | [08-player-daily-playoff-duels.png](screenshots/tournament-automatic-lifecycle-local/08-player-daily-playoff-duels.png)                               |
| 9   | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=dd830ca2-ed3d-4770-92be-ee7845286a7d&tab=schedule` | Classic-регулярка показывает результат отдельного игрового дня                                 | Результат Classic-дня отображается в календаре                                       | PASS      | [09-player-classic-day-result.png](screenshots/tournament-automatic-lifecycle-local/09-player-classic-day-result.png)                                 |
| 10  | Игрок         | `http://127.0.0.1:5189/?view=classic&section=tournaments&tournament=dd830ca2-ed3d-4770-92be-ee7845286a7d&tab=schedule` | Кнопка ведёт в отдельную турнирную Classic-игру, а не в daily                                  | Открыт турнирный Classic-экран с контекстом сезона                                   | PASS      | [10-player-classic-separate-game.png](screenshots/tournament-automatic-lifecycle-local/10-player-classic-separate-game.png)                           |
| 11  | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=5f771cb2-6b1a-43e0-b633-55610556b38a&tab=bracket`  | После Classic-регулярки playoff автоматически создаёт личные дуэли                             | В сетке показаны playoff-дуэли                                                       | PASS      | [11-player-classic-playoff-duels.png](screenshots/tournament-automatic-lifecycle-local/11-player-classic-playoff-duels.png)                           |
| 12  | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=13d58c62-3ae9-480b-bf47-98d7760fae58&tab=overview` | При 3 подтверждённых из 4 турнир не уменьшает playoff и не создаёт календарь                   | Показано «Набор продлён» без игрового календаря                                      | PASS      | [12-player-daily-blocked-roster.png](screenshots/tournament-automatic-lifecycle-local/12-player-daily-blocked-roster.png)                             |
| 13  | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=13d58c62-3ae9-480b-bf47-98d7760fae58&tab=overview` | Игрок видит точную причину блокировки `3 из 4`                                                 | На экране явно показано `3 из 4`; размер playoff остаётся `4`                        | PASS      | [13-player-daily-blocked-3-of-4.png](screenshots/tournament-automatic-lifecycle-local/13-player-daily-blocked-3-of-4.png)                             |
| 14  | Игрок         | `http://127.0.0.1:5189/?view=amateur&section=tournaments&tournament=9b5c62c0-f4a6-4d5a-8c58-85b0979e40bb&tab=schedule` | Заблокированный Classic не создаёт ручных пар                                                  | Показано «Набор продлён», пар/дуэлей регулярки нет                                   | PASS      | [14-player-classic-blocked-no-pairs.png](screenshots/tournament-automatic-lifecycle-local/14-player-classic-blocked-no-pairs.png)                     |
| 15  | Администратор | `http://127.0.0.1:5189/admin` · `QA H2H · Календарь готов`                                                             | После автоматической генерации расписания остаётся одно ручное действие — публикация регулярки | Видны пояснение и единственный CTA «Начать регулярный сезон»                         | PASS      | [15-admin-h2h-calendar-ready-manual-publish.png](screenshots/tournament-automatic-lifecycle-local/15-admin-h2h-calendar-ready-manual-publish.png)     |
| 16  | Администратор | `http://127.0.0.1:5189/admin` · `QA Daily · Недостаточный состав`                                                      | Админ получает понятное внимание без автоматического изменения playoffSize                     | Показано «Подтверждено 3 из 4» и варианты действий; playoffSize остаётся `4`         | PASS      | [16-admin-daily-insufficient-roster-attention.png](screenshots/tournament-automatic-lifecycle-local/16-admin-daily-insufficient-roster-attention.png) |
| 17  | Администратор | `http://127.0.0.1:5189/admin` · новый `QA H2H · Создано через мастер`                                                  | После «Сохранить и опубликовать» мастер закрывается в карточку регистрации                     | Модалка закрылась; показаны «Турнир опубликован», «Идёт регистрация» и срок закрытия | PASS      | [17-admin-h2h-wizard-published-registration.png](screenshots/tournament-automatic-lifecycle-local/17-admin-h2h-wizard-published-registration.png)     |

## Недостаточный состав и повторные reconcile

В синтетическом integration-тесте для каждого источника (`head_to_head`, `daily_aggregate`, `classic`) отдельно проверено:

- статус остаётся `registration_blocked`;
- `playoffSize` остаётся `4`, когда подтверждены только 3 участника;
- календарь, раунды и fixtures не создаются;
- повторный reconcile не создаёт второе admin-уведомление;
- успешные повторные reconcile не дублируют расписание, серии, награды и уведомления.

Browser-экран подтверждает пользовательскую и админскую подачу этих состояний. Число доставок и отсутствие дублей проверяются на уровне БД integration-тестом, а не по визуальному интерфейсу.

## Перезапуск и lazy recovery

1. В отдельной QA-базе был подготовлен опубликованный автоматический H2H-турнир с 4 подтверждёнными участниками и истёкшим дедлайном регистрации.
2. Server был запущен заново без cron-процесса и без ручного lifecycle-команды.
3. Первый запрос каталога игроком (`GET /api/tournaments`) выполнил best-effort lazy reconcile.
4. Повторное открытие расписания показало `Готовится расписание`; повторный read не создал дублей.

Результат: **PASS**. Состояние восстанавливается чтением после простоя/перезапуска.

## Примечания к локальным данным

- Для browser QA использовались только синтетические пользователи и турниры в отдельной базе.
- В Classic-сценарии пустая просроченная сессия была корректно закрыта реальным background finalizer; локальная фикстура результата была приведена в соответствие этому контракту. Продуктовый код не менялся.
- Нативные `date`/`datetime-local` поля мастера не передают React-событие через текущий browser-control. Чтобы закончить именно UI-публикацию, даты были точечно записаны только в созданный локальный QA-черновик; затем страница была перезагружена, публикация выполнена кнопкой интерфейса и подтверждена экраном №17.

## Команды воспроизведения

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/tournament/synthetic-seasons.integration.test.ts
pnpm --filter @hockey/server test
pnpm --filter @hockey/web test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

Интеграционные тесты требуют отдельные `TEST_DATABASE_URL` и `TEST_REDIS_URL`. Файлы, которые сбрасывают общую тестовую схему, нужно запускать последовательно: параллельный запуск нескольких таких файлов создаёт инфраструктурную гонку, а не продуктовый сигнал.

## Итоги автоматизированных проверок

Для изоляции использовались PostgreSQL `hockey_task9_verify_20260901` и Redis database `10`.

| Проверка                                | Фактический результат                                                                                                | Статус |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| `pnpm --filter @hockey/game-core build` | Сборка завершилась с exit code `0`                                                                                   | PASS   |
| Focused server integration              | `1` файл, `8` тестов пройдены; известный `MaxListenersExceededWarning` для `WebSocketServer` не повлиял на результат | PASS   |
| Maintenance server tests                | `5` файлов, `37` тестов пройдены                                                                                     | PASS   |
| Полный `@hockey/server`                 | `235` suites / `918` тестов пройдены, exit code `0`                                                                  | PASS   |
| Полный `@hockey/web`                    | Exit code `0`: основной прогон `96` файлов / `801` тест, затем `94/94` сценария `DailyScreen`                        | PASS   |
| `pnpm typecheck`                        | Exit code `0`                                                                                                        | PASS   |
| `pnpm lint`                             | Exit code `0`                                                                                                        | PASS   |
| `pnpm build`                            | Exit code `0`                                                                                                        | PASS   |

В server-suite остались известные предупреждения `MaxListenersExceededWarning`, `pg` deprecation и ожидаемые логи negative-path сценариев auth/storage/realtime. В web-suite остались известные предупреждения Router future flags, React `act`, duplicate key и jsdom canvas/Pixi. Все перечисленные прогоны завершились с exit code `0`.
