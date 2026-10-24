# Производительность приложения: аудит и план реализации

> **Для исполнителя:** выполнять через `superpowers:executing-plans` по самостоятельным задачам с RED → исправление → GREEN. Делегирование в этой сессии не разрешено. Пользователь 24 октября согласовал реализацию всего плана и добавление сохранённых счётчиков. Работа локальная; новый релиз не разрешён.

**Goal:** ускорить открытие профилей, первый вход и переходы между экранами, сохранив актуальность результатов, наград, балансов, сообщений и приглашений.

**Architecture:** облегчить обязательные данные и код первого экрана; отделить чтение профиля от обновления прогресса; готовить только нужные изображения; использовать ограниченный кеш и адресное обновление данных. Не хранить все экраны и игровые сцены постоянно смонтированными. Предварительные расчёты и новые индексы добавлять только после проверки плана SQL и измерения на изолированной базе.

**Tech Stack:** React 18, React Router, TanStack Query 5, Zustand, Vite 5, Workbox, Pixi 8, Fastify, PostgreSQL, Redis, Nginx/Caddy.

**Spec:** требования пользователя в следующем разделе этого документа; действующие AGENTS.md и инструкции web/server/CI читаются перед реализацией соответствующего этапа.

## Требования пользователя и границы

- Сначала завершить уже разрешённую загрузку исправлений переходов на dev и production.
- Проверить скорость всего приложения: загрузка, переходы, изображения, кеши, открытие чужих профилей, вычисления на сервере.
- Подготовить план: что исправлять, в каком порядке, какой результат это даст.
- Аудит завершён; реализация разрешена последующим сообщением пользователя. Новые push/merge/deploy пока не выполнять.
- В чужом профиле показывать только строку «Задания · выполнено/всего, уровни · пройдено/всего»: без изображений, названий и модалок отдельных достижений. Собственный профиль сохраняет карточки.
- Готовые пользовательские счётчики хранить в PostgreSQL и обновлять атомарно при изменении завершённости; итоги каталога хранить отдельно. Публичный GET только читает эти значения.
- Переделка бара в карточки не входит в оптимизацию; текущий дизайн карты и панорам сохраняется.

## Global Constraints

- Каждая реализационная задача начинается от свежего `origin/dev` в отдельной короткой task-ветке; чужие изменения сохраняются. Production не является исходной веткой разработки без отдельного согласования hotfix.
- Публикация и изменения production требуют соответствующего разрешения пользователя; этот план его не заменяет.
- Измерения production только read-only. Нагрузочные тесты, тестовые пользователи, SQL-миграции и backfill выполняются сначала на изолированной среде.
- Сервер остаётся источником истины для игры, доступов, платежей и наград. Кеш не подтверждает право на действие.
- Нельзя менять баланс, длительности периодов, игровое время или частоту авторитетного fight runtime ради ускорения интерфейса.
- Профильный кеш изолирован по пользователю и сессии; общие ответы не содержат отношение текущего зрителя к игроку. Logout очищает приватные данные.
- Версионированные изображения не заменяются по старому URL. Новая версия клиента совместима с прежним API во время обновления PWA.
- Пользовательские тексты остаются русскими; идентификаторы, комментарии и коммиты английскими. GLM запрещён.

## Review Focus

1. Запоздалый ответ после смены игрока/аккаунта не показывает чужие данные и не откатывает свежий результат.
2. Кешированный профиль не делает доступной закрытую дуэль/награду: действие повторно проверяется сервером.
3. Крупная история наград, сообщений и активностей не превращает один просмотр в неограниченный SQL/DOM/декодирование.
4. Слабая сеть, offline, возврат из фона и обновление PWA сохраняют пригодный экран и допускают повтор запроса без зависания.
5. Полночь, смена часового пояса/города/освещения и холодный вход сохраняют правильные серии дней, сцену и текущий онбординг.

---

## 1. Проверенная база и ограничения доказательств

Аудит: 24 октября 2026, рабочее дерево `f450b9b4fbc8a22411e5c4a79c145bd185257df5`. Его содержимое совпадает с production merge `3afbc3cb5346e5219d70cc4ac6d733ecfe5341d7` (`git diff origin/main --exit-code` завершился успешно).

| Контур | Проверенная версия | Результат |
| --- | --- | --- |
| dev | `86b5102a8e15bd00b782d3e8985ce018f17d0cd5` | Deploy `40033775604` success; smoke и frontend smoke прошли, миграции актуальны |
| production | `3afbc3cb5346e5219d70cc4ac6d733ecfe5341d7` | Deploy `40037664961` success; health DB/Redis и frontend smoke прошли в логе релиза |
| Полный CI кандидата | `40033787223` | Не зелёный. Первый запуск: серверный тест парной socket-доставки. Повтор: `WeeklyChallengeScreen.test.tsx`, `filters future, active and completed personal challenges with counts`, не найден текст «Следующая неделя». Причину второго падения нельзя объявлять baseline без отдельной проверки |

Релизы: https://github.com/InBotWeTrust/hockey/actions/runs/40033775604 и https://github.com/InBotWeTrust/hockey/actions/runs/40037664961 . CI: https://github.com/InBotWeTrust/hockey/actions/runs/40033787223 . В dev и main есть намеренные отличия экспериментальных функций; полный merge dev → main не является частью плана.

### Что выполнено

- Прослежены пути старта, gate онбординга, корневой экран/карта, общие меню и переходы.
- Прослежены оба публичных профиля, `/me`, достижения, серии дней, трофеи, социальные данные и профильные query keys.
- Проверены карта/панорамы, стратегия выбора разрешения, декодирование и удержание изображений, Pixi lifecycle, погодные эффекты.
- Проверены чаты: страницы сообщений, повторный вход, обновления через WS, read/unread, список чатов и его SQL.
- Проверены общая навигационная активность, polling приглашений/игр, каталог бонусных игр, профиль/инвентарь, кеш погоды, HTTP и service worker.
- Выполнена диагностическая production-mode Vite-сборка с manifest/source maps для разбора импортов; 3515 обработанных модулей, сборка успешна. Это диагностическая сборка из production-эквивалентного дерева, не опубликованный бинарник с тем же хешем.
- Проверены размеры и геометрия 1243 изображений через файловую статистику и Sharp.

### Что не измерено

Production в браузере открывается на `https://ultimatehockey.ru/login`; доступной авторизованной сессии нет. Прямые curl/SSH из текущей среды не достигают сервера. Поэтому нет замеров реального времени `/users/:id`, SQL `EXPLAIN`, ожидания пула, CPU, памяти на устройстве и времени профиля авторизованного игрока. Ошибка прямого соединения не доказывает недоступность production пользователям. Локальная QA-страница на 5187 также недоступна на момент проверки.

Ни один вывод ниже не подменяет эти замеры. Классы доказательств: **A** — подтверждённый код/сборка/размер файла; **B** — подтверждённый механизм, но величина влияния требует runtime-профиля; **C** — гипотеза, менять код можно только после проверки.

## 2. Измеримые размеры

| Объект | Текущее значение | Значение для пользователя |
| --- | --- | --- |
| Начальный JS | 1002,32 kB; gzip 327,36 kB | Загрузка и выполнение игрового кода даже до открытия игры |
| Начальные JS + CSS | 1 491 750 байт; gzip 406 256 байт | Это только первоначальные файлы, без изображений, API и последующих lazy chunks |
| `DailyScreen` chunk | 283,52 kB; gzip 84,89 kB | Общая панель игр тянет этот модуль за пределами экрана игры |
| PWA precache | 145 файлов, 3644,43 KiB | Не все нужны первому экрану; это отдельная фоновая загрузка установки/обновления, а не весь blocking payload |
| Актуальная карта 6144×2053 | 1739–1876 KiB для 4 освещений | Примерно 48,12 MiB распакованных RGBA на кадр; не измерение фактической памяти браузера |
| Карта 4096×1369 | 1039–1113 KiB | Примерно 21,39 MiB RGBA: на 56% меньше пиксельной памяти, чем 6144 |
| Основные панорамы разделов | квартира 109, стадион 120, магазин 203, двор 203–223 KiB | Здесь уже используются относительно компактные WebP |
| Все изображения в public/результате сборки | 1243 файла, 248,99 MiB | Не скачиваются все при входе. Общий размер каталога не равен загрузке приложения |

В entry sourcemap обнаружены 232 модуля Pixi и `PlayView.tsx`. Это доказательство попадания рендера игры в начальный JS; размеры исходников из source map не выдаются за размер переданных байт.

## 3. Находки и ожидаемый эффект

### F1. Чтение чужого профиля запускает обновление прогресса — P0, A/B

`packages/server/src/chat/service.ts:getUserPublicProfile` → `profile/summary.ts:buildProfileProgress` → `achievements/service.ts:grantStatAchievements` и `fetchAchievementCatalogueForUser`.

Даже `?summary=true` вызывает проверку оплаченной покупки, выдачу статистических достижений, открытие первых этапов, `observeFanAchievement` с UPSERT в `achievement_progress` и дальнейшей обработкой этапа. На публичном просмотре также считается количество невыданных наград, которое DTO публичного профиля не использует. Это реальные лишние обязанности пути чтения; точное время каждого запроса не измерено.

**Исправление:** отдельная функция чтения публичного прогресса без observers/grants, с готовыми сохранёнными счётчиками вместо каталога достижений; инициализацию и выдачу привязать к событиям владельца. Перед удалением lazy-repair обязательно описать недостающие события, провести идемпотентную сверку исторических данных в тестовой среде. `lastSeen` — отдельный best-effort hook после ответа, его не считать частью этого запрета.

**Эффект:** просмотр другого игрока перестаёт выполнять операции выдачи/изменения прогресса и ждать их цепочку; уменьшается нагрузка БД и риск конкуренции за записи.

### F2. Серия дней одиночного профиля использует общий CTE — P0, A/B

`profile/summary.ts:fetchPlayStreakStats` подставляет `ACTIVITY_STREAK_CTES`; в `profile/activityStreak.ts` исходные shot sessions не ограничены игроком. Там же уже существует `USER_ACTIVITY_STREAK_CTES`. Фильтр пользователя стоит в конце общего запроса, а не у источника активности. Это структура SQL; без плана PostgreSQL нельзя утверждать точное число реально прочитанных строк.

**Исправление:** использовать user-scoped форму и ограничить anchors тем же пользователем; проверить timezone, текущую/лучшую серию, полночь. Сравнить планы на большой истории. Индекс `(user_id, mode, created_at desc)` уже предусмотрен migration 014; не добавлять его дубликат вслепую. Глобальный CTE остаётся допустимым для глобального рейтинга.

**Эффект:** сложность одиночного профиля должна зависеть от истории конкретного игрока, а не от роста всей игры.

### F3. `/me` тяжёлый и используется там, где достаточно минимума — P0, A/B

`routes/me.ts:getMe` сначала ждёт `buildProfileProgress`, затем запрашивает сводку и все подробности трофеев, включая расчёт progress по каждой завершённой неделе. `getGameSettings` вызывается как минимум в трёх местах этой цепочки и каждый раз читает настройки из БД. В `SectionsScreen` собственный `['profile','sections']` повторяет `/me` с поздравлениями, отдельно от уже загруженного `['profile']`.

**Исправление:** лёгкий совместимый `/me?summary=true` для старта/карты/проверки уровня, подробности наград по открытию; отдельные поздравления или расширение уже загруженного summary. Общие настройки передавать внутри одного запроса, не вводя длительный кеш, который задержит изменение правил. Сохранить прежний полный контракт для старых клиентов.

**Эффект:** вход и карта не ждут исторические награды, повторные запросы не запускают один и тот же расчёт несколько раз.

### F4. Lazy loading обходится статическими зависимостями — P1, A/B

`App` статически импортирует `OnboardingGate` → `OnboardingFlow`/`BeginnerStoryFlow` → `TutorialShotStep` → `PlayView` → Pixi. `city/GlobalGames.tsx` после получения daily state монтирует lazy `GameHub` из большого `DailyScreen` на общих экранах. Поэтому наличие `lazy()` у маршрута само по себе не откладывает игровые зависимости до игры.

**Исправление:** лёгкий gate и lazy отдельные story/tutorial тела; выделить общий GameHub в самостоятельный модуль, который не импортирует игровые сцены и компоненты из `DailyScreen`. Отдельно проверить цикл `SocialProfile` ↔ `UserProfileSheet` и импорт трофейной модалки из `ProfileScreen`.

**Эффект:** быстрее первый интерактивный экран, меньше parse/execute и фоновых загрузок на слабых телефонах.

### F5. Startup gate ждёт прежние арены независимо от назначения — P1, A/B

`app/playerStartup.ts` на входе в `/` ждёт `/me`, daily, training, `DailyScreen` и `preloadStartupArtwork`. Для других закрытых маршрутов всё равно ждёт профиль и artwork арены. `startupArtworkUrls` выбирает прежние arena/cube/ice assets, а не текущую карту или открываемую панораму.

**Исправление:** подготовка по destination: gate проверяет обязательный онбординг/идентификацию, а путь к карте готовит её актуальный фон. Тренировка и ежедневная игра загружаются при входе в них; их ошибки не блокируют открытие профиля/карты. Состояние онбординга и новое достижение уровня нельзя пропускать ради ускорения.

**Эффект:** медленная тренировочная API/ненужная картинка перестаёт задерживать обычный вход.

### F6. Карта выбирает 6144 только по DPR — P1, A/B

`city/lighting.ts:cityImage` выбирает 6144 при `devicePixelRatio > 1.5`, без размеров реально рисуемой сцены. Cache карты уже ограничен двумя изображениями; последние правки уже держат декодированный текущий фон и возвращают тренировку/ежедневную игру прямо на карту. Не предлагать это как отсутствующую функциональность.

**Исправление:** обоснованный выбор разрешения по viewport/world size, DPR и доступным сигналам устройства; сравнить 4096/6144 на телефоне. Текущую и соседнюю фазу удерживать в ограниченном кеше. Не начинать загрузку всех четырёх освещений.

**Эффект:** меньше сетевого объёма, декодирования и пиков памяти. Численное снижение пикселей подтверждено; визуальная приемлемость меньшего варианта требует проверки.

### F7. Фоновая подготовка изображений слишком широкая — P1, A/B

`app/artworkCache.ts`: `preloadCriticalArtwork` содержит 15 картинок разных разделов, запускается при появлении user; общий `retainedArtwork` не имеет вытеснения. Профиль добавляет изображения всех достижений, магазин — все иконки вкладок и товары выбранной категории. Сам preload низкоприоритетный и не является прямым `await` блокером, но конкуренция сети/памяти требует измерения.

**Исправление:** текущий экран и ближайшее вероятное действие первыми; bounded LRU удержания, idle-подготовка второстепенных картинок, сохранение лимита для карты; отмена ещё не начавшихся очередей на слабой сети/при игре/hidden. Не удалять полезное кеширование.

**Эффект:** меньше фоновых загрузок и роста памяти при длинной сессии.

### F8. Публичные профили имеют разные тяжёлые пути — P0/P1, A/B

Sheet уже использует summary и отложенные трофеи с октября; эта оптимизация существует. Полноэкранный `UserProfileScreen` запрашивает full target profile и full собственный профиль, хотя от собственного нужен только уровень. Оба формата используют один `userKeys.profile(id)`, не различая full/summary. Sheet до ответа рисует «Загрузка…», хотя имя/аватар уже есть у sender. Bio отдельно запрашивается после появления паспорта и не имеет своего staleTime. Public profile cache свежий 60 секунд; нельзя заявлять, что запрос происходит буквально при каждом быстром повторном открытии.

**Исправление:** общий summary contract/hook, минимальные данные владельца из общего профиля; full и summary не перезаписывают друг друга; сразу показать известное имя/аватар, остальное догружается. Полная ошибка и retry доступны. Передавать `AbortSignal`, защищать поздний ответ при смене ID. Bio включить в summary и использовать как initialData вместо повторного запроса.

**Эффект:** видимый профиль появляется сразу, полное открытие не ждёт лишних запросов; повторный просмотр пользуется кешем и корректно обновляется после действий.

### F9. Подробности трофеев растут вместе с историей — P1, A/B

`profile/summary.ts:fetchTrophyDetails`: для каждой завершённой недели запускается `fetchWeeklyChallengeProgress` внутри `Promise.all`. Возрастают число запросов и конкуренция за пул; в `/me` этот путь выполняется всегда.

**Исправление:** убрать из обязательного ответа; выдавать историю по категории с пагинацией, а progress архивных задач брать из сохранённого результата или пакетного расчёта. Сначала bulk/query plan, отдельное сохранение snapshot только если оно необходимо. Старый контракт сохраняется во время миграции клиентов.

**Эффект:** сотни старых наград не замедляют текущий паспорт и не создают всплеск SQL.

### F10. Чат повторно обновляет историю и списки — P1, A/B

`ChatRoomScreen`: `useInfiniteQuery` со `staleTime: Infinity`, но `refetchOnMount:'always'` и без `maxPages`; сообщения всех загруженных страниц flatten/sort/render. При новых данных эффект `markRead` вызывает POST, а затем инвалидирует list/unread. `useChatSocket` также обновляет эти ключи на событиях. Постраничная выдача и WS patches уже есть; это не отсутствие кеша вообще.

**Исправление:** повторный вход показывает cache сразу и синхронизирует хвост `after`; reconnect/edit/delete пересверяет нужный диапазон. Read watermark меняется только после нового реально прочитанного сообщения. Обновления списка/unread объединяются, не теряя промежуточные значения. Длинная история отображается окном; виртуализацию добавлять вместе с фиксацией якоря, поиска/goto, изображений и reverse pagination.

**Эффект:** повторный чат не перекачивает всю пролистанную историю; большие диалоги меньше нагружают сеть и DOM.

### F11. Есть несколько независимых каналов polling — P1/P2, A/B

Навигация: дуэли 15 с, турниры 30 с, unread 30 с. Бар: приглашения raw interval 3 с, активные entries 5 с. Доступность дуэли в профиле 15 с. Одинаковые query keys уже переиспользуются, поэтому число observers нельзя просто считать числом одновременных сетевых запросов.

**Исправление:** измерить реальную сеть и объединить владение общими фоновыми данными; WS + редкая страховочная сверка, hidden/offline pause, отсутствие накладывающихся raw async interval. Не менять активную игровую синхронизацию вслепую.

**Эффект:** меньше бесполезных запросов и расхода батареи при сохранении уведомлений.

### F12. HTTP/PWA кеш существует; проблема не сводится к его отсутствию — A/B

Nginx уже даёт assets immutable, изображениям 30 дней; Caddy включает gzip/zstd; Workbox сохраняет запрошенные изображения CacheFirst, максимум 500; API не следует переводить в общий CacheFirst. В диагностической сборке precache включает 145 JS/CSS/HTML, в том числе ленивые разделы. `CacheFirst` не устраняет parse/decode/GPU upload/remount и не гарантирует вечное хранение на iOS.

**Исправление:** отделить startup-critical precache от редко используемого кода, измерить установку/обновление отдельно от старта; редкие chunks кешировать по использованию, сохранить восстановление после release и корректный update prompt. Все изменяемые картинки получают версию URL; не очищать кеш при обычном переходе.

**Эффект:** обновление/установка меньше конкурируют с первым экраном, кеш не показывает старую графику по неизменному URL.

### F13. Рендер и фоновые процессы: проверять приборами, не угадывать — B/C

PixiStage ждёт 14 общих sprites до ready, включая оба хвата/состояния игрока и дворника; default resolution cap 3. Он освобождает Application при unmount. WeatherOverlay уже ограничивает DPR 1.5, частицы, FPS около 30 и останавливается при hidden/reduced motion; CityTraffic тоже приостанавливается. Полноэкранные стекло/погода/двойной фон могут повышать GPU cost, но падение FPS не измерено. Освещение карты/двора проверяется каждую секунду.

На сервере fight runtime имеет tick 10 мс и recovery scanner 1 с; фоновые турниры и push имеют свои циклы. Эти интервалы не являются доказательством бага. БД создаётся обычным `pg.Pool`; рост пула без измерения waitingCount может ухудшить работу PostgreSQL.

**Исправление:** CPU/GPU/heap profiles, выбор sprite-набора под сцену и хват, отделение мелких часов от большого дерева React, scheduler смены освещения по ближайшему событию; проверка cleanup после 30 переходов. Изменение качества рендера только после визуальной проверки. Для сервера измерять duration/jobs/overlap, event-loop lag и pool wait; batch/лимиты корректировать при доказанной конкуренции.

**Эффект:** более ровная анимация и ниже расход памяти/батареи. Конкретный прирост FPS пока не заявляется.

### F14. Вторичные SQL/медиа/рейтинги — B/C

Список чатов перед чтением делает ensure и lazy insert memberships, затем lateral counts сообщений/участников. Рейтинг серии дней считает глобальную активность, страница и место зрителя идут отдельными запросами. Аватарки/вложения проходят отдельный media endpoint с private cache и внешним object storage; маленький UI сам по себе не доказывает передачу маленького файла.

**Исправление:** планы SQL и замеры по этим путям; создание membership вынести из частого чтения только с сохранением системных каналов; вычисление рейтинга переиспользовать внутри одного ответа. Для медиа проверить реальный выбранный размер — thumbnail-пайплайн добавлять только для подтверждённых тяжёлых оригиналов. Удаление неиспользуемых PNG уменьшит deploy image, но не ускорит экран, если он их и так не запрашивает.

### Что уже работает и сохраняется

- Hourly weather: frontend `staleTime/refetchInterval` 60 минут, без фонового polling; backend общий кеш по координатам со свежестью 60 минут, fallback и retry cooldown. Не предлагать повторную реализацию «раз в час».
- Lazy routes, Query cache, dedup refresh токена, image CacheFirst, HTTP compression/cache, thumbnails и paginated chat уже существуют.
- Публичный summary и deferred trophy modal уже существуют в sheet; исправлять оставшиеся тяжёлые пути.
- Последние исправления прямого выхода из тренировок/ежедневной игры и кеширования фона карты уже выпущены; не откатывать их при оптимизации.

## 4. Целевые критерии, а не обещанные результаты

Сначала фиксируется baseline на одном SHA и одинаковых данных. Предлагаемые условия: midrange Android 4–6 GB, iPhone Safari/PWA, 390×844; отдельно desktop. Сетевая лаборатория: 10 Mbps down / 1 Mbps up / 150 ms RTT; CPU slowdown отдельно подписывается как синтетический, а не как физический телефон. Cold cache, warm cache и worker-update проверяются раздельно.

| Метрика | Предлагаемая цель | Как доказать |
| --- | --- | --- |
| Известное имя/аватар чужого игрока | отображаются в первом рендере sheet; ориентир до 100 ms после тапа | trace tap → identity, минимум 30 повторов |
| Полный summary холодного профиля | UI p95 до 1 s в согласованном сетевом профиле; server p95 до 500 ms без overload | API trace + SQL phases, не секундомер по spinner |
| Повторный профиль в пределах fresh cache | без blocking profile запроса; UI p95 до 200 ms | network + render, смена пользователей и возврат |
| Тёплый переход между обычными экранами | пригодный экран p95 до 200 ms, без чужого/прежнего фона | trace + filmstrip/frame assertions |
| Холодный запуск | LCP p75 до 2.5 s, INP p75 до 200 ms | лаборатория + затем реальные пользователи; API отдельно |
| Начальный JS | gzip до 220 KiB вместо 327,36 KiB | manifest/import graph, при сохранении функциональности |
| Начальные JS+CSS | gzip до 280 KiB вместо примерно 397 KiB | скрипт бюджета, не включает API/карту |
| Длинный чат | число смонтированных сообщений ограничено окном, нет полного refetch старых страниц при простом re-open | 2000 seeded messages; goto/edit/delete/scroll tests |
| Память/таймеры | после 30 циклов map→screen→map нет монотонного роста listeners/scenes/retained images | heap snapshots и счётчики cleanup |
| Чтение публичного профиля | ноль DML в progress/grant ветке | query recorder на integration suite; lastSeen hook отдельно |

Если baseline не позволяет достичь конкретной цифры без потери качества/функций, сначала уточнить бюджет по замерам. «Всё летает» принимается по этим сценариям, а не по одному Lighthouse score.

## 5. План реализации самостоятельными изменениями

Для каждого этапа: регрессия → наблюдаемый RED → минимальная правка → GREEN → проверка сценария/диффа → отдельный коммит. Server integration только на выделенных TEST_DATABASE_URL/TEST_REDIS_URL, без вывода значений. Команды из корня. Не запускать server suites параллельно на общей тестовой БД.

### Task 1 — baseline, трассировка и бюджеты (P0)

**Files:** создать `packages/web/scripts/audit-performance-build.mjs`, `packages/web/src/performance/navigationTiming.ts`, `packages/server/src/plugins/performance.ts`; подключение `packages/server/src/app.ts`; тесты `packages/web/src/performance/navigationTiming.test.ts`, `packages/server/test/plugins/performance.test.ts`; результаты `docs/qa/app-performance/`.

**Interfaces:** `recordNavigationStart(routeGroup: string): string`, `recordNavigationReady(token: string): void`; серверные метрики route group, duration, phase, pool waiting/active, event-loop lag. Не логировать URL с UUID, сообщения, токены, параметры SQL или секреты. Включение измерений по настройке; необязательный Server-Timing без чувствительных значений.

- [ ] Зафиксировать failing tests: первый usable frame завершает ровно один token; ошибка/отмена не считается успешной загрузкой; labels не содержат user ID/URL query.
- [ ] Запустить новые unit tests, сохранить RED, добавить минимальную инструментализацию, получить GREEN.
- [ ] Снять cold/warm/update baseline и SQL-only read plans; для execution plans использовать только ограниченные SELECT в read-only transaction со statement timeout.
- [ ] Создать отчёт минимум для 30 повторов профиля/перехода; отделить API, parsing, paint/decode; замеры отсутствующего сценария пометить BLOCKED.
- [ ] Зафиксировать budget checker и отдельный коммит `test(perf): establish navigation and build performance baselines`.

### Task 2 — ограничить SQL серии одним игроком (P0)

**Files:** `packages/server/src/profile/activityStreak.ts`, `packages/server/src/profile/summary.ts`; создать `packages/server/test/profile/activityStreak.test.ts`; существующий `packages/server/test/profile/statRating.test.ts`.

**Interfaces:** сохранить `fetchPlayStreakStats(db, userId, timezone)`; user-scoped CTE связывает `$1` у shot sessions и anchors. Глобальный рейтинг использует прежнюю глобальную форму.

- [ ] Тест с большим числом чужих sessions: SQL одиночного профиля ограничен ID у источника; серии идентичны эталону на полночь, gaps, DST/timezone и пустую историю. Наблюдать RED на текущем SQL.
- [ ] Внести scoped query, получить GREEN; сравнить EXPLAIN на том же fixture и проверить, что чужие rows не определяют объём работы.
- [ ] Запустить `pnpm --filter @hockey/server exec vitest run test/profile/activityStreak.test.ts test/profile/statRating.test.ts` и server typecheck. Отдельный коммит `perf(profile): scope single-player streak queries`.

### Task 3 — убрать observers/grants из публичного чтения (P0)

**Files:** `packages/server/src/profile/summary.ts`, `packages/server/src/chat/service.ts`, `packages/server/src/achievements/service.ts`, `packages/server/src/achievements/stageProgress.ts`, `packages/server/src/achievements/fanStages.ts`; создать `packages/server/test/profile/publicProfileRead.test.ts`; `packages/server/test/chat/service.test.ts`.

**Interfaces:** `readPublicProfileProgress(db, row): Promise<ProfileProgressDTO>` читает сохранённые данные; внутренний selector каталога отделён от `openFirstAchievementStages/observeFanAchievement`. Не использовать публичный read для repair/выдачи.

- [ ] Карта всех write events: shots, purchase confirmation, registration/first stage, follow/unfollow, публикация новых stages; определить совместимое историческое repair отдельно от публичного GET.
- [ ] RED: query recorder отклоняет INSERT/UPDATE/DELETE при `getUserPublicProfile(...,{summary:true})`; тесты проверяют сохранённые достижения, скрытые/claimed stages и тот же stats DTO.
- [ ] Разделить read/write; обеспечить отсутствующие event hooks и идемпотентный repair в изолированной среде, получить GREEN. Не убирать lazy-repair без этой защиты.
- [ ] Интеграционные проверки выдачи ровно один раз, параллельного follow/view и существующего игрока; сравнение ответов до/после. Коммит `perf(profile): separate public reads from progression updates`.

### Task 3a — сохранённые счётчики достижений (согласованное дополнение, P0)

**Files:** additive `packages/server/db/migrations/242_achievement_summary.sql`; `packages/server/src/achievements/summary.ts`; `packages/server/test/achievements/summary.test.ts`; публичные profile DTO/API/UI и их тесты.

**Контракт:** `achievementSummary: {completed:number,total:number,levels:{completed:number,total:number}}`. У игрока сохранены completed tasks/levels; общие total tasks/levels — в отдельной singleton строке каталога. Public summary возвращает `achievements: []` для совместимости и готовый `achievementSummary`; full API старого клиента пока сохраняется. Фронт summary не суммирует массив и не монтирует карточки.

- [ ] RED PostgreSQL: точные числа для locked/completed/claimed, стадий и повторной обработки; откат транзакции, конкурентные завершения, скрытие/возврат задания, включение/отключение уровня, удаление и новый игрок.
- [ ] Additive backfill существующих данных. DB triggers покрывают все пути записи, включая admin/ops; обновление обычного stage.progress без изменения завершённости не пересчитывает summary. Не дублировать total для каждого пользователя.
- [ ] GREEN: snapshot соответствует эталонному подсчёту, read API выполняет только SELECT, нет DML и исторических arrays в summary. Тест подтверждает, что карточки сохраняются в собственном профиле.
- [ ] Сверка и измерение на выделенной БД; миграция не применяется на dev/prod в рамках локальной реализации.

### Task 4 — лёгкий собственный профиль и история по требованию (P0/P1)

**Files:** `packages/server/src/routes/me.ts`, `packages/server/src/profile/summary.ts`, `packages/web/src/screens/ProfileScreen.tsx`, `packages/web/src/screens/profileTypes.ts`, `packages/web/src/app/playerStartup.ts`, `packages/web/src/screens/SectionsScreen.tsx`; тесты `packages/server/test/routes/me.test.ts`, `packages/web/src/screens/ProfileScreen.test.tsx`, `packages/web/src/app/playerStartup.test.ts`.

**Interfaces:** поддержать `/me?summary=true` без trophyDetails, с теми же необходимыми identity/access/balance/counts; прежний `/me` сохраняется. Детали через существующий authenticated `/users/:userId/trophies` с проверкой прав/совместимости или отдельный собственный endpoint. Поздравления не теряются при разделении ключей.

- [ ] RED: summary не вызывает trophy details и исторический challenge progress; старый full контракт остаётся прежним, профиль с наградами открывает детали по нажатию.
- [ ] Сделать общий источник summary для карты/владельца; не выдавать неполный объект за полный тип; собрать все независимые read queries параллельно в пределах бюджета пула, настройки прочитать один раз на request.
- [ ] GREEN + переходы после награды/покупки/смены уровня и очереди поздравлений; `pnpm --filter @hockey/server exec vitest run test/routes/me.test.ts`, targeted web tests и оба typecheck.
- [ ] Отдельный коммит `perf(profile): defer historical details from the app shell`.

### Task 5 — быстрый общий публичный профиль (P0/P1)

**Files:** `packages/web/src/chat/components/UserProfileSheet.tsx`, `packages/web/src/chat/screens/UserProfileScreen.tsx`, `packages/web/src/chat/api.ts`, `packages/web/src/lib/queryKeys.ts`, `packages/web/src/social/ProfileBio.tsx`, `packages/server/src/chat/types.ts`, `packages/server/src/chat/service.ts`; создать `packages/web/src/chat/usePublicProfile.ts`; тесты существующих UserProfileSheet/UserProfileScreen и SocialProfile.

**Interfaces:** `usePublicProfile(userId: string)` возвращает summary query; ключ изолирован viewer/target/format. Не использовать полный DTO как ложное initialData с нулевыми достижениями. Bio optional для совместимости со старым сервером, separate query только при отсутствии поля.

- [ ] RED: имя/аватар видны до unresolved fetch; повторный sheet в течение 60 с без нового profile fetch; full-page не загружает собственные trophyDetails; summary/full не загрязняют друг друга.
- [ ] Добавить общий hook, сигнал отмены и структурный skeleton; собственный competitionLevel взять из общей profile-cache. Социальные кнопки обновляются после follow, детали наград запрашиваются только при открытии.
- [ ] GREEN: быстрый A→B, поздний A response, logout/login, 404/retry, истёкший кеш и приглашение в дуэль с изменившимися ограничениями.
- [ ] Browser: чат, рейтинг, список посетителей, fans и прямой URL. Коммит `perf(profile): render cached identity and share summary queries`.

### Task 6 — отделить код игры от оболочки (P1)

**Files:** `packages/web/src/onboarding/OnboardingGate.tsx`, `OnboardingFlow.tsx`, `BeginnerStoryFlow.tsx`, `TutorialShotStep.tsx`; `packages/web/src/city/GlobalGames.tsx`, `packages/web/src/screens/DailyScreen.tsx`; создать `packages/web/src/city/GameHub.tsx`; тесты `packages/web/src/app/routePreload.test.ts`, `packages/web/src/onboarding/OnboardingGate.test.tsx` и build-budget Task 1.

**Interfaces:** GameHub остаётся с прежними callbacks и presentation, но не импортирует DailyScreen/PlayView. Gate имеет маленький StartupSplash, story flow грузится только если required/replay.

- [ ] RED: граф начальных imports содержит Pixi/PlayView; graph общего меню содержит DailyScreen. Functional tests: до определения required не возникает преждевременной навигации.
- [ ] Вынести лёгкие границы; динамически загружать flow/tutorial и модалки по использованию; не заменять один крупный общий chunk другим.
- [ ] GREEN build graph, новый/существующий пользователь, replay, приглашение, reconnect и все пункты floating menu. Сравнить initial bytes/parse и цель <=220 KiB gzip JS.
- [ ] Коммит `perf(web): load game scenes only when needed`.

### Task 7 — подготовка по маршруту, чистый возврат (P1)

**Files:** `packages/web/src/app/playerStartup.ts`, `artworkCache.ts`, `App.tsx`, `routePreload.ts`; `packages/web/src/onboarding/OnboardingGate.tsx`; тесты `playerStartup.test.ts`, `App.test.tsx`, `GameEntryRoute.test.tsx`, `routePreload.test.ts`.

**Interfaces:** `prepareInitialPlayerExperience` принимает destination; блокирует только обязательную readiness. После игры refresh авторитетного результата и обязательного онбординга сохраняется, необязательные histories не задерживают первый кадр карты.

- [ ] RED: медленный/failed training endpoint блокирует карту; на direct profile загружается old arena artwork; восстановить fixture обоих выходов из игры.
- [ ] Destination-aware подготовка и приоритетный фон; второстепенные данные загружать после usable frame с catch/retry. Не показывать старую арену в Suspense/fallback.
- [ ] GREEN + filmstrip: cold direct profile, cold `/`, training→home, daily→home, modal exit, повышение уровня/обязательный онбординг, offline повтор, double tap и stale state response.
- [ ] Коммит `perf(navigation): prepare only the destination screen`.

### Task 8 — бюджет изображений и bounded decode-cache (P1)

**Files:** `packages/web/src/city/lighting.ts`, `cityImageCache.ts`, `CityBackground.tsx`; `packages/web/src/app/artworkCache.ts`, `routePreload.ts`; `packages/web/src/components/SectionPanorama.tsx`; актуальные `public/maps/` и thumbnails только при доказанной необходимости; тесты `packages/web/src/city/lighting.test.ts`, новый `packages/web/src/city/cityImageCache.test.ts`, `packages/web/src/app/artworkCache.test.ts`.

**Interfaces:** чистая `chooseCityImageSize(viewport, dpr, hints)` с fallback без deviceMemory; bounded current/previous map-cache и отдельная ограниченная очередь artwork. Ключ = версия URL, а не имя сцены без версии.

- [ ] RED: узкий high-DPR экран безусловно получает 6144; после большого обхода retainedArtwork не ограничен; ошибки preload и смена lighting не дают испорченный frame.
- [ ] Согласовать размер по реальным world bounds и визуальному сравнению; ограничить удержание и очереди, current background high priority, второстепенные idle/cancel before start. Не делать preload всех разделов.
- [ ] GREEN + телефон: 360/390/430 px, desktop framed layout, четыре освещения, смена города, hidden→visible и memory pressure; 30 round-trips, карта не размывается и не скачивается заново при каждом переходе.
- [ ] Коммит `perf(images): bound artwork retention and size map textures`.

### Task 9 — быстрый чат и контролируемая история (P1)

**Files:** `packages/web/src/chat/screens/ChatRoomScreen.tsx`, `ChatListScreen.tsx`, `packages/web/src/chat/useChatSocket.ts`, `packages/web/src/chat/api.ts`; при необходимости создать `packages/web/src/chat/MessageWindow.tsx`; тесты в `packages/web/src/chat/test/`.

**Interfaces:** существующий `after` для восстановления хвоста и устойчивый read watermark; диапазон показанных сообщений имеет стабильный anchor. Нельзя просто поставить большой staleTime и потерять offline edits/deletes.

- [ ] RED: повторный mount с 10 страницами вызывает запросы прежних страниц; одинаковый прочитанный хвост повторяет markRead; burst новых сообщений создаёт несколько list/unread refetch.
- [ ] Показать кеш, обновить хвост/изменения после reconnect, объединить инвалидирования; read receipt по новой видимой границе, не по каждому изменению query.data.
- [ ] На fixture 2000 сообщений подтвердить необходимость оконного списка и реализовать с сохранением scroll anchor, prepend, goto, attachments load, reply/edits/deletes; иначе ограничиться доказанными сетевыми правками.
- [ ] GREEN: floating close/reopen остаётся в диалоге, непрочитанные точны, split WS/HTTP race, lost events и reconnect. Коммит `perf(chat): reconcile message tails and batch list refreshes`.

### Task 10 — единое фоновое обновление (P1/P2)

**Files:** `packages/web/src/components/useNavigationActivity.ts`, `useChatUnreadActivity.ts`, `packages/web/src/bar/useBarInvitation.ts`, `useBarMenuEntries.ts`, `packages/web/src/city/GlobalGames.tsx`, `packages/web/src/city/lighting.ts`, `yardLighting.ts`; соответствующие hook tests.

**Interfaces:** один владелец общего resource, `enabled` по session/visibility/activity, single-flight raw polling. Отдельная актуальность активной партии и общего badge; weather hourly не ускорять и не переводить на частые запросы.

- [ ] Из baseline выбрать реально дублируемые ресурсы. RED: long response перекрывается следующим interval; hidden/outside-bar ненужные requests продолжаются; одинаковое событие запускает лишнюю сверку.
- [ ] Устранить дубли и overlaps, сначала WS update, polling fallback по сроку; lighting timer до ближайшего перехода/минуты с focus resync.
- [ ] GREEN: offline/online, несколько observers, logout, reconnect, входящее приглашение в игре и прочтение чата. Сравнить idle requests/min и CPU wakeups.
- [ ] Коммит `perf(activity): coordinate background refreshes`.

### Task 11 — PWA и версии ассетов (P2)

**Files:** `packages/web/vite.config.ts`, `packages/web/nginx.conf`, `packages/web/src/components/UpdatePrompt.tsx` только при изменении стратегии; тесты `staticAssetCaching.contract.test.ts`, `routePreload.test.ts`; build-budget script.

**Interfaces:** critical precache, lazy chunks runtime cache по hash, совместимое обновление клиента; оригинальные API/media permissions остаются прежними.

- [ ] RED: budget сообщает нецелевые Admin/редкие game chunks в install-critical precache; fixture update не смешивает новое HTML со старым отсутствующим chunk.
- [ ] Уменьшить eager precache, обеспечить lazy chunk fallback/retry и версионирование картинок. Разделить лимиты маленьких thumbnails и больших фонов по измеренному storage budget.
- [ ] GREEN browser: fresh install, warm offline, новая версия при открытой старой вкладке, «Обновить приложение», ограниченная storage quota. Не обещать полный offline впервые открываемого раздела без его загрузки.
- [ ] Коммит `perf(pwa): cache secondary resources on demand`.

### Task 12 — ограниченная стоимость наград, рейтингов и списка чатов (P2, после SQL baseline)

**Files:** `packages/server/src/profile/summary.ts`, `statRating.ts`, `experienceRating.ts`, `packages/server/src/chat/service.ts`, `packages/server/src/weeklyChallenge/progress.ts`; API/UI конкретного trophy history; тесты profile/chat/weeklyChallenge; новая additive migration только при подтверждённом плане.

**Interfaces:** истории возвращают bounded category/page, завершённые challenge progress рассчитываются bulk; один запрос страницы рейтинга переиспользует рассчитанный rank/viewer. Материализованные суточные данные — отдельный этап только если scoped query остаётся дорогим.

- [ ] RED: история 0/1/100 завершённых недель не укладывается в query-count/response budget; рейтинг повторяет тяжёлый общий расчёт; большой chat list превышает DB budget на fixture.
- [ ] Оптимизировать только измеренные queries; проверить уже существующие индексы, не наращивать пул для маскировки N+1. Для snapshot описать backfill/resume/reconcile и не менять исторические награды.
- [ ] GREEN: одинаковые итоги, стабильная пагинация без дублей, игрок без истории, удалённый турнир, новые результаты и конкурентный запрос.
- [ ] Коммит по конкретному самостоятельному bottleneck; не смешивать разные SQL-подсистемы без общей причины.

### Task 13 — плавность, media и фоновые workers по результатам профиля (P2/C)

**Files:** `packages/web/src/game/PixiStage.tsx`, `PlayView.tsx`, `packages/web/src/screens/DailyScreen.tsx`, `packages/web/src/city/WeatherOverlay.tsx`, `CityTraffic.tsx`, `packages/web/src/chat/components/UserAvatar.tsx`; server media и workers только для подтверждённых проблем.

- [ ] Снять FPS/long tasks/heap и cost отдельных эффектов; RED воспроизведения — изолированный плохой frame/неубранный timer/лишний sprite или тяжёлое медиа с fixture, не строковое наличие setInterval.
- [ ] Выбирать assets под текущую сцену/хват, локализовать clock state, остановить невидимую отрисовку; текстуры грузить через `Assets.load`, не ломать lifecycle. Сохранить качество liquid glass и выбранный дизайн.
- [ ] Для server измерить scheduler overlap, event-loop lag, slow queries и pool queue при seeded нагрузке; оптимизировать доказанные batch/locks, не менять fight tick и экономику.
- [ ] GREEN визуальная и gameplay регрессия: бросок, дуэль/бой, break, reconnect, background return; 30 входов/выходов без роста сцен. Media thumbnails только если загрузка реальных оригиналов доказанно тяжёлая и доступы сохраняются.
- [ ] Самостоятельные коммиты по подтверждённым причинам. Если profiler не выявил проблему, зафиксировать PASS без рефакторинга ради рефакторинга.

### Task 14 — интеграционная приёмка и контроль релиза

**Files:** `docs/qa/app-performance/`, профильные regression suites, CI performance budget job после чтения scoped workflow AGENTS.

- [ ] Разобрать оставшееся падение CI кандидата отдельно; не объявлять flaky/baseline без воспроизведения на исходной версии.
- [ ] Выполнить проверки затронутых пакетов; при изменении game-core сначала его build. Финальная интеграция: `pnpm typecheck`, `pnpm lint`, `pnpm build`, релевантные suites; full suite согласно объёму и проектной release policy.
- [ ] На dev провести real-account mobile acceptance матрицы ниже; собрать SHA, результаты и до/после, не смешивая fixture и реальную игру.
- [ ] Только после отдельного разрешения — release на dev/prod через Actions и проверка exact SHA, runtime, assets, health, миграций и PWA update; затем узкая production smoke-проверка без тестовых игровых/платёжных mutations.

## 6. Матрица приёмки

| Область | Сценарии | Обязательная регрессия |
| --- | --- | --- |
| Старт | новый/возвращающийся; cold/warm; direct link; expired access token; native hydration | обязательный onboarding, отсутствие лишнего full reload/blank wait |
| Навигация | карта→квартира/магазин/бар/задания/бонусы→карта; назад; floating controls | сохранение положения и вкладки, нет старого куба/фона |
| Чужой профиль | чат, рейтинг, fans, посетители бара, direct URL; A→B→A | имя сразу, актуальная статистика, полный скролл до кнопки, доступы и dual format cache |
| Собственный профиль | после гола/награды/покупки, смены уровня/города | нет старого баланса, новый город/погода корректны |
| Чат | 0/50/2000 сообщений; reopen; goto; картинки; edits/deletes; burst; reconnect | сохранение диалога/scroll, правильные unread/read и без дубликатов |
| Игры | тренировка/ежедневная/дуэль/турнир/барная; exit; break; background/reconnect | немедленный правильный destination, shot не залипает и результат не откатывается |
| Графика | day/morning/sunset/night; rain/snow/overcast; темы; DPR; desktop frame | нет размытия, вспышек, накопления canvas/текстур |
| Каталоги | магазин/банк, достижения, бонусы, награды/истории | данные по требованию, покупка/claim проверяются сервером, нет лишних preloads |
| PWA/native | install/update/offline/return, quota, старая вкладка после deploy | не ломаются chunks, авторизация, notifications и возврат в приложение |
| Сервер | user-scoped SQL, большой объём истории, параллельные read, workers | нет DML публичного прогресса, queue/CPU в бюджете, стабильные итоги |

## 7. Рекомендуемый порядок и ожидаемый итог

1. **Профили сначала:** Task 1 → 2 → 3 → 4 → 5. Это соответствует жалобе пользователя и уменьшает серверную цену частого действия. У пользователя сразу появляется известная карточка игрока; сервер возвращает нужное без выдачи достижений и обхода общей активности.
2. **Старт и переходы:** Task 6 → 7 → 8. Меньше первоначального кода и ожидания ненужных API/картинок; тёплая карта возвращается из готового фона.
3. **Чат и фоновая нагрузка:** Task 9 → 10. Длинные диалоги и непрочитанные обновляются адресно; ниже трафик и нагрузка в длительной сессии.
4. **Доставка, масштабирование и плавность:** Task 11 → измеренные пункты 12/13 → 14. Улучшения принимаются по фактическому bottleneck, а не по общему размеру репозитория.

Не начинать с переписывания приложения, тотальной смены формата картинок, увеличения DB pool или кеширования всех API. В коде уже есть достаточная основа кешей и ленивой загрузки; основной резерв — лишняя работа на критическом пути и границы этих механизмов.

## 8. Самопроверка плана и handoff

- Все запросы пользователя покрыты findings, задачами и acceptance matrix; редизайн бара исключён.
- Разделены кодовые доказательства, диагностические размеры и недоступные live-замеры.
- Существующие October summary/deferred trophies, кеш фона, hourly weather, HTTP/PWA cache учтены как работающие механизмы.
- Каждый Review Focus имеет проверки в Task 2/3/5/7/8/9/10/11/14.
- Непроверенная причина CI не выдана за известную baseline-проблему.
- Аудит был read-only. Последующим сообщением пользователь разрешил локальную реализацию всего плана; прогресс фиксируется в журнале, а публикация остаётся отдельным действием.


## 9. Локальная реализация 24 октября: фактическое состояние

Рабочая ветка `fix/app-performance`, база свежего `origin/dev` — `86b5102a`. Реализация остаётся локальной, dev/prod не изменялись. Ни один пункт ниже не означает пройденную приёмку реального production-аккаунта.

| Этап | Реализовано и проверено локально | Что остаётся измерить/проверить |
| --- | --- | --- |
| 1 | Navigation Timeline; воспроизводимый budget checker; opt-in серверные Server-Timing, duration, pool pressure, event-loop P95; CI проверяет размер после build | Cold/warm latency настоящего профиля и device traces |
| 2 | SQL одиночной серии ограничен игроком у sessions и anchors, глобальный рейтинг сохраняет прежний запрос | EXPLAIN ANALYZE на реалистичной истории и DST fixture |
| 3/3a | Миграция 242 хранит пользовательские counters и общие totals; completion/catalogue triggers, atomic backfill; компактный публичный GET читает без grants/observers; wallet hook выполняется в paid-транзакции | Время backfill на объёме dev перед релизом; legacy full/summary API сохраняет прежний repair для совместимости |
| 4/5 | Общая сводка владельца; история наград по нажатию; общая компактная загрузка чужого профиля; известные имя/аватар сразу; счётчики без картинок, кеш изолирован по viewer | Авторизованная мобильная приёмка и цель <1с/200мс |
| 6 | GameHub и formatMs извлечены; Pixi/PlayView и OnboardingFlow за lazy boundary, gate не обходит её | Измерить parse/CPU на телефоне |
| 7/8 | Старые арены и training/daily не блокируют старт оболочки; phone-aware размер карты; LRU 64 artwork refs и 2 карты; 30 QA-циклов карта→профиль→карта прошли | Heap/GPU на устройстве, 360/390/430px и offline filmstrip |
| 9 | Тёплый чат использует кеш; WS recovery помечает истории stale для сверки edits/deletes; read watermark и объединение list/unread запросов | Виртуализация 2000 сообщений не реализована: нужен отдельный browser fixture, профилирование и проверка scroll anchor |
| 10 | Общий минутный clock освещения с hidden pause/focus resync; параллельные lobby GET объединены только в пределах одной сессии, без TTL снимков | Idle requests/min в авторизованном длительном сеансе; дальнейшее объединение polling только по замерам |
| 11 | Critical precache оболочки+карты, runtime cache lazy modules, ручное восстановление failed chunk; /assets не возвращает SPA HTML вместо отсутствующего JS | Реальные install/update/offline/quota и старая вкладка при deploy |
| 12 | История наград: обязательная категория, 20 записей + lookahead, load more; batch progress одним SQL вместо N+1; PostgreSQL parity нескольких временных окон | Рейтинги и chat-list SQL не переписаны без EXPLAIN/объёмного fixture |
| 13 | Устранён доказанный секундный пересчёт освещения; WeatherOverlay/CityTraffic pause сохранены | GPU, медиа, workers и 30-cycle heap профилирование на реальном устройстве; качество/игровые tick не менялись |
| 14 | Общие typecheck/lint/build, build budget, затронутые unit/integration suites, независимое ревью | Полные web/server остаются красными на 9+9 воспроизведённых исходных падениях; новая CI и dev/prod не запускались |

### Измеренные результаты

- Initial JS gzip: **327383 → 180539 байт (-44,85%)**.
- Initial JS+CSS gzip: **408283 → 258816 байт (-36,61%)**.
- Critical PWA precache: **36 entries / 1230,62 KiB**; ленивые игровые/админские модули получают runtime cache по запросу.
- История страницы из 20 челленджей: **21 → 2 SQL round-trips**, включая запрос самой страницы. Это query-count, не измерение latency production.
- Освещение в тесте 55-секундного интервала: прежние 55 проверок устранены; общий минутный таймер останавливается в hidden.
- UI fixture карта→профиль→карта: **30 успешных циклов**. Это работоспособность переходов на desktop preview; не замер FPS/heap или телефона.

Проверки и оставшиеся ограничения перечислены в `docs/qa/app-performance/2026-10-24-implementation.md`. Невыполненные аппаратные/авторизованные проверки не заменены предположениями. Неподтверждённые GPU/SQL bottlenecks остаются отдельными последующими этапами, а не объявляются исправленными.
