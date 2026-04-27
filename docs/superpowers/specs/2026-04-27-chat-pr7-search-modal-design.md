# Chat PR 7 — Global Message Search Modal (web)

**Status:** approved by user 2026-04-27.
**Parent spec:** `docs/superpowers/specs/2026-04-26-internal-chat-design.md` §7 (line 453).
**Server prerequisites:** `GET /chat/search?q=&limit=` already shipped (PR 2). Server changes to `GET /chat/:chatId/messages` are in scope of THIS PR.

## 1. Goal

Allow a user to find a message anywhere across all chats they can read (own DMs/groups + system channels), tap a result, and land in the chat with the target message scrolled into view, surrounded by ±25 messages of context, briefly highlighted.

## 2. Non-goals

- Reactions UI (separate PR — see parent spec §11 step 6).
- Long-press / context-menu polish (already shipped in actual PR 6).
- Search filters by chat, sender, date — out of scope, single-input full-text only.
- Pagination of search results — fixed `limit=50`, refining the query is the UX path.
- Persistent search history / suggestions.
- `ts_headline`-based server highlighting — client-side highlighting is sufficient.

## 3. UX decisions (locked)

- **Entry point:** the existing search input on `ChatListScreen` (currently filters chat list locally) becomes a unified search. Below 2 characters: classic chat-list filter behavior. At ≥2 chars: dropdown opens with two sections — "Чаты" (local hits over already-loaded chat list) and "Сообщения" (server-side full-text hits via `/chat/search`). The full chat list is hidden while the dropdown is open; chat hits live exclusively inside the dropdown's "Чаты" section. No second source of truth.
- **Navigation to a hit:** tapping a message hit navigates to `/chat/{chatId}?goto={messageId}`. The chat room loads ±25 messages around the hit via a new server `around` cursor mode and scrolls/flashes it.
- **Min query length:** 2 chars (after `trim()`). Short enough for Russian short words (`да`, `он`), long enough to avoid hitting the server on every keystroke.
- **Debounce:** 300 ms on the message-search query only. Local chat filter is synchronous.
- **Highlighting:** client-side `<mark>` over matched tokens via a `HighlightedText` component. Tokens split by `\s+`, regex metacharacters escaped. All wrapping is React elements, not raw HTML strings.
- **Result excerpt:** content trimmed to ~160 chars centered on the first matching token (`excerptAround`), so the highlight is always visible — superior to a fixed `line-clamp` that may hide the match.
- **No deep-linking** for searches — search state is ephemeral, not URL-backed. The chat room's `?goto=` IS in the URL because it survives navigation/back, but is removed after the first flash so refresh doesn't re-trigger.
- **Empty/loading/error states:** spinner in the "Сообщения" section header while fetching; "Ничего не найдено по «{q}»" card on empty result; `.glass-dark` row with «Повторить» button on error.

## 4. Components

### 4.1 New web files

- `packages/web/src/chat/components/SearchResultsDropdown.tsx` — `.glass-dark` container that renders below the existing search input on `ChatListScreen`. Two sections (`<h3>Чаты</h3>`, `<h3>Сообщения</h3>`), `.glass` cards inside each. Owns the `useQuery` for `searchMessagesApi`.
- `packages/web/src/chat/components/HighlightedText.tsx` — pure component: `(text: string, tokens: string[]) → ReactNode[]`. Splits text on case-insensitive token matches and wraps matches in React `<mark>` elements. Regex metacharacters escaped. No-op when tokens empty.
- `packages/web/src/chat/searchUtils.ts` — `excerptAround(text, tokens, ctxBefore=40, ctxAfter=120)`. Centers excerpt on the first match, prepends `…` if cut on the left, appends `…` if cut on the right.
- `packages/web/src/lib/useDebouncedValue.ts` — generic `useDebouncedValue<T>(value: T, delayMs: number): T` hook. ~10 lines.

### 4.2 Modified web files

- `packages/web/src/chat/screens/ChatListScreen.tsx` — keeps the existing search input. When `filter.trim().length >= 2`, mounts `<SearchResultsDropdown query={debouncedFilter} chatHits={localChatMatches} onPick={...} />` and hides the standalone chat list. Local chat matches are computed synchronously (no debounce) and passed in; message hits are owned by the dropdown.
- `packages/web/src/chat/screens/ChatRoomScreen.tsx` — reads `?goto={messageId}` via `useSearchParams()`. When present, loads messages with `{ around: goto, radius: 25 }` instead of the default `before` cursor. After load: finds DOM node `[data-message-id={goto}]`, calls `scrollIntoView({ block: 'center' })`, adds `chat-bubble--flash` class, removes the class and the `?goto` param after 1200 ms. Subsequent infinite-scroll up uses `before` cursor; new "load newer" trigger at the bottom uses the new `after` cursor when `goto` was in scope. WS patches (`message:new`, `message:deleted`) target the same `chatKeys.messages(chatId)` cache key — `around` is a load-time detail, not part of the cache key.
- `packages/web/src/chat/api.ts` — `fetchMessages(chatId, opts)` accepts `{ before?: string; after?: string; around?: string; radius?: number; limit?: number }`. `MessageSearchHit` already exists.
- `packages/web/src/lib/queryKeys.ts` — adds `chatKeys.searchMessages(q: string) => [...chatKeys.all, 'search', q] as const`. `chatKeys.messages(chatId)` signature unchanged.
- `packages/web/src/chat/components/ChatBubble.tsx` — adds `data-message-id` attribute on the root element so the room can locate the bubble by id.
- `packages/web/src/app/design-system.css` (or component-local CSS) — `.chat-bubble--flash` keyframe: 1200 ms, brief background tint then fade-out. Reduced-motion respected via `@media (prefers-reduced-motion: reduce)` → instant tint without animation.

## 5. Data flow

### 5.1 Search on ChatListScreen

1. User types → local `filter` state.
2. `filter` → `useDebouncedValue(filter, 300)` → `debouncedQuery`.
3. **Local chat matches** computed synchronously each render: `chats.filter(c => chatHaystack(c).includes(filter.toLowerCase()))`. No debounce, mirrors current behavior.
4. **Message hits** via `useQuery({ queryKey: chatKeys.searchMessages(debouncedQuery), queryFn: () => searchMessagesApi(debouncedQuery, 50), enabled: debouncedQuery.trim().length >= 2, staleTime: 30_000 })`. TanStack cancels in-flight queries on key change.
5. Dropdown renders only when `filter.trim().length >= 2`. Standalone chat list hidden.
6. Tap chat hit → `navigate('/chat/{chatId}')`. Tap message hit → `navigate('/chat/{chatId}?goto={messageId}')`.

### 5.2 Navigation to hit on ChatRoomScreen

1. `useSearchParams()` reads `goto`. If present, switches the messages-loading branch.
2. `useQuery({ queryKey: chatKeys.messages(chatId), queryFn: () => fetchMessages(chatId, { around: goto, radius: 25 }) })` — same cache key as the no-goto path so WS patches still apply.
3. On load: locate `[data-message-id={goto}]`, `scrollIntoView({ block: 'center' })`, add `chat-bubble--flash`. After 1200 ms: remove class, call `setSearchParams({}, { replace: true })` so refresh doesn't re-trigger.
4. Up-scroll past the oldest loaded message → `fetchMessages(chatId, { before: oldestId })` and prepend.
5. Down-scroll past the newest loaded message (only meaningful in around-mode) → `fetchMessages(chatId, { after: newestId })` and append.
6. Without `?goto` — pure `before` cursor as today.

### 5.3 WS interaction

- `message:new` / `message:deleted` patch `chatKeys.messages(chatId)` regardless of how it was loaded. Cache key has no `around` segment, so patches always hit the right slot.
- `chatKeys.searchMessages(q)` queries are NOT invalidated by WS events. Search is a lookup, not a live view; next keystroke or 30s `staleTime` expiry refreshes naturally. Invalidating all in-flight searches per inbound message would burn server capacity for negligible benefit.

### 5.4 Race conditions

- Fast typing: TanStack auto-cancels stale queries on `queryKey` change. Stale responses never reach the UI.
- User taps result before debounce settles: `navigate()` is synchronous, dropdown unmounts, in-flight query is cancelled by the unmount.
- Double `?goto` (user taps a second hit without leaving the chat): React Router updates search params, `useEffect` reruns with new `goto`, reloads `around`, scrolls. Old flash timer is cleared in the effect's cleanup function.

## 6. Server changes

### 6.1 `getMessages` extension

`packages/server/src/chat/service.ts → getMessages(pool, currentUserId, chatId, opts)`:

- Existing opts: `{ before?: string; limit?: number }`.
- Extended opts: `{ before?: string; after?: string; around?: string; radius?: number; limit?: number }`.
- `around` is mutually exclusive with `before`/`after` (validated at the route layer).
- When `around` is present:

  ```sql
  with anchor as (
    select created_at from messages
     where id = $around and chat_id = $chatId and is_deleted = false
  )
  select m.*, …
    from messages m
   where m.chat_id = $chatId
     and m.is_deleted = false
     and m.created_at >= coalesce(
       (select created_at from messages
         where chat_id = $chatId and is_deleted = false
           and created_at <= (select created_at from anchor)
         order by created_at desc
         limit 1 offset $radius),
       (select min(created_at) from messages where chat_id = $chatId and is_deleted = false)
     )
     and m.created_at <= coalesce(
       (select created_at from messages
         where chat_id = $chatId and is_deleted = false
           and created_at >= (select created_at from anchor)
         order by created_at asc
         limit 1 offset $radius),
       (select max(created_at) from messages where chat_id = $chatId and is_deleted = false)
     )
   order by m.created_at asc;
  ```

- If `anchor` is empty (anchor message doesn't exist, is in a different chat, or is soft-deleted) → service throws `NotFoundError`, route returns 404.
- Reactions are batch-loaded via the existing `WHERE message_id = ANY($1::uuid[])` path — no change needed.
- `after` cursor: `WHERE created_at > (select created_at from messages where id=$after) ORDER BY created_at asc LIMIT $limit`. Uses the same partial index as `before`.

### 6.2 Route validation

`packages/server/src/chat/routes.ts → GET /chat/:chatId/messages` zod schema:

```ts
z.object({
  before: z.string().uuid().optional(),
  after:  z.string().uuid().optional(),
  around: z.string().uuid().optional(),
  radius: z.coerce.number().int().min(1).max(50).optional(),
  limit:  z.coerce.number().int().min(1).max(50).optional(),
}).refine(
  (o) => !(o.around && (o.before || o.after)),
  { message: 'around is mutually exclusive with before/after' },
)
```

`assertCanAccessChat` already runs as a preHandler on this route — reused for around-mode without changes.

### 6.3 Performance

- `messages.search_vector` GIN index is in place from PR 1. Search latency p95 expected < 100 ms on 10k+ messages.
- Around query: two `LIMIT 1 OFFSET $radius` subselects against the partial index `(chat_id, created_at) WHERE is_deleted = false`. At `radius=25`, both are index-only scans of 25 rows. Cheap.
- Reactions batch fetch unchanged.

## 7. Edge cases (consolidated)

- `q` shorter than 2 (after `trim()`) → dropdown not opened.
- `q` whitespace-only → same as above.
- Server returns `[]` → "Ничего не найдено по «`{q}`»" card.
- Server 5xx / network error → `.glass-dark` row with retry button.
- User clears `q` → dropdown closes; in-flight query unmounted/cancelled.
- Untrusted content safety: results rendered as React text nodes; tokens regex-escaped before `RegExp` construction; highlighted matches wrapped in React `<mark>` elements (not raw HTML strings).
- Long content: client trims via `excerptAround`, ensures highlight is on screen.
- System-channel hit: navigation works for non-member system channels (server already includes them in search; `assertCanAccessChat` whitelists `type=system`).
- `goto=invalidUuid` / message in another chat / soft-deleted → server 404 → ChatRoomScreen drops `?goto`, falls back to default `before`-cursor load, shows inline "Сообщение недоступно" banner.
- Chat has fewer than 2*radius+1 messages → `around` returns whatever exists, `before/after` cursors stay null, infinite scroll disabled. No special-casing needed.
- WS `message:new` arrives while in around-mode → appended via existing patch path (cache key unchanged).
- WS `message:deleted` for the goto target → bubble becomes `is_deleted=true, content=''`, the flash continues over the now-empty bubble. Acceptable.
- Double `?goto` mid-session → effect cleanup cancels old flash timer, new goto reloads.

## 8. Testing strategy

### 8.1 Server (vitest + Postgres)

`packages/server/test/chat/routes.test.ts` extension:

- `GET /chat/:chatId/messages?around=<id>&radius=10` → `2*radius+1` messages, `created_at asc`, hit in middle.
- `around` with fewer than radius messages on one side → returns whatever exists, no error.
- `around` for a soft-deleted message → 404.
- `around` for a message in a different chat → 404 (no leak via id-only).
- `around` for non-existent uuid → 404.
- `around + before` simultaneously → 400 (zod refine).
- `around + after` simultaneously → 400.
- `radius > 50` → 400.
- `after=<id>` returns only newer messages, asc, no overlap with `before`.
- Non-member, non-system chat → 403 (preHandler).

`packages/server/test/chat/service.test.ts`:

- Unit on `getMessages` `around` branch with seeded fixture (10 messages, around=middle, radius=3 → 7 messages).
- Reactions are batch-loaded for around results.

### 8.2 Web (vitest + jsdom)

- `chat/test/SearchResultsDropdown.test.tsx`:
  - renders "Чаты" section from props with no network.
  - `q.length < 2` → "Сообщения" section not rendered.
  - `q.length >= 2` → calls mocked `apiFetch`, renders cards.
  - loading state — `Loader2` in section header.
  - empty state — "Ничего не найдено" card.
  - error state — `.glass-dark` retry row; click → second `apiFetch` call.
  - tap message card → `useNavigate` mock receives `/chat/{chatId}?goto={messageId}`.
  - tap chat card → `/chat/{chatId}` with no goto param.

- `chat/test/HighlightedText.test.tsx`:
  - single token, single match → one `<mark>`.
  - multiple tokens, mixed cases → all matches wrapped, original casing preserved.
  - empty token array → text returned as-is, no marks.
  - regex metacharacters in token (`.*`, `\d`) treated as literals.
  - script-tag-like text rendered as literal text, not parsed.

- `chat/test/searchUtils.test.ts`:
  - `excerptAround` centers on first match, returns `…prefix…suffix…`.
  - match at start — no leading `…`.
  - match at end — no trailing `…`.
  - no matches — first `ctxBefore + ctxAfter` chars.

- `lib/useDebouncedValue.test.ts`:
  - input change → value updates after `delay` ms (`vi.useFakeTimers`).
  - rapid changes → intermediate values discarded.
  - unmount mid-debounce → timer cleared, no warnings.

- `chat/test/ChatRoomScreen.test.tsx` extension:
  - `?goto=<id>` → calls `fetchMessages(chatId, { around, radius: 25 })`.
  - after load — `scrollIntoView` mock invoked, `chat-bubble--flash` class on DOM node, removed after 1200 ms (fake timers).
  - 404 from around → inline banner "Сообщение недоступно", falls back to default load.
  - `?goto` removed from URL after first render (`setSearchParams({}, { replace: true })`).

- `chat/test/ChatListScreen.test.tsx` extension:
  - `q='ab'` → `<SearchResultsDropdown>` mounted.
  - `q='a'` → dropdown not visible, regular chat list rendered.
  - 300 ms debounce — `searchMessagesApi` called only after `vi.advanceTimersByTime(300)`.

## 9. Files created / modified — summary

**Created:**

- `packages/web/src/chat/components/SearchResultsDropdown.tsx`
- `packages/web/src/chat/components/HighlightedText.tsx`
- `packages/web/src/chat/searchUtils.ts`
- `packages/web/src/lib/useDebouncedValue.ts`
- `packages/web/src/chat/test/SearchResultsDropdown.test.tsx`
- `packages/web/src/chat/test/HighlightedText.test.tsx`
- `packages/web/src/chat/test/searchUtils.test.ts`
- `packages/web/src/lib/useDebouncedValue.test.ts`
- `docs/superpowers/plans/2026-04-27-internal-chat-pr7-search-modal.md` (will be written by writing-plans skill)

**Modified:**

- `packages/web/src/chat/screens/ChatListScreen.tsx`
- `packages/web/src/chat/screens/ChatRoomScreen.tsx`
- `packages/web/src/chat/components/ChatBubble.tsx` (add `data-message-id`)
- `packages/web/src/chat/api.ts` (extend `fetchMessages` opts)
- `packages/web/src/lib/queryKeys.ts` (add `chatKeys.searchMessages`)
- `packages/web/src/app/design-system.css` (add `.chat-bubble--flash` + reduced-motion fallback)
- `packages/web/src/chat/test/ChatListScreen.test.tsx`
- `packages/web/src/chat/test/ChatRoomScreen.test.tsx`
- `packages/server/src/chat/service.ts` (`getMessages` `around` + `after` branches)
- `packages/server/src/chat/routes.ts` (zod schema for new query params)
- `packages/server/test/chat/routes.test.ts`
- `packages/server/test/chat/service.test.ts`
- `CLAUDE.md` (one-line note on PR 7 scope, ≤200 lines kept)

## 10. Acceptance criteria (manual)

- Type at least 2 chars in the chat-list search input → dropdown opens with "Чаты" + "Сообщения" sections.
- Tap a message hit older than the current scroll → land in chat with the message centered, briefly highlighted, surrounded by older + newer context.
- Refresh the chat-room URL (which still has `?goto=...` on initial load only because we strip it) → no re-flash, normal load.
- Open dev-tools network: typing `abc` triggers exactly ONE `/chat/search` call after 300 ms idle (debounce verified).
- Empty result → see "Ничего не найдено" card.
- Kill server, retry → see retry row, recover on success.
- Two browser windows: send a message in chat A from window 2, search for it from window 1 (after a small delay) → finds it (assuming `staleTime` expired or fresh query) and navigation works.
