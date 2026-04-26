# Внутренний мессенджер — переносимая спецификация

Документ для Клода **в другом проекте**: дать его как контекст и попросить «реализуй чат по этому спеку, адаптируя имена таблиц/ролей под наш проект». Не копипаста — это архитектурный план + список граблей. Реальная имплементация лежит в `KJ CRM` (`src/services/chatMessaging.ts`, `src/contexts/ChatContext.tsx`, `src/pages/shared/Chat*`, `supabase/migrations/20260411_chat_tables.sql`, `supabase/migrations/20260413_chat_v2.sql`) — оттуда можно подсмотреть конкретные SQL/TS, но переиспользовать как **референс**, а не как drop-in.

> Стек, под который писался оригинал: **React 18 + Vite + TypeScript strict + Supabase (Postgres + RLS + Realtime + Edge Functions S3-прокси) + @tanstack/react-query v5 + TailwindCSS**. Если стек у вас другой — переноси принципы, не код.

---

## 0. Что должно получиться (фича-скоуп)

Мессенджер «как Telegram-lite внутри приложения»:

- Групповые чаты (`type='group'`) и личные (`type='direct'`, DM 1-на-1).
- Любая роль может создавать чат и приглашать участников (исходный спек был «только staff», v2 это снял — см. §3.1).
- Сообщения: текст, цитата (reply), soft-delete, вложения (файл/картинка/голосовое), реакции (мульти-эмоджи на одно сообщение от одного юзера).
- Realtime: новые сообщения, реакции, статус прочитанности, бейдж непрочитанных в навигации.
- Полнотекстовый поиск по своим чатам.
- Аватар чата: для group — загружается; для DM — берётся из аватара собеседника (вычисляемое поле, в БД не хранится).
- Глобальный счётчик непрочитанных через `ChatContext`, обновляется через RPC и инкрементами по realtime-INSERT.

Чего **нет** и почему:
- **Нет typing indicators** — Realtime presence стоит трафика, ROI низкий.
- **Нет отдельных «прочитано конкретно этим юзером»**: храним только `chat_members.last_read_at` per (chat, user). Признак «прочитано хоть кем-то ещё» вычисляется на чтении.
- **Нет hard-delete сообщений** — только soft (`is_deleted=true`, `content=''`).

---

## 1. Схема БД

Четыре таблицы. Все колонки в snake_case, PK — UUID. FK на `users(id)` подразумевает, что у вас есть таблица пользователей (или используйте `auth.users(id)` Supabase напрямую).

### 1.1 `chats`

| col | тип | nullable | default |
|---|---|---|---|
| `id` | UUID | no | `uuid_generate_v4()` |
| `name` | VARCHAR(255) | no | — |
| `type` | VARCHAR(20) | no | `'group'` (CHECK in `'group'`, `'direct'`) |
| `created_by` | UUID FK→users | no | — |
| `avatar_url` | TEXT | yes | NULL (только для group; для DM подставляется на чтении) |
| `last_message_at` | TIMESTAMPTZ | yes | `NOW()` |
| `is_active` | BOOLEAN | yes | `true` (soft delete) |
| `created_at`, `updated_at` | TIMESTAMPTZ | yes | `NOW()` |

### 1.2 `chat_members`

| col | тип | nullable | default |
|---|---|---|---|
| `id` | UUID PK | no | `uuid_generate_v4()` |
| `chat_id` | UUID FK→chats `ON DELETE CASCADE` | no | — |
| `user_id` | UUID FK→users `ON DELETE CASCADE` | no | — |
| `role` | VARCHAR(20) | no | `'member'` (значения: `'admin'`, `'member'`) |
| `last_read_at` | TIMESTAMPTZ | yes | `NOW()` |
| `joined_at` | TIMESTAMPTZ | yes | `NOW()` |
| **UNIQUE** | `(chat_id, user_id)` | | |

`role='admin'` ставится **создателю** при создании чата. Не путать с глобальной ролью пользователя. Админ чата может удалять участников.

### 1.3 `messages`

| col | тип | nullable | default |
|---|---|---|---|
| `id` | UUID PK | no | `uuid_generate_v4()` |
| `chat_id` | UUID FK→chats `ON DELETE CASCADE` | no | — |
| `sender_id` | UUID FK→users | no | — |
| `content` | TEXT | no | — (при soft-delete пишется `''`) |
| `attachments` | JSONB | yes | NULL (массив `ChatAttachment`, см. §6.2) |
| `reply_to_id` | UUID FK→messages `ON DELETE SET NULL` | yes | NULL |
| `is_deleted` | BOOLEAN | yes | `false` |
| `search_vector` | tsvector GENERATED ALWAYS AS `to_tsvector('russian', coalesce(content,''))` STORED | yes | — |
| `created_at`, `updated_at` | TIMESTAMPTZ | yes | `NOW()` |

`reply_to_id` через `ON DELETE SET NULL` — если процитированное сообщение удалят, цитата не сломается (в UI просто покажется пустая ссылка).

### 1.4 `message_reactions`

| col | тип | default |
|---|---|---|
| `id` | UUID PK | `uuid_generate_v4()` |
| `message_id` | UUID FK→messages `ON DELETE CASCADE` | — |
| `user_id` | UUID FK→users `ON DELETE CASCADE` | — |
| `emoji` | VARCHAR(10) | — |
| `created_at` | TIMESTAMPTZ | `NOW()` |
| **UNIQUE** | `(message_id, user_id, emoji)` | |

Один юзер может ставить **несколько разных** эмоджи на одно сообщение — UNIQUE по тройке, не по паре.

### 1.5 Индексы

Без них чат-лист на 200+ чатах сразу ляжет:

```sql
CREATE INDEX idx_chat_members_user        ON chat_members(user_id);
CREATE INDEX idx_chat_members_chat        ON chat_members(chat_id);
CREATE INDEX idx_messages_chat_created    ON messages(chat_id, created_at DESC);
CREATE INDEX idx_messages_reply           ON messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX idx_chats_last_message       ON chats(last_message_at DESC);
CREATE INDEX idx_messages_search          ON messages USING GIN(search_vector);
```

Ключевой — составной `(chat_id, created_at DESC)`: пагинация «последние 50 сообщений в чате».

---

## 2. RLS — критическая часть

**Без RLS чат сломан**. Любой юзер сможет читать чужие сообщения через REST. Включи RLS на всех 4 таблицах:

```sql
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
```

### 2.1 Anti-recursion: SECURITY DEFINER хелперы

Если политика `messages.SELECT` пишет `chat_id IN (SELECT chat_id FROM chat_members WHERE user_id=auth.uid())`, а на `chat_members.SELECT` тоже есть RLS — **бесконечная рекурсия**, запрос упадёт (`infinite recursion detected in policy for relation`).

Решение — обернуть в `SECURITY DEFINER` хелпер (выполняется от owner функции, RLS не применяется к её внутренностям):

```sql
CREATE OR REPLACE FUNCTION get_my_chat_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT chat_id FROM chat_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_chat_admin(p_chat_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_members
    WHERE chat_id=p_chat_id AND user_id=auth.uid() AND role='admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_chat_creator(p_chat_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT EXISTS (SELECT 1 FROM chats WHERE id=p_chat_id AND created_by=auth.uid());
$$;
```

Все политики ниже ссылаются на эти хелперы — **никаких прямых join-ов в политиках**.

### 2.2 Политики

```sql
-- CHATS
CREATE POLICY chats_select_member ON chats FOR SELECT
  USING (id IN (SELECT get_my_chat_ids()));

CREATE POLICY chats_insert_any ON chats FOR INSERT
  WITH CHECK (created_by = auth.uid());     -- любая авторизованная роль

CREATE POLICY chats_update_creator ON chats FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY chats_delete_creator ON chats FOR DELETE
  USING (created_by = auth.uid());

-- CHAT_MEMBERS
CREATE POLICY chat_members_select ON chat_members FOR SELECT
  USING (chat_id IN (SELECT get_my_chat_ids()));

CREATE POLICY chat_members_insert_any ON chat_members FOR INSERT
  WITH CHECK (chat_id IN (SELECT get_my_chat_ids()) OR is_chat_creator(chat_id));
  -- "OR is_chat_creator": в момент создания чата создатель ещё не в members,
  -- но уже в chats.created_by — иначе нельзя добавить самого себя первым

CREATE POLICY chat_members_delete_admin ON chat_members FOR DELETE
  USING (is_chat_admin(chat_members.chat_id));

CREATE POLICY chat_members_update_own ON chat_members FOR UPDATE
  USING (user_id = auth.uid());     -- только свой last_read_at

-- MESSAGES
CREATE POLICY messages_select_member ON messages FOR SELECT
  USING (chat_id IN (SELECT get_my_chat_ids()));

CREATE POLICY messages_insert_member ON messages FOR INSERT
  WITH CHECK (chat_id IN (SELECT get_my_chat_ids()) AND sender_id = auth.uid());

CREATE POLICY messages_update_own ON messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY messages_update_creator ON messages FOR UPDATE
  USING (is_chat_creator(messages.chat_id));   -- удалить любое в своём чате

-- REACTIONS
CREATE POLICY reactions_select_member ON message_reactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_reactions.message_id
      AND m.chat_id IN (SELECT get_my_chat_ids())
  ));

CREATE POLICY reactions_insert_member ON message_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_reactions.message_id
      AND m.chat_id IN (SELECT get_my_chat_ids())
  ));

CREATE POLICY reactions_delete_own ON message_reactions FOR DELETE
  USING (user_id = auth.uid());
```

### 2.3 Грабли RLS, на которых горели

1. **`.insert().select()` ловушка.** Supabase-js по умолчанию делает `INSERT ... RETURNING *`. PG проверяет SELECT-политику на возвращённой строке. Если SELECT требует «быть в `chat_members`», а INSERT в `chats` происходит **до** добавления в members — RETURNING упадёт. Решение: в `chats.SELECT` не требуй членства напрямую (у нас оно через `get_my_chat_ids()` — это не помогает). Альтернатива — дополнительная политика `chats_select_creator` на `created_by=auth.uid()`. У нас в проекте применено отдельной миграцией `20260413_chat_select_creator_fix.sql`.
2. **`SET search_path = public, extensions`** обязателен внутри `SECURITY DEFINER` функций, иначе при self-hosted Supabase pgcrypto ищется не там и `auth.uid()` может резолвится непредсказуемо.
3. **`STABLE`** на хелперах — критично для производительности: PG кеширует результат внутри одного запроса.

---

## 3. Триггеры

```sql
-- 1. last_message_at — обновляется на каждое INSERT в messages
CREATE OR REPLACE FUNCTION update_chat_last_message() RETURNS trigger AS $$
BEGIN
  UPDATE chats SET last_message_at = NEW.created_at, updated_at = NOW()
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions;

CREATE TRIGGER trg_update_chat_last_message
AFTER INSERT ON messages FOR EACH ROW
EXECUTE FUNCTION update_chat_last_message();

-- 2. Уведомление при добавлении в чат
CREATE OR REPLACE FUNCTION notify_chat_member_added() RETURNS trigger AS $$
DECLARE v_chat_name VARCHAR(255);
BEGIN
  SELECT name INTO v_chat_name FROM chats WHERE id = NEW.chat_id;
  IF NEW.user_id != auth.uid() THEN
    INSERT INTO notifications (user_id, type, title, body, metadata) VALUES (
      NEW.user_id, 'announcement',
      'Новый чат', 'Вы добавлены в чат "' || v_chat_name || '"',
      jsonb_build_object('chat_id', NEW.chat_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions;

CREATE TRIGGER trg_notify_chat_member_added
AFTER INSERT ON chat_members FOR EACH ROW
EXECUTE FUNCTION notify_chat_member_added();
```

Если в новом проекте нет таблицы `notifications` — выпили второй триггер или адаптируй под свою систему уведомлений.

---

## 4. RPC

### 4.1 `get_unread_message_counts(p_user_id UUID)`

```sql
CREATE OR REPLACE FUNCTION get_unread_message_counts(p_user_id UUID)
RETURNS TABLE(chat_id UUID, unread_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT m.chat_id, COUNT(m.id) AS unread_count
  FROM messages m
  JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = p_user_id
  WHERE m.created_at > cm.last_read_at
    AND m.sender_id != p_user_id
    AND m.is_deleted = false
  GROUP BY m.chat_id;
$$;
```

Вызывается с клиента: `supabase.rpc('get_unread_message_counts', { p_user_id })`. Возвращает только чаты с unread > 0.

### 4.2 `search_messages(p_user_id, p_query, p_limit)`

Полнотекст по `search_vector`, ограничен своими чатами:

```sql
CREATE OR REPLACE FUNCTION search_messages(p_user_id UUID, p_query TEXT, p_limit INT DEFAULT 50)
RETURNS TABLE(id UUID, chat_id UUID, content TEXT, sender_name TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT m.id, m.chat_id, m.content,
         u.last_name || ' ' || u.first_name AS sender_name, m.created_at
  FROM messages m
  JOIN users u ON u.id = m.sender_id
  WHERE m.chat_id IN (SELECT get_my_chat_ids())
    AND m.is_deleted = false
    AND m.search_vector @@ plainto_tsquery('russian', p_query)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
$$;
```

Адаптируй под свой словарь (`'russian'`/`'english'`/`'simple'`) и под структуру `users`.

---

## 5. Realtime publication

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
-- chat_members добавь только если нужны live read-receipts
ALTER PUBLICATION supabase_realtime ADD TABLE chat_members;
```

**Важно:** клиент должен фильтровать на стороне сервера, не на клиенте. Иначе при 1000 чатах на проекте каждый юзер получает все события публикации:

```ts
// плохо: снимает ВСЕ INSERT-ы по messages, фильтрует в JS
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ...)

// хорошо: фильтр на стороне Realtime
.on('postgres_changes', {
  event: 'INSERT', schema: 'public', table: 'messages',
  filter: `chat_id=in.(${myChatIds.join(',')})`,   // или chat_id=eq.${chatId}
}, ...)
```

Полный URL фильтра имеет лимит. Если у юзера >100 чатов — переходи на отдельный канал на чат при открытии комнаты + один канал общего unread с RPC-poll'ом раз в N сек как fallback.

---

## 6. Сервисный слой (TypeScript)

Все функции живут в одном модуле `chatMessaging.ts` (в KJ CRM ~930 строк). Page-компоненты **не импортируют `supabase` напрямую**.

### 6.1 API сервиса (контракты)

```ts
// Чаты
getMyChats(userId): Promise<Chat[]>                            // лист с last_message, unread, members count
createChat(name, memberIds[], createdBy): Promise<Chat>        // group, создатель → admin
updateChat(chatId, { name?, avatar_url? }): Promise<void>
deleteChat(chatId): Promise<void>                              // soft (is_active=false)
getChatById(chatId): Promise<Chat | null>

// DM
findOrCreateDM(userId1, userId2, otherUserName): Promise<chatId>

// Участники
getChatMembers(chatId): Promise<ChatMember[]>
addChatMembers(chatId, userIds[]): Promise<void>               // upsert by (chat_id,user_id)
removeChatMember(chatId, userId): Promise<void>
getUsersForPicker({ role?, groupId?, search?, excludeUserIds[] }): Promise<UserPickerItem[]>

// Сообщения
getMessages(chatId, limit=50, before?, currentUserId?): Promise<ChatMessage[]>
sendMessage(chatId, senderId, content, replyToId?): Promise<ChatMessage>
sendMessageWithAttachments(chatId, senderId, content, attachments[], replyToId?)
deleteMessage(messageId): Promise<void>                        // soft

// Реакции
addReaction(messageId, userId, emoji): Promise<void>           // upsert
removeReaction(messageId, userId, emoji): Promise<void>
getMessageReactions(messageId, currentUserId): Promise<ChatReaction[]>  // для realtime refetch

// Прочитано
markChatAsRead(chatId, userId): Promise<void>                  // last_read_at = now()
getOthersLastReadAt(chatId, currentUserId): Promise<Date[]>    // для read-receipts
getTotalUnreadCount(userId): Promise<number>

// Поиск
searchMessages(query, limit=50): Promise<SearchResult[]>

// Файлы (см. §6.2)
uploadChatFile(chatId, file, fileName, type): Promise<ChatAttachment>
uploadChatAvatar(chatId, file): Promise<url>
getChatFileUrl(s3Path): Promise<presignedUrl>

// Realtime подписки (возвращают unsubscribe-функцию)
subscribeToChatMessages(chatId, onNewMessage)
subscribeToChatReactions(chatId, onReactionChange)
subscribeToChatReadStatus(chatId, onReadUpdate)
```

### 6.2 Вложения

Тип:
```ts
interface ChatAttachment {
  type: 'image' | 'file' | 'voice';
  url: string;          // путь в хранилище (НЕ public URL)
  name: string;
  size: number;
  mimeType?: string;
  duration?: number;    // секунды, для 'voice'
}
```

Хранение: одно поле `messages.attachments JSONB` (массив). Не делай отдельную таблицу `attachments` — overkill, JSONB полностью покрывает запросы. Фильтровать по типу на клиенте.

Загрузка: **через Edge Function**, не напрямую в Storage с клиента. Причины:
- Подписывание AWS SigV4 для S3-совместимого бакета (Beget S3 / Cloudflare R2 / любой), без раздачи ключей в браузер.
- Можно проверить квоту/размер/тип файла на сервере.
- Один эндпоинт обслуживает чеки/аватары/чат — переиспользуем.

В KJ CRM это `supabase/functions/upload-receipt/index.ts`. Для другого проекта можно либо взять Supabase Storage напрямую (если устраивает) с RLS-политикой на бакет, либо повторить S3-прокси. Адрес файла в `attachments.url` — относительный путь типа `/chat/{chatId}/{uuid}.{ext}`. На просмотре UI запрашивает `getChatFileUrl(s3Path)` → presigned URL на 1 час.

### 6.3 Заметные паттерны в `getMyChats`

```ts
const [membersRes, unreadRes, lastMsgsRes, dmMembersRes] = await Promise.all([...]);
```
Четыре параллельных запроса вместо четырёх sequential. На 50 чатах разница ~600 мс → ~150 мс.

`limit(chatIds.length * 3)` для последних сообщений — берём с запасом, потом группируем по `chat_id` и оставляем самое свежее на каждый. Дешевле, чем N отдельных запросов.

DM-аватар вычисляется отдельным проходом по `chat_members`, не хранится — иначе на смене аватара собеседника пришлось бы синхронить его в N DM.

---

## 7. Клиентский слой

### 7.1 React Query keys

Single source of truth — `lib/queryKeys.ts`:
```ts
export const chatKeys = {
  all: ['chat'] as const,
  list: (userId?: string) => [...chatKeys.all, 'list', userId] as const,
  meta: (chatId: string) => [...chatKeys.all, 'meta', chatId] as const,
  messages: (chatId: string) => [...chatKeys.all, 'messages', chatId] as const,
};
```

Инвалидация **по префиксу**: `queryClient.invalidateQueries({ queryKey: chatKeys.all })` — обновит и список, и все открытые сообщения. Узкая инвалидация одного chatId — для оптимистичных апдейтов внутри комнаты.

### 7.2 ChatContext — глобальный unread

Один провайдер выше роутера. Делает три вещи:
1. На маунте дёргает `get_unread_message_counts` RPC → заполняет `unreadByChat`.
2. Подписывается на realtime INSERT по своим чатам, инкрементит счётчик (skipping свои сообщения и активный чат через `activeChatIdRef`).
3. Экспортирует `markChatRead(chatId)` — клиентский reset на входе в комнату (БЕЗ серверного запроса; сервер обновит `last_read_at` отдельно через `markChatAsRead`).

`activeChatIdRef` — `useRef`, не state. Иначе ререндер провайдера на каждом открытии комнаты повлечёт каскад по всему приложению.

### 7.3 Бейдж непрочитанных

В `BottomNav` берём `useChat().totalUnread` и показываем красную плашку. На иконке элемента списка чатов — `chat.unreadCount` из `getMyChats` (для open-чата он сразу 0 после `markChatRead`).

### 7.4 Список чатов (`ChatListPage`)

- Скрываем DM без сообщений (`type==='direct' && !lastMessage`) — пустые DM не должны спамить ленту.
- Клиентский поиск по `chat.name`, `chat.lastMessage.content`, `chat.lastMessage.senderName`.
- Серверный поиск по содержимому всех сообщений — отдельная модалка через `searchMessages` RPC.
- Ник участника-собеседника в DM = `last_name + first_name` (для Ru) или `first_name + last_name` (для En).

### 7.5 Комната (`ChatRoomPage`)

В KJ CRM ~640 строк, ключевое:

- Загрузка по `useInfiniteQuery` или ручной курсор `before=createdAt`. У нас ручной — `getMessages(chatId, 50, oldestLoaded.createdAt)`.
- Realtime: подписываемся на `messages`/`reactions`/`chat_members` (для read-status). На INSERT — `setQueryData` с патчем, не `invalidate` (мгновенно).
- На входе → `markChatAsRead(chatId, userId)` + `useChat().markChatRead(chatId)`.
- На уходе со страницы → отписка от каналов в return cleanup.
- `ChatMessageBubble` обёрнут в `React.memo` с явным компаратором (см. реальный код) — ререндер только при изменении самого сообщения, не на каждый новый бабл рядом.
- Long-press (touch) или right-click (desktop) → открывает actions: Reply / React / Delete.

### 7.6 Голосовые

`MediaRecorder` API:
```ts
navigator.mediaDevices.getUserMedia({ audio: true })
  → MediaRecorder('audio/webm;codecs=opus')
  → ondataavailable → Blob
  → uploadChatFile(chatId, blob, 'voice.webm', 'voice')
  → sendMessageWithAttachments(..., [{ type:'voice', duration, ... }])
```
В iOS Safari `audio/webm` не поддерживается — нужен fallback на `audio/mp4` (`isTypeSupported`). На UI: long-press на кнопке микрофона, отпускание — отправка, swipe в сторону — отмена.

### 7.7 Реакции

Picker — фиксированная панель из 6-8 эмоджи. На клик: optimistic toggle (`setQueryData`) + `addReaction`/`removeReaction`. Группировка реакций по эмоджи — на клиенте: `Record<emoji, userIds[]>`. `myReaction` помечается на этапе рендера, чтобы не хранить в БД.

---

## 8. Чек-лист имплементации (поэтапно)

1. **Миграция 1** — таблицы, индексы, FK. Прогнать. Проверить `\d chats` в psql.
2. **Миграция 2** — `SECURITY DEFINER` хелперы + RLS политики. Тест: залогиниться двумя юзерами, убедиться что A не видит чат B через REST.
3. **Миграция 3** — триггеры (`update_chat_last_message`, `notify_chat_member_added`).
4. **Миграция 4** — RPC `get_unread_message_counts`, `search_messages`. Не забыть `GRANT EXECUTE ON FUNCTION ... TO authenticated`.
5. **Миграция 5** — `messages.attachments` JSONB + `messages.search_vector` GENERATED + GIN индекс.
6. **Миграция 6** — `ALTER PUBLICATION supabase_realtime ADD TABLE messages, message_reactions, chat_members`.
7. **Сервис `chatMessaging.ts`** — все функции из §6.1. Без UI, проверять из консоли браузера.
8. **`ChatContext`** + повесить на корень после AuthProvider.
9. **Список чатов** + модалки CreateChat / WriteMessage (DM).
10. **Комната** + bubble + input + reactions + reply + soft-delete.
11. **Вложения**: Edge Function (или Supabase Storage policy) + UI upload + AttachmentPreview.
12. **Голосовые**: MediaRecorder + voice player с прогрессом.
13. **Поиск**: модалка с дебаунсом 300мс → `searchMessages` → клик → навигация на сообщение в комнате (нужно scroll-to-message — отдельная задача, через query param `?msg=<id>`).
14. **DM**: button «написать» → MemberPicker → `findOrCreateDM` → редирект.

На каждом этапе перед PR: прогон вторым юзером, проверка realtime (открыть две вкладки), проверка RLS попыткой `select * from messages` от чужого юзера через консоль (`supabase.from('messages').select()` под чужим JWT — должно вернуть пусто).

---

## 9. Грабли (короткий список)

- **`supabase.from('chats').insert().select()`** падает по RLS, если `chats.SELECT` требует членства. Добавь fallback-политику `chats_select_creator` (`USING (created_by=auth.uid())`).
- **`!inner` join** в `select('chats!inner(...)')` — используй для DM-поиска (`findOrCreateDM`), но помни: фильтр `.eq('chats.is_active', true)` отрежет inactive чаты целиком, а не пометит. Для запросов «все мои, включая возможно inactive» — `inner` без фильтра + клиентская фильтрация.
- **`.in('chat_id', [])` падает** в PostgREST — всегда проверяй длину массива перед вызовом.
- **Realtime не доставляется в self-hosted Supabase**, если забыли `ALTER PUBLICATION ... ADD TABLE`. Проверка: `SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime';`.
- **`auth.uid()` возвращает NULL** в `SECURITY DEFINER` функции, если функция вызвана через `pg_net`/cron. Для триггеров изнутри пользовательских INSERT-ов — работает.
- **Soft-delete сообщения**: ставь `content=''` ПОМИМО `is_deleted=true`. Иначе модератор увидит «удалёный» текст в БД — RLS не помогает (модератор имеет права).
- **`memo` на `ChatMessageBubble`** обязателен, иначе печать в input триггерит ререндер всех баблов в комнате (родитель ребилдится на стейт текста).
- **Touch passive listener trap** (React 17+): `onTouchMove` через JSX-проп всегда passive. Если нужен `preventDefault()` на свайпах — `addEventListener` с `{ passive: false }` через `useEffect`.

---

## 10. Минимальные файлы, которые получатся в новом проекте

```
src/
├── lib/
│   └── queryKeys.ts            # + chatKeys namespace
├── contexts/
│   └── ChatContext.tsx         # totalUnread, realtime инкремент
├── services/
│   └── chatMessaging.ts        # ~900 строк, см. §6.1
├── pages/chat/
│   ├── ChatListPage.tsx
│   ├── ChatRoomPage.tsx
│   └── components/
│       ├── ChatListItem.tsx
│       ├── ChatHeader.tsx
│       ├── ChatInput.tsx
│       ├── ChatMessageBubble.tsx
│       ├── MessageReactions.tsx
│       ├── ReactionPicker.tsx
│       ├── AttachmentPreview.tsx
│       └── modals/
│           ├── CreateChatModal.tsx
│           ├── WriteMessageModal.tsx     # DM 1-1
│           ├── ChatInfoModal.tsx
│           └── SearchMessagesModal.tsx
└── types/
    └── chat.ts                 # Chat, ChatMessage, ChatMember, ChatReaction, ChatAttachment, UserPickerItem

supabase/
├── migrations/
│   ├── 0001_chat_tables.sql       # таблицы, индексы, FK
│   ├── 0002_chat_rls.sql          # SECURITY DEFINER + политики
│   ├── 0003_chat_triggers.sql     # last_message_at + notify
│   ├── 0004_chat_rpc.sql          # unread, search
│   ├── 0005_chat_attachments.sql  # JSONB
│   ├── 0006_chat_search.sql       # tsvector + GIN
│   └── 0007_chat_realtime.sql     # ALTER PUBLICATION
└── functions/
    └── upload-chat-file/index.ts  # S3 SigV4, presigned URL — опционально
```

---

## 11. Промпт для Клода в другом проекте

> «Реализуй внутренний чат по спеку из `CHAT_SPEC.md`. Стек у нас: [укажи свой]. Адаптируй имена таблиц под наш проект ([например: вместо `users` у нас `app_users`]), но сохрани **структуру таблиц**, **RLS-паттерн через SECURITY DEFINER хелперы** и **разделение сервиса/контекста/страниц**. Делай по чек-листу из §8. После каждого этапа — мини-PR с одной миграцией + минимальный UI, чтобы можно было проверить руками. Не добавляй фич сверху спека (typing indicators, reactions-not-emoji и т.д.) — обсудим отдельно.»
