# Внутренний чат для Ultimate Hockey — дизайн-спецификация

> **Статус:** дизайн утверждён пользователем 2026-04-26. После выхода из plan mode этот документ копируется в `docs/superpowers/specs/2026-04-26-internal-chat-design.md`, коммитится, и затем создаётся имплементационный план через `superpowers:writing-plans`.

---

## 1. Контекст

В roadmap Ultimate Hockey (см. `CLAUDE.md`) после колеса призов и реферальной системы стоит фича «чат», и далее — турниры. Чат нужен для удержания (DM между игроками), системных уведомлений лиги и архитектурного задела под будущие чаты команд/турниров.

Спек-референс: `docs/CHAT_SPEC.md` (написан под Supabase + RLS + Realtime + Edge Functions). Наш стек — Fastify 4 + Postgres 16 + Redis 7 + ioredis + React 18 + Zustand + TanStack Query + react-router-dom v6 — без Supabase. Архитектурные принципы из спека переносятся, но RLS заменяется серверными guard'ами, а Realtime — собственным WebSocket-эндпоинтом поверх Redis pub/sub.

Главное ограничение фичи: **оптимизация под нагрузку на сервер** обязательная (см. §10 «Performance»). Дизайн UI следует существующему glassmorphism-стилю проекта (см. §7.6).

---

## 2. Скоуп MVP

**В скоупе:**
- DM 1-на-1 между любыми двумя зарегистрированными игроками.
- Системные каналы (например «Общий чат лиги») — создаются seed-скриптом / CLI; читают и пишут все авторизованные.
- Архитектурный задел под чаты команд/турниров (колонки `entity_type`, `entity_id` есть, но без FK; пользователь сейчас такие чаты сам не создаёт).
- Текстовые сообщения, цитата (reply), soft-delete своих сообщений.
- Эмоджи-реакции (один юзер может ставить несколько разных эмоджи на одно сообщение).
- Бейдж непрочитанных в `BottomNav` + per-chat `unreadCount` в списке чатов.
- Полнотекстовый поиск по своим чатам (PostgreSQL tsvector, словарь `russian`).
- Пагинация истории по `before`-курсору (50 за раз).
- Realtime через WebSocket + Redis pub/sub.

**Не в скоупе MVP:**
- Аттачменты любого вида (файл/картинка/голос) — нет файлового хранилища; добавим, когда заведём S3/R2.
- Юзер-инициированные группы — не выбраны, заводятся только админом из CLI.
- Typing-индикаторы — лишний WS-трафик при низком ROI.
- Per-user read-receipts «прочитано Васей» — храним только `last_read_at` per (chat, user); признак «кто-то ещё прочитал» вычисляется на чтении при необходимости.
- Hard-delete сообщений; только soft (`is_deleted=true`, `content=''`).
- Push-нотификации (отдельная фича).

---

## 3. БД (миграция `004_chat.sql`)

Все таблицы: `id uuid primary key default gen_random_uuid()`, snake_case, FK на `users(id) ON DELETE CASCADE`. Все timestamps — `timestamptz default now()`.

### 3.1 `chats`

| col | type | nullable | comment |
|---|---|---|---|
| `id` | uuid PK | no | — |
| `type` | text | no | CHECK in `('direct','group','system')` |
| `name` | text | yes | NULL для DM (рендерится из контрагента); обязательно для group/system |
| `created_by` | uuid FK→users | no | для system — uuid системного аккаунта или admin |
| `entity_type` | text | yes | задел: `'team'`, `'tournament'`, NULL |
| `entity_id` | uuid | yes | без FK (таблиц нет); при появлении team/tournament — добавим CHECK |
| `last_message_at` | timestamptz | yes | обновляется триггером |
| `is_active` | boolean | no, default true | soft delete чата |
| `created_at`, `updated_at` | timestamptz | no | — |

UNIQUE constraint: для DM нужно гарантировать «не больше одного `direct`-чата между парой A↔B». Реализуется через **partial unique index** на нормализованную пару `(LEAST(a,b), GREATEST(a,b))` через дополнительную колонку, либо через `findOrCreateDM` в транзакции с advisory lock (см. §6.4). В MVP — advisory lock, индекс не вводим.

### 3.2 `chat_members`

| col | type | nullable | comment |
|---|---|---|---|
| `id` | uuid PK | no | — |
| `chat_id` | uuid FK→chats CASCADE | no | — |
| `user_id` | uuid FK→users CASCADE | no | — |
| `role` | text | no, default `'member'` | `'admin'` ставится создателю |
| `last_read_at` | timestamptz | no, default now() | — |
| `joined_at` | timestamptz | no, default now() | — |

UNIQUE `(chat_id, user_id)`.

**Lazy-членство для системных каналов:** запись создаётся при первом `POST /chat/:chatId/read` или при первом `POST /chat/:chatId/messages` от данного юзера. До этого юзер видит системный канал в списке (через UNION в `getMyChats`), его `last_read_at` считается как момент создания канала + 0 (т.е. unread = все сообщения).

### 3.3 `messages`

| col | type | nullable | comment |
|---|---|---|---|
| `id` | uuid PK | no | — |
| `chat_id` | uuid FK→chats CASCADE | no | — |
| `sender_id` | uuid FK→users | no | без CASCADE: оставляем «orphan» сообщения если юзер удалится |
| `content` | text | no | при soft-delete пишем `''` |
| `reply_to_id` | uuid FK→messages ON DELETE SET NULL | yes | — |
| `is_deleted` | boolean | no, default false | — |
| `search_vector` | tsvector GENERATED ALWAYS AS `to_tsvector('russian', coalesce(content,''))` STORED | yes | — |
| `created_at`, `updated_at` | timestamptz | no | — |

### 3.4 `message_reactions`

| col | type | comment |
|---|---|---|
| `id` | uuid PK | — |
| `message_id` | uuid FK→messages CASCADE | — |
| `user_id` | uuid FK→users CASCADE | — |
| `emoji` | varchar(16) | один кодовый символ или составной |
| `created_at` | timestamptz | — |

UNIQUE `(message_id, user_id, emoji)`. Один юзер может ставить **несколько разных** эмоджи на одно сообщение.

### 3.5 Индексы

```sql
CREATE INDEX idx_chat_members_user           ON chat_members(user_id);
CREATE INDEX idx_chat_members_chat           ON chat_members(chat_id);
CREATE INDEX idx_messages_chat_created_alive ON messages(chat_id, created_at DESC) WHERE is_deleted = false;
CREATE INDEX idx_messages_reply              ON messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX idx_message_reactions_message   ON message_reactions(message_id);
CREATE INDEX idx_chats_last_message          ON chats(last_message_at DESC) WHERE is_active = true;
CREATE INDEX idx_messages_search             ON messages USING GIN(search_vector);
```

И один `pg_trgm` индекс для пикера юзеров (см. §10):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_display_name_trgm ON users USING GIN(display_name gin_trgm_ops);
```

### 3.6 Триггер

Один — `update_chat_last_message`:

```sql
CREATE OR REPLACE FUNCTION update_chat_last_message() RETURNS trigger AS $$
BEGIN
  UPDATE chats SET last_message_at = NEW.created_at, updated_at = now()
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_chat_last_message
AFTER INSERT ON messages FOR EACH ROW
EXECUTE FUNCTION update_chat_last_message();
```

Никаких `SECURITY DEFINER`, никаких хелпер-функций — RLS у нас нет, все проверки в TS-коде. Триггер `notify_chat_member_added` из спека — выпиливаем (нет таблицы `notifications` пока).

---

## 4. Контроль доступа

Без RLS. Все проверки — на уровне Fastify-роутов и WS-handler'ов. Централизованно в `packages/server/src/chat/guards.ts`:

```ts
export async function canAccessChat(
  db: Pool, userId: string, chatId: string
): Promise<{ chat: ChatRow; isMember: boolean } | null> {
  const chat = await getChatById(db, chatId);
  if (!chat || !chat.is_active) return null;
  if (chat.type === 'system') return { chat, isMember: false };
  const isMember = await checkMembership(db, userId, chatId);
  return isMember ? { chat, isMember: true } : null;
}

export async function assertCanAccessChat(...): Promise<ChatRow> {
  const result = await canAccessChat(...);
  if (!result) throw new Forbidden('chat_access_denied');
  return result.chat;
}

export async function assertOwnsMessage(db, userId, messageId): Promise<MessageRow> { ... }
```

Все `routes/chat/*` начинают с `await assertCanAccessChat(...)`. Никаких прямых JOIN-проверок «is_member» в SQL запросов на чтение/запись в эндпоинтах — гард единственный, тестируется отдельно.

---

## 5. Realtime: WebSocket + Redis pub/sub

### 5.1 Транспорт

- `@fastify/websocket` плагин.
- Эндпоинт `GET /chat/ws?token=<accessJWT>`. Браузерный `WebSocket()` не передаёт `Authorization`-header → JWT кладём в query string. Токен валидируем через ту же `verifyAccessToken` из `auth.ts` до `socket.send()`. На неудаче — `socket.close(4401, 'unauthorized')`.
- Heartbeat: сервер шлёт ping раз в 30s, ждёт pong 10s; иначе закрывает. Браузерный WS API сам делает ping/pong прозрачно — используем встроенное.

### 5.2 Redis-каналы — гибридная схема (главная оптимизация по нагрузке)

Два класса каналов:

**A. Per-user (для DM и group-чатов):**
- Канал: `chat:user:<userId>`
- При `INSERT messages` для чата с `type ∈ ('direct','group')`: SELECT всех `chat_members.user_id` → publish JSON в `chat:user:<id>` для каждого из них (fan-out на N members, обычно 2–30).
- WS-handler одного юзера подписан только на свой `chat:user:<userId>`.

**B. Per-system-channel (для системных каналов):**
- Канал: `chat:system:<chatId>`
- При `INSERT` в системный канал — **один** publish на `chat:system:<chatId>`.
- Каждый WS-клиент при коннекте получает список активных системных каналов (`chats WHERE type='system' AND is_active=true`) и подписывается на каждый `chat:system:<chatId>`.
- Это фундаментальная оптимизация: на сообщение в общий чат лиги делается **1 publish** вместо N (где N = всех 10k+ юзеров). Доставка по подписчикам — нативная Redis broadcast.

### 5.3 Плагин `plugins/realtime.ts`

```ts
// псевдокод
fastify.decorate('realtime', {
  publish(channel: string, event: ChatEvent): Promise<void>,
  subscribe(channel: string, handler: (e: ChatEvent) => void): UnsubscribeFn,
});
```

Внутри:
- **Два** ioredis-клиента: первый — обычный `app.redis` для GET/SET/INCR, второй — отдельный для SUBSCRIBE (ioredis требует разделять, sub-режим блокирует обычные команды).
- `subscribe()` поддерживает несколько хендлеров на один Redis-канал (внутренний роутер): первый sub в реальный Redis, последующие просто добавляются к локальному списку. Позволяет на одном инстансе сервера держать N WS-подключений к одному чату с одним Redis-subscribe.

### 5.4 События

Дискриминированный union:

```ts
type ChatEvent =
  | { type: 'message:new';     chatId: string; message: ChatMessage }
  | { type: 'message:deleted'; chatId: string; messageId: string }
  | { type: 'reaction:added';  chatId: string; messageId: string; userId: string; emoji: string }
  | { type: 'reaction:removed';chatId: string; messageId: string; userId: string; emoji: string }
  | { type: 'chat:read';       chatId: string; userId: string; lastReadAt: string }; // когда тот же юзер прочитал в другой вкладке
```

WS-фрейм наружу: `{ "v": 1, "event": ChatEvent }`. Версия — на случай миграции протокола.

### 5.5 Reconnect и rate limiting

- Клиент: exponential backoff 1s → 2s → 4s → ... → max 30s. На реконнекте — refetch `getMyChats` + если `activeChatId` есть, refetch последних 50 сообщений (могли пропустить).
- Rate limit на отправку: `INCR chat:rate:<userId>` с `EXPIRE 1`. Если значение > 5 — 429. Сделано как middleware на `POST /chat/:chatId/messages`.

---

## 6. Server API

### 6.1 Папочная структура

```
packages/server/src/
├── chat/
│   ├── routes.ts           Fastify-роуты, защита через app.authenticate
│   ├── ws.ts               WS-эндпоинт + handshake
│   ├── service.ts          getMyChats, sendMessage, addReaction, ...
│   ├── guards.ts           canAccessChat, assertOwnsMessage
│   ├── events.ts           publishToChat(chatId, event) — выбирает канал по type
│   ├── seed.ts             CLI: seedSystemChannel(name)
│   └── types.ts            ChatRow, MessageRow, ChatEvent, ChatMessage (DTO)
└── plugins/
    └── realtime.ts         pub/sub плагин (см. §5.3)
```

`app.ts` регистрирует: `errorsPlugin → dbPlugin → redisPlugin → realtimePlugin → authPlugin → routes`.

### 6.2 REST-эндпоинты

Все `[preHandler: app.authenticate]`. Возвращают JSON. Ошибки — стандартные `{ error: { code, message } }` через `errorsPlugin`.

| метод | путь | назначение |
|---|---|---|
| GET    | `/chat/list` | Мои чаты с last_message + unread_count |
| POST   | `/chat/dm` | `{ otherUserId }` → findOrCreateDM, returns `{chatId}` |
| GET    | `/chat/users?q=<query>&limit=20` | Пикер: trigram-поиск по `display_name`, исключает self |
| GET    | `/chat/:chatId/messages?before=<iso>&limit=50` | Пагинация |
| POST   | `/chat/:chatId/messages` | `{ content, replyToId? }`; rate-limit |
| DELETE | `/chat/messages/:messageId` | Soft-delete; только свои |
| POST   | `/chat/messages/:messageId/reactions` | `{ emoji }`; idempotent (UNIQUE) |
| DELETE | `/chat/messages/:messageId/reactions` | `{ emoji }` |
| POST   | `/chat/:chatId/read` | last_read_at = now(); lazy-upsert chat_members |
| GET    | `/chat/search?q=<query>&limit=50` | Полнотекст по своим чатам |
| GET    | `/chat/unread` | `{ chatId: count }` для бейджа (с Redis-кешем) |
| GET    | `/chat/ws?token=<jwt>` | WS upgrade |

### 6.3 `getMyChats` — критический запрос

Один SQL без N+1. LATERAL JOIN для последнего сообщения per chat:

```sql
WITH my_chat_ids AS (
  SELECT chat_id FROM chat_members WHERE user_id = $1
  UNION
  SELECT id FROM chats WHERE type = 'system' AND is_active = true
)
SELECT
  c.*,
  cm.last_read_at,
  lm.id AS last_message_id,
  lm.content AS last_message_content,
  lm.sender_id AS last_message_sender_id,
  lm.created_at AS last_message_created_at,
  lm.is_deleted AS last_message_is_deleted,
  COALESCE(unread.count, 0) AS unread_count
FROM chats c
LEFT JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
LEFT JOIN LATERAL (
  SELECT id, content, sender_id, created_at, is_deleted
  FROM messages
  WHERE chat_id = c.id AND is_deleted = false
  ORDER BY created_at DESC
  LIMIT 1
) lm ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS count
  FROM messages m
  WHERE m.chat_id = c.id
    AND m.is_deleted = false
    AND m.sender_id != $1
    AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamptz)
) unread ON true
WHERE c.id IN (SELECT chat_id FROM my_chat_ids)
  AND c.is_active = true
ORDER BY c.last_message_at DESC NULLS LAST;
```

Дальше: для DM — отдельный запрос по `chat_members` (исключая self) для имени собеседника + аватара (один SQL: `WHERE chat_id = ANY($1::uuid[])` + group в TS).

### 6.4 `findOrCreateDM`

Реализуется в транзакции с advisory lock на детерминированном хеше пары:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended(LEAST($1,$2)::text || GREATEST($1,$2)::text, 0));
-- 1. Поиск существующего DM
SELECT c.id FROM chats c
JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = $1
JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = $2
WHERE c.type = 'direct' AND c.is_active = true LIMIT 1;
-- 2. Если нет — создать chat + 2 chat_members
COMMIT;
```

Lock гарантирует, что параллельные клики «написать игроку B» от A не создадут два DM.

### 6.5 Поиск сообщений

```sql
SELECT m.id, m.chat_id, m.content, u.display_name AS sender_name, m.created_at
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.chat_id IN (
  SELECT chat_id FROM chat_members WHERE user_id = $1
  UNION
  SELECT id FROM chats WHERE type = 'system' AND is_active = true
)
  AND m.is_deleted = false
  AND m.search_vector @@ plainto_tsquery('russian', $2)
ORDER BY m.created_at DESC
LIMIT $3;
```

### 6.6 Seed CLI

`packages/server/src/chat/seed.ts` — функция `seedSystemChannel(name: string)`. Запускается через `tsx packages/server/src/chat/seed.ts "Общий чат лиги"`. Создаёт `chat` с `type='system'`, `created_by=<system_user_uuid>` (читаем из env `SYSTEM_USER_ID`, генерируем при первом запуске и сохраняем в БД). Идемпотентно: если канал с таким `name` уже есть — no-op.

---

## 7. Web frontend

### 7.1 Папочная структура

```
packages/web/src/
├── chat/
│   ├── api.ts                  через apiFetch
│   ├── ws.ts                   ChatSocket: connect, reconnect, on/off
│   ├── chatStore.ts            Zustand: unreadByChat, totalUnread, activeChatId
│   ├── screens/
│   │   ├── ChatListScreen.tsx
│   │   └── ChatRoomScreen.tsx
│   └── components/
│       ├── ChatListItem.tsx
│       ├── ChatBubble.tsx       React.memo с явным компаратором
│       ├── ChatInput.tsx
│       ├── ReactionPicker.tsx
│       ├── MessageActions.tsx   long-press / right-click меню
│       ├── ReplyPreview.tsx
│       ├── SearchModal.tsx
│       └── UserPickerModal.tsx
└── lib/
    └── queryKeys.ts            расширяется chatKeys
```

### 7.2 Маршруты

В `App.tsx` под `<PrivateRoute>`:

| path | screen |
|---|---|
| `/chat` | `ChatListScreen` |
| `/chat/new` | `ChatListScreen` + открытая `UserPickerModal` (через query-param `?new=1`) |
| `/chat/:chatId` | `ChatRoomScreen` |

Существующий `BottomNav` дополняется иконкой «Чаты» (Lucide `MessageCircle`) с бейджем непрочитанных.

### 7.3 `chatStore` (Zustand)

```ts
interface ChatStore {
  unreadByChat: Record<string, number>;
  totalUnread: number;            // computed
  activeChatId: string | null;
  setActive(chatId: string | null): void;
  setUnread(map: Record<string, number>): void;     // bulk init
  incrementUnread(chatId: string): void;
  resetUnread(chatId: string): void;
  applyEvent(event: ChatEvent): void;               // из ws.ts
}
```

`activeChatId` — обычная стейт-поле (а не useRef как в KJ CRM): селекторы Zustand через `shallow` не вызывают каскадных ререндеров, в отличие от React Context.

### 7.4 `ChatSocket` (`ws.ts`)

Класс с auto-reconnect. Держит ровно один WebSocket. EventEmitter-наружу. На каждом `event` — диспатч в `chatStore.applyEvent` + queryClient-патчи:

- `message:new` → `setQueryData(chatKeys.messages(chatId), ...)` — добавление в начало; `chatStore.incrementUnread(chatId)` если `chatId !== activeChatId && message.senderId !== self`.
- `message:deleted` → `setQueryData` патч `is_deleted=true, content=''`.
- `reaction:*` → точечный `invalidateQueries(chatKeys.reactions(messageId))`.
- `chat:read` → `chatStore.resetUnread(chatId)` если `userId === self` (другая вкладка прочитала).

### 7.5 React Query keys

```ts
// lib/queryKeys.ts
export const chatKeys = {
  all: ['chat'] as const,
  list: () => [...chatKeys.all, 'list'] as const,
  messages: (chatId: string) => [...chatKeys.all, 'messages', chatId] as const,
  reactions: (messageId: string) => [...chatKeys.all, 'reactions', messageId] as const,
  search: (q: string) => [...chatKeys.all, 'search', q] as const,
  users: (q: string) => [...chatKeys.all, 'users', q] as const,
};
```

`staleTime`: list — 30s, messages — `Infinity` (обновляется WS-патчами), users-picker — 60s.

### 7.6 Стиль — glassmorphism (как остальной проект)

Дизайн-фундамент — то же самое стекло, что и в `DailyScreen` / `ProfileScreen` / `LoginScreen`. Никаких новых CSS-переменных — переиспользуем готовые из `packages/web/src/app/global.css` и `design-system.css`.

**Канва:**
- Фон экрана — мягкий gradient-фон проекта (тот же что в shell).
- Шапка — `.header-bar` (готовый класс), title в `.header-bar__title`.
- Низ — существующий `BottomNav` (тёмное стекло `.glass-dark` + pill).

**Список чатов (`ChatListScreen`):**
- Каждый `ChatListItem` — `.glass` карточка с `--r-lg` (20px), `--shadow-glass`, `--blur-md`. Аватар собеседника слева (40×40, `border-radius: 50%`); имя + `last_message_content` truncated в две строки; справа — `last_message_at` (`.muted` стиль) и `unreadCount` через `.pill` с акцентным цветом `--red`.
- Системные каналы — та же `.glass` карточка, но с акцентной полоской `--blue-accent` слева для отличия.
- Между карточками — `gap: 12px`.

**Комната (`ChatRoomScreen`):**
- Фон — общий gradient.
- Свои сообщения — `.glass-dark` пузырь (тёмное стекло, белый текст), выровнены справа, `border-radius: var(--r-lg) var(--r-lg) 4px var(--r-lg)`.
- Чужие — `.glass` (светлое стекло), слева, `border-radius: var(--r-lg) var(--r-lg) var(--r-lg) 4px`.
- Reply-preview внутри пузыря — `--r-sm` (12px), opacity 0.7, цветная вертикальная полоска `--blue-accent` слева.
- Реакции под пузырём — горизонтальная строка `.pill` элементов (эмоджи + count). Своя реакция — `.pill--dark` или `.chip--active`.
- `ChatInput` снизу — `.glass-dark` контейнер, текстарея auto-grow, кнопка отправки `.btn--cta`.
- Меню действий (long-press / right-click) — `.glass` floating panel с `--shadow-elev`, иконки Lucide.
- `SearchModal` — `.glass-dark` modal, инпут с дебаунсом 300ms, результаты — список `.glass` карточек.

**Анимации:**
- Появление нового сообщения — opacity fade-in 200ms + slide-up 8px.
- Реакции — micro-bounce при добавлении (CSS keyframes).
- Reconnect-баннер — slim `.glass-dark` плашка сверху с прозрачностью при offline.

**Доступность:** контраст текста проверяется через WebAIM на обоих типах стекла (на белом и тёмном blur background). При проблеме — добавляем тонкую `text-shadow` для читаемости поверх blur.

Иконки — `lucide-react`: `MessageCircle`, `Smile`, `Reply`, `Trash2`, `Search`, `Send`, `ArrowLeft`, `Plus`. Без эмоджи в коде/тестах (только в picker'е реакций как пользовательский ввод).

---

## 8. Безопасность

- Все REST-эндпоинты под `app.authenticate`.
- WS-handshake: JWT в `?token=`. На server-side тот же `verifyAccessToken` из `plugins/auth.ts`. На неудаче — close(4401).
- `assertCanAccessChat` обязателен **перед каждой операцией чата** (чтение, запись, реакция, прочтение). Тестируется отдельно как unit + integration (юзер A не может прочесть/писать/реагировать в чате B).
- `INSERT messages`: `sender_id` берётся **только** из `req.user.id`, никогда не из тела запроса.
- Soft-delete: при `DELETE /chat/messages/:id` — `is_deleted=true`, **`content=''`**. Иначе админ из БД увидит «удалённый» текст.
- Rate-limit на отправку (см. §5.5). Защита от спама.
- Длина `content`: server-side validation `z.string().min(1).max(4000)`. Клиент — input maxlength + visual counter после 3500.
- Защита от внедрения HTML: на фронте всё рендерится как обычный текст через React (никаких raw-HTML вставок). Эмоджи — только из whitelisted picker'а на бэке.
- WS sender spoofing: при publish событие включает `senderId`, но клиент **не доверяет** ему — только смотрит по своему JWT, кто ты. Передача senderId — для отображения имени отправителя.

---

## 9. Тесты

**Server (vitest + `app.inject()`):**
- `chat/guards.test.ts` — изолированно: A не имеет доступа к B-шному чату; user не может удалить чужое сообщение; system-channel доступен любому авторизованному.
- `chat/routes.test.ts` — все REST-эндпоинты, happy + 403 + 404 + 429 (rate limit).
- `chat/ws.test.ts` — handshake (валидный/невалидный JWT), доставка `message:new` от Redis publish.
- `chat/service.test.ts` — `getMyChats` корректно собирает список (с/без unread, с system + DM); `findOrCreateDM` идемпотентно; `searchMessages` фильтрует по доступу.
- Используем поднятый Postgres `hockey_test` + Redis (как в существующих интеграционных тестах сервера).

**Web (vitest + jsdom + testing-library):**
- `chatStore.test.ts` — reducer-логика: `applyEvent` корректно обновляет state.
- `ChatRoomScreen.test.tsx` — рендер сообщений из mock query, отправка, реплай-флоу (без реального WS).
- `BottomNav.test.tsx` — бейдж пересчитывается при изменении `totalUnread`.
- WS-клиент изолированно с `vi.fn()`-моком WebSocket.

---

## 10. Performance / нагрузка на сервер

Решения, специально выбранные под оптимизацию:

1. **Гибридный fan-out для realtime** (см. §5.2). Per-user канал для DM/group (где N ≤ 30), per-channel broadcast для системных каналов (где N может быть 10k+). Это **главная** оптимизация — без неё сообщение в общий чат лиги делает 10k publish-ей.
2. **`getMyChats` одним SQL** через LATERAL JOIN (см. §6.3). Без N+1, без `Promise.all([...4 запроса])` как в Supabase-версии.
3. **Redis-кеш unread** для `GET /chat/unread`: ключ `chat:unread:<userId>`, TTL 10s, JSON `{[chatId]: count}`. Кеш инвалидируется WS-инкрементом (`chat:unread:<userId>:dirty=1` set→TTL 10s, на следующем `GET` — пересчёт). На загрузке списка чатов — переиспользуем то же значение.
4. **Партиальный индекс** `messages(chat_id, created_at DESC) WHERE is_deleted=false` — не ходит по soft-deleted сообщениям, экономит I/O.
5. **`pg_trgm` GIN на `users.display_name`** — пикер юзеров через `WHERE display_name ILIKE '%query%'` идёт по индексу, не seq scan на 10k+ юзерах. Минус: индекс прибавляет ~10–15% к INSERT в `users`, что некритично (юзеры регистрируются редко).
6. **Батч-загрузка реакций** в `GET /chat/:id/messages`: один `SELECT * FROM message_reactions WHERE message_id = ANY($1::uuid[])` за все 50 сообщений сразу, группировка в TS. Не N+1.
7. **WS heartbeat + idle-cleanup** — мёртвые connections отстреливаются за 60s, не копятся.
8. **Rate limit на POST messages** — предотвращает спам-DoS.
9. **Pagination через `before`-cursor** на `(chat_id, created_at DESC)` — index-only scan, не offset (offset на тысячах сообщений деградирует).
10. **`react-query` агрессивные `staleTime`** + WS-патчи вместо refetch — клиент не дёргает сервер во время активной комнаты.
11. **`React.memo` с явным компаратором** на `ChatBubble` — клавиатурный ввод в `ChatInput` не триггерит ререндер всех 50 пузырей в комнате.
12. **Один Redis subscribe на канал на инстанс** — несколько локальных WS-handler'ов одного юзера (две вкладки) разделяют один Redis sub.
13. **Системный канал — lazy chat_members**: при 10k юзеров нет 10k INSERT-ов в `chat_members` при создании канала. Запись появляется только при первом `markAsRead` юзера.

Что **не** делаем в MVP, но запланируем при первом признаке:
- Шардирование Redis pub/sub каналов (если общий чат лиги станет проблемой).
- Postgres connection pool tuning (если RPS вырастет).
- Pre-aggregated `chat_unread_summary` таблица (если Redis-кеш unread станет dirty слишком часто).

---

## 11. План мини-PR-ов

Каждый PR — самостоятельно green CI и проверяемый вручную.

1. **Migration + types + seed CLI.** `004_chat.sql`, `chat/types.ts`, `chat/seed.ts` + один CLI вызов в README.
2. **Guards + REST routes + service.** Без WS. Тесты на guards + happy-path для всех REST.
3. **Realtime plugin + WS endpoint.** `plugins/realtime.ts` + `chat/ws.ts` + событийный publish из `service.ts`. Интеграционный WS-тест.
4. **Web: api.ts + chatStore + ChatListScreen + ChatRoomScreen** без realtime (через query stale-time). Glassmorphism-стиль уже здесь.
5. **Web: ChatSocket + бейдж в BottomNav.** Полный realtime-цикл.
6. **Реакции** (server endpoints + ReactionPicker + group-by-emoji UI).
7. **Полнотекстовый поиск** (`/chat/search` + `SearchModal` + debounce 300ms).
8. **Long-press / right-click меню**, reply preview, soft-delete UX.

---

## 12. Файлы, которые будут созданы/изменены

**Создаются:**
- `packages/server/db/migrations/004_chat.sql`
- `packages/server/src/chat/{routes,ws,service,guards,events,seed,types}.ts`
- `packages/server/src/plugins/realtime.ts`
- `packages/server/test/chat/{guards,routes,ws,service}.test.ts`
- `packages/web/src/chat/{api,ws,chatStore}.ts`
- `packages/web/src/chat/screens/{ChatListScreen,ChatRoomScreen}.tsx`
- `packages/web/src/chat/components/*.tsx` (см. §7.1)
- `packages/web/src/chat/test/*.test.tsx`

**Меняются:**
- `packages/server/src/app.ts` — регистрация `realtimePlugin` + `chat/routes` + `chat/ws`.
- `packages/server/package.json` — `@fastify/websocket` в `dependencies`.
- `packages/server/src/config.ts` — env `SYSTEM_USER_ID` (uuid системного аккаунта).
- `packages/web/src/app/App.tsx` — три новых маршрута под `PrivateRoute`.
- `packages/web/src/components/BottomNav.tsx` (или где он сейчас) — иконка «Чаты» с бейджем.
- `packages/web/src/lib/queryKeys.ts` — `chatKeys`.
- `CLAUDE.md` — короткая секция «Chat» в Architecture (≤200 строк держим).

---

## 13. Verification (как тестировать end-to-end)

Локально:

```bash
# 1. Поднять инфру
brew services start postgresql@16 && brew services start redis

# 2. Прогнать миграцию
pnpm --filter @hockey/server db:migrate

# 3. Создать системный канал
tsx packages/server/src/chat/seed.ts "Общий чат лиги"

# 4. Поднять dev-серверы
pnpm dev:server  # :3000
pnpm dev:web     # :5173

# 5. Залогиниться двумя юзерами в двух вкладках (через /auth/dev на dev-кнопке)
#    Юзер A пишет юзеру B → проверить:
#      - сообщение появляется у B мгновенно (WS)
#      - бейдж BottomNav у B инкрементируется
#      - реакция у обоих синхронно
#      - реплай и soft-delete работают
#      - системный канал виден обоим
#      - дизайн совпадает с DailyScreen (стекло, радиусы, цвета)

# 6. Тесты
pnpm --filter @hockey/server test
pnpm --filter @hockey/web test

# 7. Проверка изоляции (security)
#    Юзер C пытается через DevTools-fetch с своим JWT прочитать /chat/<chatId>/messages для чата A↔B → 403
```

CI:
- `build-and-test` job уже стартует Postgres + Redis services — ничего не меняем.
- Smoke-test после деплоя — оставляем `GET /api/health` (новые WS не покрываем smoke'ом, добавим если будут проблемы).

---

## 14. Открытые вопросы / задел на v2

- **Аттачменты**: требует S3/R2/MinIO. Когда заведём storage — добавим миграцию `005_chat_attachments.sql` с JSONB `messages.attachments` + edge-функция/route `POST /chat/:id/attachment` с presigned URL.
- **Чаты команд/турниров**: колонки `entity_type`/`entity_id` уже заложены. Когда появятся таблицы `teams` / `tournaments` — добавим CHECK constraint и автоматическое создание чата при создании сущности.
- **Push-уведомления**: отдельная фича (Web Push API + service worker). Чат публикует событие, push-сервис подхватывает.
- **Typing indicators / read-receipts** — пока нет.
- **Шардирование realtime**: на >100k юзеров и активном общем канале — рассмотреть Redis Cluster с consistent hashing channels.
