# Responsive Wide Application Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Delegation requires direct user authorization under the project working agreement. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Адаптировать всё пользовательское приложение под одну, две и три колонки с независимыми переходами, сохранением игрового контекста и плавающим/закреплённым чатом.

**Architecture:** Общая оболочка рассчитывает доступное место и показывает представления соседних страниц на одной панораме. У каждой страницы собственный контекст навигации; URL отражает активную страницу, игровой контроллер остаётся единственным. Чат переиспользует существующие представления, кеш и realtime-подключение и не заменяет основной маршрут при открытии поверх приложения.

**Tech Stack:** React 18, TypeScript strict, React Router 6, TanStack Query 5, Zustand 4, Motion 13, существующие CSS и Pixi 8. Node >=20, pnpm >=9. Без новых runtime-зависимостей.

**Spec:** [Утверждённая спецификация](../specs/2026-10-21-responsive-wide-layout-design.md), утверждена пользователем в чате 21.10.2026.

## Global Constraints

- Ветка `feature/responsive-wide-layout`; исходная база `a69f34a2f98460b0dfcb22fd6f25116513a6f300`. Проверить чистоту ветки перед кодом; обновление базы при необходимости выполнять без потери документов и чужих изменений.
- До 430 CSS px сохраняется мобильная геометрия. На большей ширине внешние отступы 24 px, промежутки 24 px, ширина колонки 380–430 px, одна–три видимые колонки. Пороги без закреплённого чата: 832 и 1236 px.
- Закреплённый чат занимает 360 px + 24 px; плавающий чат доступен с 832 px. Не вводить тип устройства по user-agent.
- Все семь мест входят в поставку: карта, бар, квартира/профиль, бонусные игры, стадион, задания, двор/тренировки. Ни один промежуточный этап не объявлять завершением общего запроса.
- Использовать существующие тексты, картинки, доступы, данные и возможности. Данные генеративных макетов не переносить в продукт.
- Панорамы сохраняют пропорции. Общая нижняя навигация и зоны нажатия согласованы с изображением.
- Колонки не запускают игровые контроллеры. Геометрия и правила игры не меняются. Во время игры чат свёрнут.
- Общие query keys, одна авторизация и один chat socket. Серверные изменения, миграции, публикация и деплой не входят в разрешение.
- Переходы и возврат из игры восстанавливают выбранную колонку, её подробности и прокрутку. Изменение размеров не добавляет browser history.
- Состояние изолировано по пользователю. Черновики сообщений не сохраняются в localStorage; разрешено сохранять там только геометрию и режим окна.
- Код, идентификаторы, комментарии и commit messages — English; UI — русский. GLM и неразрешённая делегация запрещены.
- Каждый поведенческий шаг: тест → наблюдаемый RED → минимальная реализация → GREEN → регрессии → просмотр diff → отдельный логический коммит.
- Прямые Vitest-команды ниже выполняются от корня. Штатный `pnpm --filter @hockey/web test` запускает весь wrapper, фильтры ему не передавать.

## Review Focus

1. Resize и открытие закреплённого чата на правой крайней странице: выбранная страница остаётся видимой, состояние соседей не теряется (задачи 1–3, 10).
2. Прямая ссылка и Browser Back из подробностей одной колонки: соседние колонки не меняются, внутренний Back восстанавливает список (задачи 2, 4–6, 8).
3. Несколько видимых страниц при завершении игры или повторном клике: нет нескольких контроллеров, повторных запросов запуска и списаний (задачи 4, 8).
4. Скрытый диалог, неактивная вкладка и переход между пользователями: сообщения не помечаются прочитанными, черновики и окна не протекают между аккаунтами (задачи 9–10).
5. Физический порядок фрагментов панорамы отличается от порядка кругов; в узком landscape и при reduced motion зоны и навигация остаются корректными (задачи 3, 5, 7, 11).

## Структура и границы модулей

Новые модули размещаются в `packages/web/src/layout/` (геометрия, навигация страницы, оболочка, возврат), `packages/web/src/venue/` (представления мест) и `packages/web/src/chat/presentation/` (встраивание и окно чата). Существующие route screens остаются совместимыми входами для прямых ссылок и мобильной версии. Никаких iframe, вложенных BrowserRouter и дублирующих полноценных DailyScreen.

`SectionPanorama` остаётся общим визуальным компонентом и получает опциональный renderer нескольких страниц. `VenuePanorama` и `BonusGamesScreen` поставляют конкретные страницы. Компоненты читают локальный маршрут страницы через новый контекст, а не выводят своё содержимое из URL активного соседа.

### Task 1: Геометрия и выбор видимых страниц

**Files:** Create `packages/web/src/layout/columnLayout.ts`, `columnLayout.test.ts`, `useColumnLayout.ts`.
**Interfaces:** `calculateColumnLayout(input: {width:number; pageCount:number; selectedIndex:number; dockedChat:boolean}): ColumnLayout`; result `{count:number; columnWidth:number; firstIndex:number; contentWidth:number; gutter:number; gap:number}`. Ширина — фактическая ширина общей оболочки до вычета чата. Некорректная/нулевая ширина безопасно даёт одну колонку; count не меньше 1, даже при пустом descriptor list, который оболочка показывает как empty state.

- [ ] RED: `columnLayout.test.ts` проверяет count при 430/831/832/1235/1236 px, cap 3, pageCount 1/2/6, верхнюю границу 430 и отсутствие отрицательной ширины. `expect(layout(832, 3).count).toBe(2)`; `expect(layout(1236, 3).count).toBe(3)`; `expect(layout(1440, 3, true).count).toBe(2)`. Локальный helper `layout(width,pageCount,dockedChat=false)` вызывает указанный public interface с selectedIndex 0.
- [ ] Выполнить `pnpm --filter @hockey/web exec vitest run src/layout/columnLayout.test.ts`; зафиксировать конкретный FAIL до реализации.
- [ ] Реализовать функцию и ResizeObserver hook `useColumnLayout(ref: RefObject<HTMLElement>, pageCount:number, selectedIndex:number, dockedChat:boolean): ColumnLayout`; сдвигать firstIndex ровно настолько, чтобы выбранная колонка оставалась видимой. Не переключать на wide по SSR/первому нулевому измерению.
- [ ] GREEN: тот же тест, включая selectedIndex последней страницы при 3→2→1 колонке и значение ширины 0. Затем `pnpm --filter @hockey/web typecheck`.
- [ ] Просмотреть diff, commit `feat: calculate responsive column layout`.

### Task 2: Независимый маршрут каждой страницы

**Files:** Create `packages/web/src/layout/ColumnNavigation.tsx`, `columnNavigationStore.ts`, `ColumnNavigation.test.tsx`; Modify `packages/web/src/components/venueScenes.ts`, `packages/web/src/components/VenuePanorama.tsx`.
**Interfaces:** `ColumnLocation = {pathname:string; search:string; hash:string}`; `ColumnKey = {owner:string; venueId:string; pageId:string}`. Provider `ColumnNavigationProvider({pageKey, initialLocation, active, onActivate, onGame, children})`; `onActivate(location:ColumnLocation, options?:{replace?:boolean}):void`, `onGame(location:ColumnLocation):void`. Hook `useColumnNavigation()` returns `{location, navigate, back, canGoBack, activate}`; navigate принимает ColumnLocation и options, back восстанавливает локальный stack. Без Provider hook делегирует обычному router. Store сбрасывается при смене owner.

- [ ] RED: две соседние страницы имеют разные search; navigate в правой обновляет только её, activate синхронизирует основной URL, back возвращает её список. POP внешнего router восстанавливает активную страницу. Смена owner очищает локальную историю.
- [ ] Запустить `pnpm --filter @hockey/web exec vitest run src/layout/ColumnNavigation.test.tsx src/components/SectionPanorama.test.tsx` и записать RED нового поведения.
- [ ] Экспортировать типы VenuePage/VenueScene, добавить страницу и принадлежность маршрута в descriptor без смены существующих href и background position. Реализовать явную локальную навигацию; переход в другое место делегировать внешнему router. Попадание в game route вызывает onGame. URL активной страницы остаётся источником прямой ссылки и POP, но не управляет соседями.
- [ ] GREEN: те же тесты, включая прямую ссылку на подробности без посещения карты и resize без добавления history entries.
- [ ] Просмотреть diff, commit `feat: isolate navigation within venue columns`.

### Task 3: Общая панорама, независимая прокрутка и dock

**Files:** Create `packages/web/src/layout/VenueColumns.tsx`, `VenueColumns.test.tsx`, `venue-columns.css`; Modify `packages/web/src/components/SectionPanorama.tsx`, `section-panorama.css`, `SectionPanorama.gesture.test.tsx`, `SectionPanorama.transition.test.tsx`, `SectionPanorama.reduced-motion.test.tsx`.
**Interfaces:** `VenueColumnPage = PanoramaPage & {render:()=>ReactNode}`; `VenueColumns({pages:readonly VenueColumnPage[], selected:string, onSelect:(id:string)=>void, storageKey:string, dockedChat:boolean})`. Дополнить SectionPanorama опциональными `renderPage?: (id:string)=>ReactNode` и `dockedChat?:boolean`; без renderer сохранить существующий single-child контракт.

- [ ] RED: 2–3 одновременно видимых renderer, отдельные scroll containers, один dock, выбранная правая страница видима после resize, последний элемент доступен выше dock, offscreen тяжёлые renderer не монтируются. Проверить `position` страницы независимо от её индекса.
- [ ] Запустить `pnpm --filter @hockey/web exec vitest run src/layout/VenueColumns.test.tsx src/components/SectionPanorama.test.tsx src/components/SectionPanorama.gesture.test.tsx src/components/SectionPanorama.transition.test.tsx src/components/SectionPanorama.reduced-motion.test.tsx`; зафиксировать RED.
- [ ] Реализовать горизонтальное окно страниц с кнопками предыдущей/следующей группы, pointer drag, существующими кругами и клавиатурой. Сохранить позиции по pageKey. Desktop wheel не преобразовывать в горизонтальную прокрутку. Для wide-панорамы использовать единый пропорциональный background transform; mobile-переходы сохранить. Общая навигация не масштабируется на всё окно. Непосещённые невидимые страницы монтировать лениво; посещённые страницы с несохранённой формой сохранять смонтированными, но без фоновой загрузки тяжёлых медиа. Скрываться они должны через hidden/inert, без доступных фокусу невидимых контролов.
- [ ] GREEN: перечисленные тесты, вертикальное движение не захватывается swipe, клик после drag не активирует карточку, reduced motion не оставляет промежуточное положение.
- [ ] Просмотреть diff, commit `feat: render adjacent pages on a shared panorama`.

### Task 4: Стадион и двор без дублирования игрового контроллера

**Files:** Create `packages/web/src/venue/StadiumPages.tsx`, `YardPages.tsx`, `VenuePages.test.tsx`; Modify `packages/web/src/screens/DailyScreen.tsx`, `DailyScreen.test.tsx`, `DailyOverviewScreen.tsx`, `components/VenuePanorama.tsx`, `tournament/TournamentCatalog.tsx`.
**Interfaces:** `StadiumPage({id:'daily'|'duels'|'tournaments'})`, `YardPage({id:'daily'|'open'|'course'|'advanced'})` consume task 2 context. Выделить/экспортировать существующие `AmateurDuelsPage`, `AmateurTournamentsPage` и обзор открытой тренировки как отдельные view-компоненты с явными callbacks; gameplay-компоненты остаются у единственного DailyScreen. Исходный обзор тренировок — `TrainingPlaceholder` в `DailyScreen.tsx`; отделить его hub-часть от `playTraining` и `autoPlay`, не переписывать правила курса.

- [ ] RED: одновременно видны daily/duels/tournaments и доступны только разрешённые level страницы; ни один PlayView не монтируется до запуска. Вызов onOpenMatch один раз передаёт маршрут единственному игровому владельцу; выбранный tournament в соседней колонке не сбрасывается от изменения дуэли.
- [ ] Запустить `pnpm --filter @hockey/web exec vitest run src/venue/VenuePages.test.tsx src/screens/DailyOverviewScreen.test.tsx src/tournament/TournamentCatalog.test.tsx` и точные тесты изменённых веток DailyScreen напрямую с `-t`, записать RED.
- [ ] Выделить только нужные hub views и их зависимости. Заменить чтение глобального route в встраиваемых views/descendants на локальный контекст. Общие query keys и auth/access guards сохранить. Не монтировать несколько DailyScreen и не переносить PlayView в колонку. Курсы используют действующие InitialTrainingCourse/AdvancedTrainingCourse и штатные игровые переходы.
- [ ] GREEN: новые тесты плюс существующие `InitialTrainingCourse.test.tsx`, `AdvancedTrainingCourse.test.tsx`, `TrainingHistorySection.test.tsx`. Проверить отсутствие автоматических start/accept/settle мутаций от mount дополнительных колонок.
- [ ] Просмотреть diff, commit `feat: adapt stadium and yard pages to columns`.

### Task 5: Квартира, задания и локальные подробности

**Files:** Create `packages/web/src/venue/ApartmentPages.tsx`, `TaskPages.tsx`, `ApartmentTaskPages.test.tsx`; Modify `components/VenuePanorama.tsx`, `screens/ProfileScreen.tsx`, `ProfileRewardsScreen.tsx`, `ProfileFriendsScreen.tsx`, `ProfileSettingsScreen.tsx`, `ProfileDestinationScreens.tsx` и `ProfileStorySeriesScreen.tsx`, `AchievementsScreen.tsx`, `WeeklyChallengeScreen.tsx`; соответствующие существующие tests.
**Interfaces:** `ApartmentPage({id:'profile'|'rewards'|'friends'|'settings'|'story'})`, `TaskPage({id:'tasks'|'challenges', profileContext:boolean})`, внутри task 2 Provider. Существующие route screens делегируют тем же view, чтобы не создать отдельные mobile/wide реализации.

- [ ] RED: настройки и фильтры не сбрасываются при клике соседнего круга; achievement details и back меняют только колонку; порядок profile/rewards/friends/settings/story сохраняет исходные физические позиции 0/2/4/3/5. Уровни, профильный вариант заданий и получение награды не дублируются.
- [ ] Запустить `pnpm --filter @hockey/web exec vitest run src/venue/ApartmentTaskPages.test.tsx src/screens/ProfileScreen.test.tsx` плюс существующие test-файлы затронутых экранов; подтвердить RED новых сценариев.
- [ ] Подключить views, перенести их navigation callbacks на локальный контекст, оставив переходы в другие места внешними. Сохранить dirty формы при переходах в пределах места. Небольшие подробности отображать в колонке, глобальные dialogs — через существующий AccessibleModal.
- [ ] GREEN тех же тестов; дополнительно проверить logout из Settings: состояние всех колонок очищено, защищённые views перестали отображаться.
- [ ] Просмотреть diff, commit `feat: adapt apartment and task pages to columns`.

### Task 6: Бонусные игры по категориям

**Files:** Create `packages/web/src/venue/BonusSkillPage.tsx`, `BonusSkillPage.test.tsx`; Modify `screens/BonusGamesScreen.tsx`, `BonusGamesScreen.test.tsx`, `screens/BonusGamePlayScreen.tsx`.
**Interfaces:** `BonusSkillPage({skill:BonusSkillCode, active:boolean})` использует единый catalog query, локальный selected game и существующие preview/start callbacks. Категория берётся из props, а не из глобального selectedSkill всех колонок.

- [ ] RED: видны разные категории с собственным прогрессом и allowance; preview в одной не меняет соседей; закрытый уровень остаётся закрытым; одна попытка запуска даёт ровно одну start-мутацию. Изображения невидимых категорий не предзагружаются всем каталогом.
- [ ] Запустить `pnpm --filter @hockey/web exec vitest run src/venue/BonusSkillPage.test.tsx src/screens/BonusGamesScreen.test.tsx`; записать RED.
- [ ] Выделить view категории и использовать task 3 renderer. Подробности и выбор уровня сохранить в своём page context, запуск направить в штатный BonusGamePlayScreen с контекстом возврата из задачи 8. Не добавлять выдуманные данные макетов.
- [ ] GREEN тех же тестов, включая независимое обновление allowance после возврата и прямую ссылку с выбранной категорией.
- [ ] Просмотреть diff, commit `feat: show bonus skill categories in adjacent columns`.

### Task 7: Широкие карта и бар, безопасная общая оболочка

**Files:** Create `packages/web/src/layout/appSurface.ts`, `appSurface.test.ts`, `wide-shell.css`; Modify `app/App.tsx`, `app/App.test.tsx`, `app/global.css`, `screens/SectionsScreen.tsx`, `screens/SectionsScreen.test.tsx`, `city/CityMap.tsx`, `city/city-map.css`, `bar/BarScreen.tsx`, `bar/BarScreen.test.tsx`, `bar/bar-panorama.css`, `components/FloatingChatShortcut.tsx`, `components/floating-chat.css`.
**Interfaces:** `appSurface(location:ColumnLocation):'venue'|'panorama'|'game'|'chat'|'contained'`; классификатор использует действующие route predicates и явно покрывает все игровые маршруты. Оболочка wide для мест, panoramic для карты/бара, contained для auth/legal/admin и одиночных экранов. Геометрия плавающих кнопок вычисляется относительно текущей content area.

- [ ] RED: карта/бар занимают доступное окно, картинки пропорциональны, hit areas совпадают после resize, выбранный персонаж один. Auth/admin/legal и одиночные utility views не растягиваются. В App нет неизбирательного maxWidth 430 для мест; игры не попадают в venue renderer.
- [ ] Запустить `pnpm --filter @hockey/web exec vitest run src/layout/appSurface.test.ts src/app/App.test.tsx src/screens/SectionsScreen.test.tsx src/city/CityMap.test.tsx src/bar/BarScreen.test.tsx`; записать RED.
- [ ] Убрать inline mobile cap только для адаптируемых surfaces, ограничить fixed панели карты/бара читаемой шириной; обновить центрирование, панорамные границы, hit areas и shortcut placement вместе. Карту и бар не превращать в карточные колонки. Учесть отсутствие горизонтального overflow, когда вся сцена помещается.
- [ ] GREEN тех же тестов с wide, коротким landscape, mobile safe areas и закреплённой областью чата.
- [ ] Просмотреть diff, commit `feat: reveal wide city and bar panoramas`.

### Task 8: Единственный игровой экран и возврат

**Files:** Create `packages/web/src/layout/gameReturn.ts`, `gameReturn.test.ts`, `GameReturn.integration.test.tsx`; Modify `app/GameEntryRoute.tsx`, `app/GameEntryRoute.test.tsx`, `screens/DailyScreen.tsx`, `screens/BonusGamePlayScreen.tsx`, штатные entry/exit обработчики `bar/games/BarGameScreen.tsx`, `bar/BarScreen.tsx` (экспорт `BarMatchScreen`), `bar/cards/DurakScreen.tsx`, `bar/cards/OnlineDurakScreen.tsx`; Modify существующие стили игрового контейнера в `app/design-system.css`.
**Interfaces:** `captureGameReturn(owner:string, location:ColumnLocation):void`; `consumeGameReturn(owner:string):ColumnLocation|null`. Конкретные выбранные подробности и scroll остаются в task 2 store; marker хранится в sessionStorage по owner, валидируется как внутренний разрешённый маршрут. Не использовать return marker для обхода auth/access и не выполнять exit незавершённой серверной игры.

- [ ] RED: для daily/duel/training/bonus/bar один game mount, одна start-мутация, стандартный разрешённый exit восстанавливает source page/details/scroll. Другой owner, некорректный marker и прямая ссылка на игру безопасно используют штатный fallback. Двойной клик не создаёт две игры.
- [ ] Запустить `pnpm --filter @hockey/web exec vitest run src/layout/gameReturn.test.ts src/layout/GameReturn.integration.test.tsx src/app/GameEntryRoute.test.tsx`; зафиксировать RED. В integration замокать API, не выполнять живые игровые мутации.
- [ ] Подключить capture на штатных точках запуска, consume на разрешённом возврате. Game shell занимает окно, но court остаётся пропорциональным и не меняет world coordinates, timing или pointer mapping. Старые deep links и fallback navigation сохраняются.
- [ ] GREEN тех же тестов, существующие lifecycle-тесты затронутых игровых компонентов и DailyScreen-тесты соответствующих launch/exit ветвей. Изменение игрового viewport согласовать с `docs/engineering/game-state.md` из пользовательской основной папки, если документ отсутствует в этой базе.
- [ ] Просмотреть diff, commit `feat: preserve venue context across game sessions`.

### Task 9: Переиспользуемое содержимое чата и корректное чтение

**Files:** Create `packages/web/src/chat/presentation/ChatPresentationContext.tsx`, `ChatPresentation.test.tsx`; Modify `chat/screens/ChatListScreen.tsx`, `ChatRoomScreen.tsx`, `ChatInfoScreen.tsx`, `ChannelPostCommentsScreen.tsx`, `chat/components/ChatInput.tsx`, `ChatRoomHeader.tsx`, `ChatSectionDock.tsx`, `chat/chatStore.ts`, `chat/useChatSocket.ts`, `chat/test/ChatRoomScreen.test.tsx`, `chat/test/useChatSocket.test.tsx`.
**Interfaces:** `ChatPresentationContext` supplies `{location:ColumnLocation; navigate:(location:ColumnLocation)=>void; visible:boolean}` с router fallback. `ChatDraft = {text:string; replyToMessageId:string|null}`; in-memory draft map по owner/chatId, удаляется при logout. Не хранить File/MediaRecorder в сериализуемом store; при активной записи сначала запросить подтверждение отмены внутри UI, а не терять запись при сворачивании; если готового guard нет, добавить его в рамках этой задачи.

- [ ] RED: чат в embedded presentation переключает список/диалог/инфо/комментарии без смены основного URL; черновик переживает сворачивание и смену места; скрытый диалог/неактивная browser tab не вызывает markChatAsRead или resetUnread. После logout черновиков нет. Socket создаётся один раз в App, даже при remount представления.
- [ ] Запустить `pnpm --filter @hockey/web exec vitest run src/chat/presentation/ChatPresentation.test.tsx src/chat/test/ChatRoomScreen.test.tsx src/chat/test/useChatSocket.test.tsx`; зафиксировать RED.
- [ ] Отделить presentation route и видимость от внешнего router, переиспользовать действующие views. activeChatId/read effects учитывают visible + document visibility. Сохранить дедупликацию socket events, send pending lock, существующие вложения/голос/приглашения. Не добавлять второй ChatRealtime и не отправлять реальные сообщения ради проверки.
- [ ] GREEN перечисленных тестов; дополнительно существующие ChatInput/ChatInfo/ChatList тесты. Проверить закрытие окна и восстановление непрочитанных при новом событии.
- [ ] Просмотреть diff, commit `feat: embed existing chat without replacing venue routes`.

### Task 10: Плавающее и закреплённое окно чата

**Files:** Create `chat/presentation/chatWindowGeometry.ts`, `chatWindowStore.ts`, `ChatWindow.tsx`, `chat-window.css`, `ChatWindow.test.tsx`, `chatWindowGeometry.test.ts`; Modify `components/FloatingChatShortcut.tsx`, `app/App.tsx`, task 1 hook integration.
**Interfaces:** `ChatWindowMode='closed'|'minimized'|'floating'|'docked'`; store fields `{owner:string|null; mode:ChatWindowMode; preferredMode:ChatWindowMode; rect:{x:number;y:number;width:number;height:number}; location:ColumnLocation}`. `clampChatRect(rect, viewport:{width:number;height:number}):rect`; persisted key содержит owner и только geometry/mode. Visibility Provider task 9 определяется фактическим режимом и gameplay surface.

- [ ] RED: open на >=832 не меняет URL места, dock subtracts 384 px, resize сохраняет выбранную крайнюю колонку. Drag/resize остаются в окне и управляются клавиатурой. 832→831 переводит открытый чат на штатный full-screen route с прежним return location; dismissed окно само не открывается от resize. Игровой экран принудительно сворачивает чат и восстанавливает preferredMode после выхода.
- [ ] Запустить `pnpm --filter @hockey/web exec vitest run src/chat/presentation/ChatWindow.test.tsx src/chat/presentation/chatWindowGeometry.test.ts src/layout/columnLayout.test.ts`; записать RED.
- [ ] Реализовать window controls, pointer capture, keyboard move/resize, focus return и безопасные размеры при visualViewport/экранной клавиатуре. Плавающее окно немодальное, без глобального focus trap; dialogs внутри него сохраняют штатный trap. Минимальный размер 320×320 px, фактический размер ограничивается доступным viewport. Dock допускается при достаточном месте под одну колонку; избыточные положения после resize clamp.
- [ ] GREEN тех же тестов; malformed localStorage, пользователь B после A, смена раздела во время drag и выход из аккаунта не оставляют listeners/состояние другого пользователя.
- [ ] Просмотреть diff, commit `feat: add floating and docked chat window`.

### Task 11: Общая приёмка, доступность и проверка поставки

**Files:** Create `docs/superpowers/verification/2026-10-21-responsive-wide-layout.md`; Modify только затронутые предыдущими задачами файлы, если проверка выявит дефект.
**Interfaces:** Финальный отчёт разделяет local tests, CI, browser acceptance и deployment. Тестовый локальный стенд использует mocks/API fixtures либо уже разрешённую тестовую сессию; никакого копирования токенов между окружениями или создания аккаунтов.

- [ ] Выполнить `pnpm --filter @hockey/game-core build` перед consumer checks, затем `pnpm typecheck`, `pnpm lint`, `pnpm --filter @hockey/web build` и `pnpm --filter @hockey/web test`. Изучить реальные FAIL/SKIP, не списывать их на baseline без доказательств. Серверный suite не нужен для client-only diff; если появляется изменение общего контракта, пересмотреть scope до продолжения.
- [ ] В браузере проверить семь мест на 390×844, 430×932, 834×1194, 1024×768, 1440×1024 и 1920×1080; на стадионе дополнительно пороги 831/832/1235/1236 и docked chat. Сохранить скриншоты и inspect каждого принятого снимка.
- [ ] Проверить direct link, Browser Back/Forward, внутренний Back, independent scroll, последний элемент над dock, мышь/касание, keyboard focus, reduced motion, формы профиля, unavailable training и locked bonus level. Закреплённый чат не должен менять права или выбранную страницу.
- [ ] Проверить пять игровых launch/return сценариев в разрешённом тестовом контуре. Если доступ отсутствует, явно отметить непроверенные сценарии; mock integration не объявлять живой игровой приёмкой. Отправку чата проверять в mocked harness без сообщений другим пользователям.
- [ ] Просмотреть весь diff на unintended changes, повторные подписки/мутации, широкие CSS selectors и появление экземпляров DailyScreen внутри колонок. Проверить отсутствие новых server/migration/dependency изменений, секретов и приватных переписок в артефактах.
- [ ] Записать точный проверенный SHA и результаты в verification report, commit `docs: record responsive layout verification`. Создание PR в dev возможно в разрешённом объёме, но не merge/push в dev и не deploy без отдельного разрешения. Прод не менять.

## Self-review перед передачей плана

- Геометрия и shared panorama: задачи 1, 3, 7; все семь мест: задачи 4–7.
- Независимые подробности, history/deep links: задачи 2, 4–6; gameplay/return: задача 8.
- Чат, visible/read/draft/socket и geometry/persistence: задачи 9–10.
- Ограничения доступа и мобильная регрессия: тесты задач 4–11; browser evidence: задача 11.
- Пять Review Focus случаев привязаны к конкретным RED/GREEN циклам выше. Генеративные макеты остаются только референсами.

## Перед началом исполнения

Пользователь просматривает этот план и выбирает метод исполнения. Рекомендация — выполнять последовательно в текущем чате без делегации: этапы зависят от общей навигации, а пользователь не разрешал дополнительных агентов. После утверждения использовать `superpowers:executing-plans`; настройку модели и reasoning не менять.
