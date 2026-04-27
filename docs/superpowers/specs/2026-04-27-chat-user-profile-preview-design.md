# Чат: превью профиля по тапу на аватарку — дизайн

**Дата:** 2026-04-27
**Ветка контекста:** `chat/sender-info-and-keyboard-resize` (WIP, ещё не смерджена)

## 0. Цель

В групповых и системных чатах при тапе на аватарку или имя автора сообщения открывается bottom-sheet с превью профиля и кнопкой «Написать в личку», которая через `findOrCreateDM` переводит юзера в DM с этим участником.

В DM ничего не меняется: собеседник уже известен по шапке.

## 1. Контекст

WIP-ветка добавила:
- В `ChatMessageDTO`: `senderDisplayName: string | null`, `senderAvatarUrl: string | null` (LEFT JOIN users в `getMessages` + `sendMessage`).
- В `ChatBubble.tsx`: рендер аватарки + имени над bubble в group-чатах через проп `showAuthor`.
- В `ChatRoomScreen.tsx`: `showAuthorOnBubbles = chatMeta?.type !== 'direct'`.

На сервере уже есть:
- `POST /chat/dm` → `findOrCreateDM(myId, otherUserId)` → `{ chatId, created }`.

Нет:
- Эндпоинта `GET /users/:id/profile` — добавим в подпроекте рейтинга вместе с lifetime stats.
- `/me` отдаёт только свой профиль.

## 2. Скоуп

В скоупе:
- Новый компонент `UserProfileSheet` (bottom-sheet).
- Кликабельная обёртка «аватар + имя» в `ChatBubble` (только foreign bubbles в group/system чатах).
- Состояние и переход в DM в `ChatRoomScreen`.
- Вынос общего `StatCard` из `ProfileScreen` в `packages/web/src/components/StatCard.tsx`.

Вне скоупа:
- Реальные статы в превью (плейсхолдеры `—`, до подпроекта рейтинга).
- Эндпоинт `GET /users/:id/profile`.
- Кликабельность аватарки собеседника в шапке DM.
- Кликабельность авторов в `SearchResultsDropdown` (глобальный поиск).

## 3. Архитектура

### 3.1 Компоненты

**Новый `UserProfileSheet.tsx`** (в `packages/web/src/chat/components/`):

Props:
```ts
interface UserProfileSheetProps {
  sender: { userId: string; displayName: string; avatarUrl: string | null } | null;
  onClose: () => void;
}
```

Компонент сам:
- Рендерится при `sender !== null`, через portal.
- Внутри хранит `useMutation` на `findOrCreateDM`.
- Подключает `useNavigate` из `react-router-dom`.
- На success мутации: invalidate `chatKeys.list()` если `created`, `navigate('/chat/' + chatId)`, `onClose()`.

Решение «sheet сам владеет мутацией» (а не через колбэк) — экономит проп-проброс из `ChatRoomScreen` и держит DM-flow инкапсулированным внутри.

**`ChatBubble.tsx` — изменения:**

Новый проп:
```ts
onOpenProfile?: (sender: { userId: string; displayName: string; avatarUrl: string | null }) => void;
```

Если `showAvatarAndName === true` и `onOpenProfile` определён, обёртка вокруг аватарки + имени становится `<button>` с `onClick={() => onOpenProfile({...})}`. Стилизация (фон/границы) не меняется — `button` сбрасывается до прежнего вида (`background:none; border:none; padding:0; cursor:pointer; text-align:left`).

Если `displayName === null` (удалённый юзер) — `disabled`, тап игнорируется.

`areEqual` дополнить полем `onOpenProfile`.

**`ChatRoomScreen.tsx` — изменения:**

Новый state:
```ts
const [previewSender, setPreviewSender] = useState<UserPickerItem | null>(null);
```

Стабильный коллбэк:
```ts
const onOpenProfile = useCallback((sender: UserPickerItem) => {
  setPreviewSender(sender);
}, []);
```

Прокидывается в `ChatBubble`. `<UserProfileSheet sender={previewSender} onClose={() => setPreviewSender(null)} />` рендерится в конце JSX (рядом с `MessageActionsMenu`).

### 3.2 Layout `UserProfileSheet`

```
[backdrop: position:fixed; inset:0; rgba(15,23,42,0.35); blur 8px; zIndex:300]
  ┌────────────────────────────────────────┐
  │ [grab handle 36×4 rgba(255,255,255,0.4)]│
  │                              [X close] │
  │                                        │
  │  ┌──────────┐                          │
  │  │   88px   │   Имя Фамилия            │  ← row
  │  │  avatar  │                          │
  │  └──────────┘                          │
  │                                        │
  │  ─── СТАТИСТИКА ─────                  │  ← section-label
  │  ┌──────────┐  ┌──────────┐            │
  │  │ Бросков  │  │  Голов   │            │
  │  │    —     │  │    —     │            │
  │  └──────────┘  └──────────┘            │
  │  ┌──────────┐  ┌──────────┐            │
  │  │ Точность │  │   Ранг   │            │
  │  │    —     │  │    —     │            │
  │  └──────────┘  └──────────┘            │
  │                                        │
  │  ┌────────────────────────────────┐    │
  │  │     Написать в личку           │    │  ← btn--cta full-width
  │  └────────────────────────────────┘    │
  └────────────────────────────────────────┘
```

Стили:
- Sheet: `position:fixed; left:0; right:0; bottom:0; max-height:80dvh; padding:16px 16px calc(16px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; background:` стандартный glass из `app/design-system.css`.
- Slide-up анимация: `transform: translateY(0)` с `transform: translateY(100%)` на mount/unmount, transition `0.2s ease`. Управляется через локальный state `mounted` + `useEffect`.
- Кнопка `X` в правом верхнем углу — `icon-btn` (как в `UserPickerModal`).
- Аватар 88px: `borderRadius:999`, fallback — initial на градиентном фоне (как в `ProfileScreen`).
- Кнопка «Написать»: `btn btn--cta`, `width:100%; padding:14px 0`. Текст: `isPending ? 'Открываем чат…' : 'Написать в личку'`. `disabled={isPending}`.

### 3.3 Поток данных

```
ChatBubble (avatar+name button onClick)
   → ChatRoomScreen.onOpenProfile(sender)
   → setPreviewSender(sender)
   → <UserProfileSheet sender={...} onClose={...} />  отрисовывается
        ↓ user taps "Написать"
   → mutation.mutate(sender.userId)
        ↓ success { chatId, created }
   → if created: queryClient.invalidateQueries(chatKeys.list())
   → navigate('/chat/' + chatId)
   → onClose()
        ↓
   ChatRoomScreen перемонтируется (новый chatId в URL)
```

## 4. Кликабельность в ChatBubble — детали DOM

Сейчас в WIP: аватар (`<img>` или `<div>`) и имя (`<span>`) — разные ноды на разных уровнях flex-разметки. Имя живёт внутри bubble-колонки, аватар — снаружи (рядом с bubble-колонкой).

Решение: оба элемента получают **раздельные** обработчики `onClick` (одна и та же функция). Объединять их в общий контейнер нельзя — это поломает flex-layout (аватар стоит сбоку, имя — сверху bubble-колонки).

Каждый из них становится `<button type="button">` с reset-стилями (`background:none; border:none; padding:0; cursor:pointer; font:inherit; color:inherit; text-align:left`). Long-press на bubble — отдельный DOM-узел, события не пересекаются.

## 5. Edge cases

| Случай | Поведение |
|---|---|
| Тап по своей аватарке | Не возникает: `showAvatarAndName = showAuthor && !isOwn` (WIP). |
| `senderId === me.id` (защита от регрессии) | Доп. guard: если `senderId === me.id` в `onOpenProfile` — игнорируем. Используем `useAuthStore` для `me.id`. |
| `senderDisplayName === null` (удалённый юзер) | Аватар + имя `disabled`, тап игнорируется. |
| Тап в системном чате (`chat.type === 'system'`) | Аватары + кликабельность остаются — пользователи там обычные участники, написать им в личку полезно. Системный «бот»-юзер ловится отдельно: см. ниже. |
| Системный отправитель (`SYSTEM_USER_ID`) | В системном чате сообщения от системы шлются от реального юзера (`SYSTEM_USER_ID`). MVP: обращаемся как с обычным юзером — кликабельность работает, DM с ним создастся. Это приемлемо для MVP (системный юзер — это чей-то аккаунт-владелец, можно ему написать). |
| `findOrCreateDM` упал | Кнопка возвращается в активное состояние, sheet остаётся открытым. `console.error` для логов. Toast-инфраструктуры в проекте нет — без UI-уведомления, как и в `UserPickerModal`. |
| DM уже существует | `findOrCreateDM` вернёт `created: false, chatId` → navigate происходит так же. |
| Юзер тапнул кнопку, и сразу backdrop | `onClose` срабатывает первым (event order), мутация уже отправлена в фоне. На success мы всё равно `navigate`. Это ожидаемо: пользователь сказал «открыть DM» — открываем. |

## 6. Тесты

**`ChatBubble.test.tsx` — новые кейсы:**
- При `showAuthor=true`, `isOwn=false`, `onOpenProfile` определён: тап по аватару вызывает `onOpenProfile` с `{userId, displayName, avatarUrl}` из message.
- При `senderDisplayName === null`: button рендерится с `disabled`, тап ничего не вызывает.
- Мемоизация: при изменении `onOpenProfile` бабл рендерится заново (`areEqual` проверяет проп).

**`UserProfileSheet.test.tsx` — новый файл:**
- При `sender !== null` рендерит displayName, avatar (или fallback initial), 4 StatCard плейсхолдера.
- Тап «Написать» → mock `findOrCreateDM` (msw или vi.mock) → `useNavigate` вызван с `/chat/<chatId>`, `onClose` вызван.
- Во время `isPending` кнопка disabled, текст «Открываем чат…».
- Тап по backdrop вызывает `onClose`.

## 7. Файлы

Тесты в проекте лежат в `packages/web/src/chat/test/` (не рядом с компонентами).

**Новые:**
- `packages/web/src/chat/components/UserProfileSheet.tsx`
- `packages/web/src/chat/test/UserProfileSheet.test.tsx`
- `packages/web/src/chat/test/ChatBubble.test.tsx` (для bubble сейчас тестов нет, добавляем для новых кейсов)
- `packages/web/src/components/StatCard.tsx` (вынос общего компонента)

**Изменённые:**
- `packages/web/src/chat/components/ChatBubble.tsx` — два кликабельных button-обёртки (аватар, имя), проп `onOpenProfile`, обновлённый `areEqual`.
- `packages/web/src/chat/screens/ChatRoomScreen.tsx` — `previewSender` state, прокидка в bubble, `<UserProfileSheet>` в JSX.
- `packages/web/src/screens/ProfileScreen.tsx` — заменить локальный `StatCard` импортом из общего модуля.

## 8. Открытые решения

Все решения зафиксированы в брейнсторме. Открытых вопросов нет.

## 9. Зависимости и порядок имплементации

1. Вынос `StatCard` → `packages/web/src/components/StatCard.tsx`. Обновить `ProfileScreen` на импорт.
2. `UserProfileSheet` + тест.
3. `ChatBubble`: button-обёртки + проп + areEqual + тест.
4. `ChatRoomScreen`: state, прокидка, рендер sheet'а.

Каждый шаг — отдельный коммит. PR — один (фича целиком).
