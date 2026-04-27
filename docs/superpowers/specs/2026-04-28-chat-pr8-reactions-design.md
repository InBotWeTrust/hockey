# Chat PR 8 — реакции на сообщения (web UI + server endpoints)

> **Статус:** дизайн утверждён пользователем 2026-04-28. После того как user подтвердит spec, через `superpowers:writing-plans` создаётся имплементационный план в `docs/superpowers/plans/2026-04-28-internal-chat-pr8-reactions.md`, дальше — `superpowers:executing-plans` по TDD.

---

## 1. Контекст

PR 1–7 в feature/chat закрыли БД + REST + realtime + web MVP + global search. Реакции были заложены частично: таблица `message_reactions`, батч-загрузка в `getMessages`, DTO `ReactionGroupDTO { emoji, count, reactedByMe }`, типы WS-событий `reaction:added` / `reaction:removed`. Однако серверные endpoint'ы POST/DELETE и event-publisher'ы не реализованы; на web `useChatSocket.applyReactionChange` инвалидирует пустой ключ `chatKeys.reactions(messageId)`, который никем не маунтится.

PR 8 закрывает реакции end-to-end: серверные endpoint'ы + publisher'ы, web UI (`ReactionBar`, `ReactionPicker`), интеграцию в long-press menu, оптимистичное обновление, WS-патчи на правильный ключ. Дополнительно вводится изменение модели «1 реакция от юзера на сообщение» и поправка семантики бейджа в `BottomNav`.

Спек чата: `docs/superpowers/specs/2026-04-26-internal-chat-design.md` (§3.4, §4, §5, §6, §7.1/7.6, §11 step 6 — частично пересматриваются этим документом).

---

## 2. Скоуп PR 8

**В скоупе:**
- Миграция `005_chat_reaction_user_unique.sql`: смена UNIQUE с `(message_id, user_id, emoji)` на `(message_id, user_id)`.
- Сервис: `addReaction`, `removeReaction` с транзакционным switch'ем (delete prev → insert new).
- Events: `publishReactionAdded`, `publishReactionRemoved` через тот же `fanOut`.
- REST: `POST /chat/messages/:messageId/reactions`, `DELETE /chat/messages/:messageId/reactions` с zod-enum whitelist 24 эмодзи.
- Web: `EMOJI_WHITELIST` (24), `ReactionBar`, `ReactionPicker`, эмодзи-полка в `MessageActionsMenu`, `addReactionMutation`/`removeReactionMutation` с оптимистикой и rollback.
- Web: переписать `useChatSocket.applyReactionChange` на патч `chatKeys.messages(chatId)` с дедупом для собственных событий.
- Adjacent: семантика `chatStore.totalUnread()` — число чатов с непрочитанным, не сумма.
- Удалить `chatKeys.reactions(...)` из `lib/queryKeys.ts`.

**Не в скоупе:**
- Список юзеров поставивших конкретный эмодзи (DTO агрегатный).
- Поиск/категории/native picker — whitelist 24 фиксирован.
- Rate-limit на POST реакций — добавим если увидим спам.
- Список любимых эмодзи per-user — favorites зашиты статически (топ-6 из whitelist).

---

## 3. Модель и БД

### 3.1 Новый инвариант

**Один пользователь — одна реакция на сообщение, не более.** Это пересматривает спек чата §3.4 («Один юзер может ставить несколько разных эмоджи»). Tap на чужой эмодзи в `ReactionBar` или выбор в picker'е переключает реакцию (старая снимается, новая ставится).

### 3.2 Миграция `005_chat_reaction_user_unique.sql`

```sql
-- 1. Дедуп существующих дублей (defensive, в проде MVP записей не должно быть).
delete from message_reactions r
 where r.id not in (
   select min(r2.id)
     from message_reactions r2
    where r2.message_id = r.message_id and r2.user_id = r.user_id
 );

-- 2. Снять старый UNIQUE.
alter table message_reactions
  drop constraint if exists message_reactions_message_id_user_id_emoji_key;

-- 3. Поставить новый.
alter table message_reactions
  add constraint message_reactions_user_unique unique (message_id, user_id);
```

Имя старого constraint — то, что Postgres сгенерил для `UNIQUE(message_id, user_id, emoji)` в миграции 004; на implementation-стадии проверим точное имя через `\d message_reactions` и подставим (использовать `if exists` вместе с CASCADE-варианту не применяем — хотим хорошую ошибку при несовпадении).

### 3.3 DTO остаётся прежним

`ReactionGroupDTO { emoji, count, reactedByMe }`. На один `ChatMessageDTO` теперь массив `reactions[]` имеет длину ≤ N разных эмодзи (без ограничения по N), но `reactedByMe === true` встречается **максимум в одном элементе массива**.

---

## 4. Server changes

### 4.1 `chat/service.ts`

```ts
export interface AddReactionResult {
  added: WhitelistEmoji | null;    // emoji который успешно добавили (null если уже стоял тот же)
  removed: WhitelistEmoji | null;  // emoji прошлой реакции юзера, если switch
}

export async function addReaction(
  pool: Pool,
  messageId: string,
  userId: string,
  emoji: WhitelistEmoji,
): Promise<AddReactionResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const del = await client.query<{ emoji: string }>(
      `delete from message_reactions
       where message_id = $1 and user_id = $2 and emoji != $3
       returning emoji`,
      [messageId, userId, emoji],
    );
    const ins = await client.query<{ id: string }>(
      `insert into message_reactions (message_id, user_id, emoji)
       values ($1, $2, $3)
       on conflict (message_id, user_id) do nothing
       returning id`,
      [messageId, userId, emoji],
    );
    await client.query('commit');
    return {
      added: ins.rowCount && ins.rowCount > 0 ? emoji : null,
      removed: del.rowCount && del.rowCount > 0 ? (del.rows[0]!.emoji as WhitelistEmoji) : null,
    };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function removeReaction(
  pool: Pool,
  messageId: string,
  userId: string,
  emoji: WhitelistEmoji,
): Promise<{ removed: boolean }> {
  const r = await pool.query(
    `delete from message_reactions
     where message_id = $1 and user_id = $2 and emoji = $3`,
    [messageId, userId, emoji],
  );
  return { removed: (r.rowCount ?? 0) > 0 };
}
```

`emoji != $3` в DELETE'е важно: если юзер тапает уже стоящий эмодзи через picker (idempotent re-add) — мы не снимаем его и потом не вставляем (INSERT ON CONFLICT DO NOTHING вернёт `rowCount=0`). Итог: `{added: null, removed: null}` → publish'и не делаем.

### 4.2 `chat/events.ts`

```ts
export async function publishReactionAdded(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await fanOut(pool, publisher, chatId, chatType, {
    type: 'reaction:added', chatId, messageId, userId, emoji,
  });
}

export async function publishReactionRemoved(...): Promise<void> { /* симметрично */ }
```

### 4.3 `chat/routes.ts`

```ts
const EMOJI_WHITELIST = ['👍','❤️','😂','🎉','😮','😢','🔥','👏',
                         '🙏','💯','🤔','😍','😡','🥳','😎','🤩',
                         '👎','💔','🤯','🥶','🤝','🍻','💪','🎯'] as const;

app.post('/chat/messages/:messageId/reactions', { preHandler: [app.authenticate] }, async (req, reply) => {
  const { messageId } = z.object({ messageId: uuid }).parse(req.params);
  const { emoji } = z.object({ emoji: z.enum(EMOJI_WHITELIST) }).parse(req.body);
  const userId = req.user.id;
  // Resolve chat → chat-access guard (404 if message не существует, 403 если не имеет доступа).
  const message = await getMessageOr404(app.pg, messageId);
  const chat = await assertCanAccessChat(app.pg, userId, message.chat_id);
  const result = await addReaction(app.pg, messageId, userId, emoji);
  if (result.removed) {
    await publishReactionRemoved(app.pg, app.realtime, chat.id, chat.type, messageId, userId, result.removed);
  }
  if (result.added) {
    await publishReactionAdded(app.pg, app.realtime, chat.id, chat.type, messageId, userId, result.added);
  }
  reply.code(201);
  return { messageId, emoji, removed: result.removed };
});

app.delete('/chat/messages/:messageId/reactions', { preHandler: [app.authenticate] }, async (req, reply) => {
  const { messageId } = z.object({ messageId: uuid }).parse(req.params);
  const { emoji } = z.object({ emoji: z.enum(EMOJI_WHITELIST) }).parse(req.body);
  const userId = req.user.id;
  const message = await getMessageOr404(app.pg, messageId);
  const chat = await assertCanAccessChat(app.pg, userId, message.chat_id);
  const result = await removeReaction(app.pg, messageId, userId, emoji);
  if (result.removed) {
    await publishReactionRemoved(app.pg, app.realtime, chat.id, chat.type, messageId, userId, emoji);
  }
  reply.code(204);
  return null;
});
```

`getMessageOr404(pool, messageId)` — новый хелпер в `chat/service.ts`, бросает `MessageNotFoundError` (уже маппится `errorsPlugin` на 404). DELETE-роут читает `emoji` из body — валидно для DELETE (несмотря на REST-холивар, fastify body-parsing на DELETE поддерживается, и эмодзи в URL экранировать неудобно).

### 4.4 Whitelist single-source-of-truth

`EMOJI_WHITELIST` живёт **в обоих** пакетах раздельно: `packages/server/src/chat/whitelist.ts` и `packages/web/src/chat/reactions.ts`. Дублирование контролируется тестом-snapshot'ом (запекаем хеш списка в test/chat/whitelist.test.ts на сервере и аналогом на web). Это проще чем заводить общий пакет `@hockey/chat-shared`.

---

## 5. Web changes

### 5.1 `chat/reactions.ts` (новый)

```ts
export const EMOJI_WHITELIST = [...] as const;       // 24 шт, тот же список что и на сервере
export type WhitelistEmoji = typeof EMOJI_WHITELIST[number];
export const FAVORITE_EMOJI = EMOJI_WHITELIST.slice(0, 6);  // полка в long-press menu
export function isWhitelistEmoji(s: string): s is WhitelistEmoji {
  return (EMOJI_WHITELIST as readonly string[]).includes(s);
}
```

### 5.2 `chat/api.ts`

```ts
export interface AddReactionResponse {
  messageId: string;
  emoji: string;
  removed: string | null;
}

export function addReaction(messageId: string, emoji: string): Promise<AddReactionResponse> {
  return apiFetch(`/chat/messages/${messageId}/reactions`, {
    method: 'POST', body: JSON.stringify({ emoji }),
  });
}

export function removeReaction(messageId: string, emoji: string): Promise<void> {
  return apiFetch(`/chat/messages/${messageId}/reactions`, {
    method: 'DELETE', body: JSON.stringify({ emoji }),
  });
}
```

### 5.3 `chat/useChatSocket.ts` — переписать `applyReactionChange`

```ts
function applyReactionEvent(
  qc: QueryClient,
  meId: string | null,
  event: Extract<ChatEvent, { type: 'reaction:added' | 'reaction:removed' }>,
): void {
  qc.setQueryData<InfinitePages | undefined>(chatKeys.messages(event.chatId), (old) => {
    if (!old) return old;
    let touched = false;
    const pages = old.pages.map((page) =>
      page.map((m) => {
        if (m.id !== event.messageId) return m;
        const next = applyReactionToMessage(m, event, meId);
        if (next === m) return m;
        touched = true;
        return next;
      }),
    );
    return touched ? { ...old, pages } : old;
  });
}

function applyReactionToMessage(
  m: ChatMessageDTO,
  event: { type: 'reaction:added' | 'reaction:removed'; userId: string; emoji: string },
  meId: string | null,
): ChatMessageDTO {
  const isMine = meId !== null && event.userId === meId;
  const existing = m.reactions.find((r) => r.emoji === event.emoji);

  if (event.type === 'reaction:added') {
    // Дедуп оптимистики: если это я, и в кеше уже есть pill с reactedByMe=true → no-op.
    if (isMine && existing?.reactedByMe) return m;
    if (existing) {
      return {
        ...m,
        reactions: m.reactions.map((r) =>
          r.emoji === event.emoji
            ? { ...r, count: r.count + 1, reactedByMe: isMine ? true : r.reactedByMe }
            : r,
        ),
      };
    }
    return {
      ...m,
      reactions: [...m.reactions, { emoji: event.emoji, count: 1, reactedByMe: isMine }],
    };
  }

  // reaction:removed
  if (!existing) return m;  // нечего снимать
  if (isMine && existing.reactedByMe === false) return m;  // уже снято оптимистически
  const nextCount = existing.count - 1;
  if (nextCount <= 0) {
    return { ...m, reactions: m.reactions.filter((r) => r.emoji !== event.emoji) };
  }
  return {
    ...m,
    reactions: m.reactions.map((r) =>
      r.emoji === event.emoji
        ? { ...r, count: nextCount, reactedByMe: isMine ? false : r.reactedByMe }
        : r,
    ),
  };
}
```

`meId` берётся через `useAuthStore.getState().user?.id ?? null` внутри useChatSocket.

### 5.4 `chat/chatStore.ts`

`applyEvent` для `reaction:*` остаётся no-op (всё в TanStack-кеше). Меняется только `totalUnread()` — см. §9.

### 5.5 `lib/queryKeys.ts`

Удаляем строку `reactions: (messageId) => [...]`. Ничего больше её не использует после переписи useChatSocket.

---

## 6. Web components

### 6.1 `ReactionBar.tsx`

```tsx
interface Props {
  reactions: ReactionGroupDTO[];
  onToggle: (emoji: string) => void;
}

export function ReactionBar({ reactions, onToggle }: Props): JSX.Element | null {
  if (reactions.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={r.reactedByMe ? 'pill pill--dark' : 'pill'}
          onClick={() => onToggle(r.emoji)}
          style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
        >
          <span style={{ fontSize: 14 }}>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
    </div>
  );
}
```

### 6.2 `ReactionPicker.tsx`

Portal через `createPortal`. Структура и позиционирование как в `MessageActionsMenu` (та же `panelPosition` логика, вынесем в `chat/popover.ts` если станет дубль). Размер ~280×140.

```tsx
interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
}
```

Рендер: 3 строки × 8 кнопок (`grid-template-columns: repeat(8, 1fr)`), gap 6px, padding 8px, `.glass` фон, `border-radius: 16`. Каждая кнопка — `<button type="button" aria-label={emoji}>` с `font-size: 22`. Backdrop overlay `rgba(15,23,42,0.04)` → onClose. Escape → onClose.

### 6.3 `MessageActionsMenu.tsx` — расширение

Добавляем сверху эмодзи-полку: горизонтальный ряд из `FAVORITE_EMOJI` (6 кнопок) + кнопка `+` (Lucide `SmilePlus` или `MoreHorizontal`). Полка отделена от пунктов меню `border-top: 1px solid rgba(15,23,42,0.06)` (полоска ниже неё, не выше).

Новые props:

```ts
interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  isOwn: boolean;
  onReply: () => void;
  onDelete: () => void;
  onPickEmoji: (emoji: string) => void;   // новый
  onMoreEmoji: () => void;                // новый — открыть picker
  onClose: () => void;
}
```

Тап на favorite → `onPickEmoji(emoji)` + `onClose()`. Тап на `+` → `onMoreEmoji()` (родитель сам закрывает menu и открывает picker).

`PANEL_WIDTH` увеличивается до ~320px. `PANEL_HEIGHT_OWN`/`PANEL_HEIGHT_OTHER` пересчитываются с учётом новой полки (~+44px).

### 6.4 `ChatBubble.tsx`

В существующий рендер под content (но в пределах bubble-обёртки) добавляем `<ReactionBar reactions={message.reactions} onToggle={onReact} />`. Новый prop `onReact: (emoji: string) => void`.

### 6.5 `ChatRoomScreen.tsx`

Новый state:

```ts
const [pickerTarget, setPickerTarget] = useState<{
  messageId: string;
  anchorRect: DOMRect;
} | null>(null);
```

Мутации:

```ts
const addMut = useMutation({
  mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
    addReaction(messageId, emoji),
  onMutate: ({ messageId, emoji }) => {
    const prev = queryClient.getQueryData<InfinitePages>(chatKeys.messages(chatId));
    queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
      if (!old || !meId) return old;
      return patchOptimistic(old, messageId, (msg) => switchMyReactionTo(msg, emoji));
    });
    return { prev };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) {
      queryClient.setQueryData(chatKeys.messages(chatId), ctx.prev);
    }
  },
});

const removeMut = useMutation({
  mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
    removeReaction(messageId, emoji),
  onMutate: ({ messageId, emoji }) => {
    const prev = queryClient.getQueryData<InfinitePages>(chatKeys.messages(chatId));
    queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
      if (!old) return old;
      return patchOptimistic(old, messageId, (msg) => removeMyReaction(msg, emoji));
    });
    return { prev };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(chatKeys.messages(chatId), ctx.prev);
  },
});
```

Хелперы `switchMyReactionTo(msg, emoji)`, `removeMyReaction(msg, emoji)`, `patchOptimistic(pages, messageId, fn)` — pure-функции, лежат рядом с `useChatSocket.applyReactionToMessage` (имеет смысл вынести в `chat/reactionsState.ts` чтобы переиспользовать). Семантика switch — DELETE предыдущей `reactedByMe=true` (любой эмодзи) + ADD новой. Если `emoji === current` (toggle off через picker — невозможно по UX) → no-op оптимистики.

Колбэки:

```ts
const onToggleReaction = (messageId: string, emoji: string) => {
  const msg = findMessage(messageId);
  const existing = msg?.reactions.find((r) => r.emoji === emoji);
  if (existing?.reactedByMe) {
    removeMut.mutate({ messageId, emoji });
  } else {
    addMut.mutate({ messageId, emoji });
  }
};

const onPickEmoji = (messageId: string, emoji: string) => {
  // picker всегда добавляет (либо no-op если та же)
  addMut.mutate({ messageId, emoji });
};

const onMoreEmoji = (messageId: string, anchorRect: DOMRect) => {
  setActionTarget(null);  // закрываем menu
  setPickerTarget({ messageId, anchorRect });
};
```

Render:

```tsx
<MessageActionsMenu
  open={actionTarget !== null}
  anchorRect={actionTarget?.anchorRect ?? null}
  isOwn={actionIsOwn}
  onReply={...}
  onDelete={...}
  onPickEmoji={(emoji) => actionMessage && onPickEmoji(actionMessage.id, emoji)}
  onMoreEmoji={() => actionMessage && onMoreEmoji(actionMessage.id, actionTarget!.anchorRect)}
  onClose={onCloseActions}
/>

<ReactionPicker
  open={pickerTarget !== null}
  anchorRect={pickerTarget?.anchorRect ?? null}
  onPick={(emoji) => {
    if (pickerTarget) onPickEmoji(pickerTarget.messageId, emoji);
    setPickerTarget(null);
  }}
  onClose={() => setPickerTarget(null)}
/>
```

`<ChatBubble>` получает `onReact={(emoji) => onToggleReaction(m.id, emoji)}`.

---

## 7. UX flows

### 7.1 Поставить новую реакцию (нет ни одной)
Long-press на bubble → `MessageActionsMenu` открывается со shelf'ом (6 favorites + `+`). Тап на favorite → `addReaction` оптимистично добавляется (count=1, reactedByMe=true), `pill` появляется в `ReactionBar` под bubble.

### 7.2 Сменить свою реакцию (switch)
Tap на чужую pill в `ReactionBar`, **или** open picker → tap на новый эмодзи. Оптимистика: моя предыдущая pill теряет 1 (если count==1 — pill уходит), новая получает +1 + `reactedByMe=true`. На сервере DELETE prev → INSERT new (одна транзакция). WS публикует `reaction:removed (prevEmoji)` + `reaction:added (newEmoji)` всем участникам чата.

### 7.3 Снять свою реакцию
Tap на свою pill (`reactedByMe=true`) → `removeReaction`, count -1, pill уходит при count==0. Сервер DELETE → publish `reaction:removed`.

### 7.4 Idempotent тап (та же эмодзи)
Тап в picker'е по эмодзи который уже стоит → POST идёт всё равно, сервер видит «нечего удалять, нечего вставлять» → 201 без publish'ей. Optimistic switch на фронте — no-op (новая === текущая). Никакого визуального глюка.

### 7.5 Чужая реакция в realtime
WS приходит → `applyReactionEvent` патчит `chatKeys.messages(chatId)` → pill инкрементируется или появляется. `reactedByMe` не трогается (это не я).

### 7.6 Сетевая ошибка
POST/DELETE падает → `onError` rollback'ит state к pre-mutation. `OfflineBanner` (уже смонтирован выше через WS-status) покрывает offline-кейс. Никаких toast'ов.

---

## 8. Optimistic updates + WS dedup

**Правило дедупа на WS-event от себя:**
- `reaction:added` от меня + в кеше уже есть pill с `emoji=event.emoji` и `reactedByMe=true` → no-op.
- `reaction:removed` от меня + в кеше нет такой pill, или у неё `reactedByMe=false` → no-op.
- Чужие события — всегда применяются.

**Race optimistic vs WS:**
- Оптимистика применяется в `onMutate` синхронно, до сетевого запроса.
- WS-событие от собственного POST приходит **после** server response (Redis publish'ится в конце транзакции, перед reply).
- `onSuccess` мутации — no-op (WS дополнит).
- `onError` мутации — rollback оптимистики; WS-события не будет (если запрос упал, сервер не publish'ил).

**Двухстадийный switch (WS-events removed+added):**
- Если оптимистика уже сделала switch (старая снята, новая поставлена) — оба WS-события дедупятся (removed: уже снято, added: уже стоит).
- Если оптимистика НЕ применялась (например, прислал другой клиент того же юзера из другой вкладки) — оба применяются последовательно, итог корректен (count'ы коммутативны).

---

## 9. Adjacent: `BottomNav` бейдж — chats-with-unread, не сумма

**Текущее поведение:** `chatStore.totalUnread()` суммирует `Object.values(unreadByChat)`. Бейдж в `BottomNav` показывает сумму (10 непрочитанных в 2 чатах → `10`).

**Новое поведение:** показываем число чатов с count > 0 (10 непрочитанных в 2 чатах → `2`).

Изменение:

```ts
totalUnread() {
  let chats = 0;
  for (const v of Object.values(get().unreadByChat)) {
    if (v > 0) chats += 1;
  }
  return chats;
}
```

`incrementUnread` / `resetUnread` / `applyEvent` остаются без изменений — они оперируют на конкретном `chatId`. Существующий тест `chatStore.test.ts:22` («totalUnread sums over unreadByChat») переписывается на новую семантику + добавляется кейс «2 чата с положительными counts → 2».

---

## 10. Тесты

### 10.1 Server

| файл | покрытие |
|---|---|
| `test/chat/migration.test.ts` (расширяем) | новый UNIQUE срабатывает на `(message_id, user_id)`; старый `(…, emoji)` снят |
| `test/chat/service.reactions.test.ts` (новый) | `addReaction` first-add, switch, idempotent re-add (returns null/null), `removeReaction` happy + no-op |
| `test/chat/routes.reactions.test.ts` (новый) | POST/DELETE happy + 201/204; 401 без auth; 403 на чужой чат; 400 на не-whitelist эмодзи; 404 на несуществующее `messageId`; WS spy получает корректную пару событий на switch |
| `test/chat/events.reactions.test.ts` (новый) | `publishReactionAdded` для `direct` → fan-out по chat_members; для `system` → один publish; Redis publish error swallow'ится |
| `test/chat/whitelist.test.ts` (новый) | список совпадает (snapshot хеша) с web-копией — защита от дрейфа |

### 10.2 Web

| файл | покрытие |
|---|---|
| `test/chat/reactions.test.ts` (новый) | `EMOJI_WHITELIST.length === 24`, `FAVORITE_EMOJI.length === 6`, `isWhitelistEmoji` true/false |
| `test/chat/ReactionBar.test.tsx` (новый) | пустой массив → null; рендер 2 pill (своя `.pill--dark`, чужая `.pill`); тап → onToggle(emoji) |
| `test/chat/ReactionPicker.test.tsx` (новый) | 24 кнопки; тап → onPick + onClose; Escape → onClose; backdrop → onClose |
| `test/chat/MessageActionsMenu.test.tsx` (новый) | shelf с 6 favorites + `+` рисуется; тап на favorite → onPickEmoji; тап на `+` → onMoreEmoji; «Ответить»/«Удалить» работают как раньше |
| `test/chat/useChatSocket.test.tsx` (расширяем) | старый кейс `reaction:added invalidates reactions key` переписывается; чужой added → count+1; чужой removed → count-1, pill уходит при 0; свой added дедупится при `reactedByMe=true`; свой removed дедупится при `reactedByMe=false`; switch removed+added от чужого → корректный итог; нет кеша → no-op без падения |
| `test/chat/ChatRoomScreen.test.tsx` (расширяем) | long-press → menu shelf → favorite → POST + optimistic count+1; POST падает → rollback; tap на свою pill → DELETE + count-1; tap на чужую → POST switch с optimistic снятием прошлой; tap на `+` → picker; pick → POST + picker закрыт |
| `test/chat/chatStore.test.ts` (правим) | `totalUnread()` теперь считает чаты с >0; old «sums» test переписывается; новый кейс «2 чата с 5+3 → 2» |

### 10.3 Manual smoke
- Две вкладки, два юзера: A ставит 🔥 на сообщение B → B видит pill в realtime.
- A меняет 🔥 → ❤️ → B видит switch (две стадии).
- Reload вкладки → реакции на месте (refetch).
- Прод: `GET /api/health` 200 OK после деплоя.

---

## 11. File map

**Создаются:**
- `packages/server/db/migrations/005_chat_reaction_user_unique.sql`
- `packages/server/src/chat/whitelist.ts`
- `packages/server/test/chat/service.reactions.test.ts`
- `packages/server/test/chat/routes.reactions.test.ts`
- `packages/server/test/chat/events.reactions.test.ts`
- `packages/server/test/chat/whitelist.test.ts`
- `packages/web/src/chat/reactions.ts`
- `packages/web/src/chat/reactionsState.ts` (pure-функции для оптимистичного и WS-патча)
- `packages/web/src/chat/components/ReactionBar.tsx`
- `packages/web/src/chat/components/ReactionPicker.tsx`
- `packages/web/src/chat/test/reactions.test.ts`
- `packages/web/src/chat/test/ReactionBar.test.tsx`
- `packages/web/src/chat/test/ReactionPicker.test.tsx`
- `packages/web/src/chat/test/MessageActionsMenu.test.tsx`

**Изменяются:**
- `packages/server/src/chat/types.ts` — `AddReactionResult`.
- `packages/server/src/chat/service.ts` — `addReaction`, `removeReaction`, `getMessageOr404`.
- `packages/server/src/chat/events.ts` — `publishReactionAdded`, `publishReactionRemoved`.
- `packages/server/src/chat/routes.ts` — POST/DELETE `/chat/messages/:messageId/reactions`.
- `packages/server/test/chat/migration.test.ts`.
- `packages/web/src/chat/api.ts` — `addReaction`, `removeReaction`, `AddReactionResponse`.
- `packages/web/src/chat/components/MessageActionsMenu.tsx` — shelf + `+`, новые props.
- `packages/web/src/chat/components/ChatBubble.tsx` — `<ReactionBar>` + `onReact` prop.
- `packages/web/src/chat/screens/ChatRoomScreen.tsx` — `addMut`/`removeMut`, picker state, проброс.
- `packages/web/src/chat/useChatSocket.ts` — `applyReactionEvent` (патч `chatKeys.messages`), дедуп.
- `packages/web/src/chat/chatStore.ts` — `totalUnread()` semantics: chats-with-unread.
- `packages/web/src/chat/test/chatStore.test.ts` — переписать «sums» тест.
- `packages/web/src/chat/test/useChatSocket.test.tsx` — обновить старый reaction-кейс.
- `packages/web/src/chat/test/ChatRoomScreen.test.tsx` — расширить.
- `packages/web/src/lib/queryKeys.ts` — удалить `reactions(...)`.
- `CLAUDE.md` — короткая добавка «PR 8 — реакции» в чат-параграф (≤200 строк).

---

## 12. Открытые вопросы / задел

- Список юзеров поставивших данный эмодзи (long-press на pill в bar → tooltip «Поставили: X, Y, Z») — требует расширения DTO. В отдельный PR при запросе пользователей.
- Rate-limit на POST реакций — добавим если увидим спам в проде.
- Кастомные эмодзи / стикеры — после файлового хранилища (S3/R2).
- Per-user favorites в picker'е — после первого фидбека по UX.

---

## 13. Verification (как тестировать end-to-end)

```bash
# 1. Миграция
pnpm --filter @hockey/server db:migrate

# 2. Server tests
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server test

# 3. Web tests
pnpm --filter @hockey/web test

# 4. Live: dev-серверы
pnpm dev:server
pnpm dev:web

# 5. Two-tab smoke (см. §10.3)

# 6. Прод после деплоя
curl -fsSL https://hockey.inbotwetrust.ru/api/health
```
