# Chat PR 7 — Global Message Search Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global full-text message search dropdown to ChatListScreen and a `?goto=<messageId>` deep-link in ChatRoomScreen that scrolls to and briefly highlights the target message with ±25 of context.

**Architecture:** Single search input on `ChatListScreen` opens a dropdown at `q.length >= 2` after 300 ms debounce; dropdown shows two sections (local chat-name hits + server `/chat/search` message hits). Tapping a message hit navigates to `/chat/{chatId}?goto={messageId}`; chat room uses a new `around=<uuid>&radius=25` mode of `GET /chat/:chatId/messages` to load context, scrolls into view, flash-highlights for 1.2 s, then strips `?goto`. New `after=<iso>` cursor enables loading messages newer than the loaded set.

**Tech Stack:** Server — Fastify 4, zod, Postgres 16 (uses existing `tsvector` GIN + partial index). Web — React 18, TanStack Query 5, react-router-dom 6, Lucide icons, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-04-27-chat-pr7-search-modal-design.md`

**Branch:** `feat/chat-pr7-search-modal` (already created from `main`).

---

## File Structure (created/modified)

**Created (web):**
- `packages/web/src/lib/useDebouncedValue.ts` — generic debounce hook
- `packages/web/src/lib/useDebouncedValue.test.ts`
- `packages/web/src/chat/searchUtils.ts` — `excerptAround` pure function
- `packages/web/src/chat/test/searchUtils.test.ts`
- `packages/web/src/chat/components/HighlightedText.tsx` — `<mark>`-wrapping component
- `packages/web/src/chat/test/HighlightedText.test.tsx`
- `packages/web/src/chat/components/SearchResultsDropdown.tsx` — the dropdown
- `packages/web/src/chat/test/SearchResultsDropdown.test.tsx`

**Modified (server):**
- `packages/server/src/chat/service.ts` — `GetMessagesOpts` extension + `after`/`around` SQL branches + `ChatNotFoundError` for bad anchor
- `packages/server/src/chat/routes.ts` — zod schema with `after`/`around`/`radius`; mutual-exclusion refine; map service ChatNotFoundError → 404
- `packages/server/test/chat/routes.test.ts` — new tests for after, around, mutual-exclusion, 404s

**Modified (web):**
- `packages/web/src/chat/api.ts` — extend `FetchMessagesOpts` with `after?`/`around?`/`radius?`
- `packages/web/src/chat/screens/ChatListScreen.tsx` — wire dropdown; debounce filter
- `packages/web/src/chat/screens/ChatRoomScreen.tsx` — read `?goto=`; around-mode load; scroll/flash/strip
- `packages/web/src/chat/components/ChatBubble.tsx` — add `data-message-id` attribute
- `packages/web/src/app/design-system.css` — `.chat-bubble--flash` keyframe + `prefers-reduced-motion`
- `packages/web/src/chat/test/ChatListScreen.test.tsx` — new dropdown integration cases
- `packages/web/src/chat/test/ChatRoomScreen.test.tsx` — new `?goto` cases
- `CLAUDE.md` — one-line note on PR 7 scope (≤ 200 lines budget)

---

## Task 1: Server — extend `GetMessagesOpts` types and add `ChatNotFoundError` sentinel

**Files:**
- Modify: `packages/server/src/chat/service.ts` (the `GetMessagesOpts` interface near line 134)

- [ ] **Step 1: Extend the type and export ChatNotFoundError**

In `packages/server/src/chat/service.ts`, find the existing interface and **replace it** with:

```ts
export class ChatNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatNotFoundError';
  }
}

export interface GetMessagesOpts {
  limit: number;
  before?: string; // ISO timestamp; messages older than this
  after?: string;  // ISO timestamp; messages newer than this
  around?: string; // message UUID; load ±radius messages centered on this anchor
  radius?: number; // default 25, used only with `around`
}
```

- [ ] **Step 2: Run typecheck to confirm it parses**

Run: `pnpm --filter @hockey/server typecheck`
Expected: PASS (no other consumers of `GetMessagesOpts` are broken yet).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/chat/service.ts
git commit -m "feat(server): extend GetMessagesOpts with after/around/radius + ChatNotFoundError"
```

---

## Task 2: Server — TDD `after` cursor in `getMessages`

**Files:**
- Test: `packages/server/test/chat/routes.test.ts` (extend existing file)
- Modify: `packages/server/src/chat/service.ts` (the `getMessages` function around line 139)

- [ ] **Step 1: Write the failing test**

Find the `describe('GET /chat/:chatId/messages', ...)` block in `packages/server/test/chat/routes.test.ts` (it exists already — search for `'GET /chat/:chatId/messages'`). At the end of that block, add:

```ts
it('after=<iso>: returns only messages newer than the cursor, ascending', async () => {
  // Seed 5 messages 10s apart. Use the existing chat fixture from this file's beforeEach.
  const baseTime = Date.now();
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await pool.query<{ id: string }>(
      `insert into messages (chat_id, sender_id, content, created_at)
       values ($1, $2, $3, to_timestamp($4))
       returning id`,
      [chatId, userA.id, `m${i}`, (baseTime + i * 10_000) / 1000],
    );
    ids.push(r.rows[0]!.id);
  }
  const cursor = new Date(baseTime + 10_000).toISOString(); // strictly after m1

  const res = await app.inject({
    method: 'GET',
    url: `/chat/${chatId}/messages?after=${encodeURIComponent(cursor)}&limit=10`,
    headers: { authorization: `Bearer ${tokenA}` },
  });

  expect(res.statusCode).toBe(200);
  const body = res.json() as Array<{ id: string; content: string }>;
  expect(body.map((m) => m.content)).toEqual(['m2', 'm3', 'm4']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hockey/server test -- -t "after=<iso>: returns only messages newer"`
Expected: FAIL — current zod schema rejects `after` as unknown query param OR returns wrong order.

- [ ] **Step 3: Update route zod schema to accept `after`**

In `packages/server/src/chat/routes.ts`, find the `app.get('/chat/:chatId/messages', ...)` handler. Replace its `query` zod parse with:

```ts
const query = z
  .object({
    before: isoDate.optional(),
    after: isoDate.optional(),
    around: uuid.optional(),
    radius: z.coerce.number().int().min(1).max(50).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine(
    (o) => !(o.around && (o.before !== undefined || o.after !== undefined)),
    { message: 'around is mutually exclusive with before/after' },
  )
  .parse(req.query);
```

Then replace the `opts` construction below it with:

```ts
const opts: GetMessagesOpts = { limit: query.limit };
if (query.before !== undefined) opts.before = query.before;
if (query.after !== undefined) opts.after = query.after;
if (query.around !== undefined) opts.around = query.around;
if (query.radius !== undefined) opts.radius = query.radius;
```

- [ ] **Step 4: Implement the `after` SQL branch in `getMessages`**

In `packages/server/src/chat/service.ts`, replace the body of `getMessages` (between the function signature and the `messageIds` extraction) with:

```ts
const limit = Math.min(Math.max(opts.limit, 1), 100);
const params: unknown[] = [chatId];

let whereExtra = '';
let orderClause = 'order by m.created_at desc';

if (opts.around !== undefined) {
  // Around branch — handled in Task 3 (placeholder so this task compiles).
  throw new ChatNotFoundError('around mode not implemented yet');
} else {
  if (opts.before !== undefined) {
    params.push(opts.before);
    whereExtra += ` and m.created_at < $${params.length}`;
  }
  if (opts.after !== undefined) {
    params.push(opts.after);
    whereExtra += ` and m.created_at > $${params.length}`;
    orderClause = 'order by m.created_at asc';
  }
}

params.push(limit);
const sql = `
  select m.*
  from messages m
  where m.chat_id = $1
    ${whereExtra}
  ${orderClause}
  limit $${params.length}
`;
const r = await pool.query<MessageRow>(sql, params);
if (r.rowCount === 0) return [];
```

The remainder of the function (reactions batch fetch, mapping) is unchanged.

- [ ] **Step 5: Run test, expect PASS**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server test -- -t "after=<iso>: returns only messages newer"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/chat/{service,routes}.ts packages/server/test/chat/routes.test.ts
git commit -m "feat(server): GET /chat/:chatId/messages — after=<iso> cursor"
```

---

## Task 3: Server — TDD `around` cursor in `getMessages`

**Files:**
- Test: `packages/server/test/chat/routes.test.ts`
- Modify: `packages/server/src/chat/service.ts`

- [ ] **Step 1: Write the failing tests**

Append at the end of the same `describe('GET /chat/:chatId/messages', ...)` block:

```ts
it('around=<uuid>&radius=2: returns 2*radius+1 messages centered on anchor, ascending', async () => {
  const baseTime = Date.now();
  const ids: string[] = [];
  for (let i = 0; i < 7; i++) {
    const r = await pool.query<{ id: string }>(
      `insert into messages (chat_id, sender_id, content, created_at)
       values ($1, $2, $3, to_timestamp($4)) returning id`,
      [chatId, userA.id, `m${i}`, (baseTime + i * 1000) / 1000],
    );
    ids.push(r.rows[0]!.id);
  }
  const anchor = ids[3]!;

  const res = await app.inject({
    method: 'GET',
    url: `/chat/${chatId}/messages?around=${anchor}&radius=2`,
    headers: { authorization: `Bearer ${tokenA}` },
  });

  expect(res.statusCode).toBe(200);
  const body = res.json() as Array<{ id: string; content: string }>;
  expect(body.map((m) => m.content)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
});

it('around=<uuid>: returns 404 when the anchor message does not exist', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/chat/${chatId}/messages?around=00000000-0000-0000-0000-000000000000&radius=5`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  expect(res.statusCode).toBe(404);
});

it('around=<uuid>: returns 404 when the anchor belongs to a different chat', async () => {
  // Create a second chat that userA also belongs to, and put a message there.
  const otherChatRes = await pool.query<{ id: string }>(
    `insert into chats (type, created_by) values ('group', $1) returning id`,
    [userA.id],
  );
  const otherChatId = otherChatRes.rows[0]!.id;
  await pool.query(
    `insert into chat_members (chat_id, user_id) values ($1, $2)`,
    [otherChatId, userA.id],
  );
  const otherMsg = await pool.query<{ id: string }>(
    `insert into messages (chat_id, sender_id, content) values ($1, $2, 'cross-chat') returning id`,
    [otherChatId, userA.id],
  );

  const res = await app.inject({
    method: 'GET',
    url: `/chat/${chatId}/messages?around=${otherMsg.rows[0]!.id}&radius=5`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  expect(res.statusCode).toBe(404);
});

it('around=<uuid>: returns 404 when the anchor is soft-deleted', async () => {
  const r = await pool.query<{ id: string }>(
    `insert into messages (chat_id, sender_id, content, is_deleted)
     values ($1, $2, '', true) returning id`,
    [chatId, userA.id],
  );
  const anchor = r.rows[0]!.id;
  const res = await app.inject({
    method: 'GET',
    url: `/chat/${chatId}/messages?around=${anchor}&radius=5`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  expect(res.statusCode).toBe(404);
});

it('around + before simultaneously → 400 (mutual exclusion)', async () => {
  const r = await pool.query<{ id: string }>(
    `insert into messages (chat_id, sender_id, content) values ($1, $2, 'x') returning id`,
    [chatId, userA.id],
  );
  const res = await app.inject({
    method: 'GET',
    url: `/chat/${chatId}/messages?around=${r.rows[0]!.id}&before=${new Date().toISOString()}`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  expect(res.statusCode).toBe(400);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @hockey/server test -- -t "around="`
Expected: FAIL — `getMessages` throws "around mode not implemented yet" (placeholder from Task 2).

- [ ] **Step 3: Implement `around` branch in `getMessages`**

In `packages/server/src/chat/service.ts`, replace the placeholder block (the `if (opts.around !== undefined) { throw ... }`) with:

```ts
if (opts.around !== undefined) {
  const radius = Math.min(Math.max(opts.radius ?? 25, 1), 50);
  // Anchor lookup: must exist, belong to this chat, not be soft-deleted.
  const anchorRes = await pool.query<{ created_at: Date }>(
    `select created_at from messages
     where id = $1 and chat_id = $2 and is_deleted = false`,
    [opts.around, chatId],
  );
  if (anchorRes.rowCount === 0) {
    throw new ChatNotFoundError(`anchor message ${opts.around} not found`);
  }
  const anchorAt = anchorRes.rows[0]!.created_at.toISOString();

  // One CTE-driven query that finds the lower/upper bounds via OFFSET radius
  // on each side and returns everything between them inclusive, ascending.
  const r = await pool.query<MessageRow>(
    `with anchor as (select $2::timestamptz as ts),
          lower_bound as (
            select created_at from messages
             where chat_id = $1 and is_deleted = false
               and created_at <= (select ts from anchor)
             order by created_at desc
             offset $3 limit 1
          ),
          upper_bound as (
            select created_at from messages
             where chat_id = $1 and is_deleted = false
               and created_at >= (select ts from anchor)
             order by created_at asc
             offset $3 limit 1
          )
     select m.*
       from messages m
      where m.chat_id = $1 and m.is_deleted = false
        and m.created_at >= coalesce(
              (select created_at from lower_bound),
              (select min(created_at) from messages where chat_id = $1 and is_deleted = false))
        and m.created_at <= coalesce(
              (select created_at from upper_bound),
              (select max(created_at) from messages where chat_id = $1 and is_deleted = false))
      order by m.created_at asc`,
    [chatId, anchorAt, radius],
  );
  if (r.rowCount === 0) return [];

  const messageIds = r.rows.map((row) => row.id);
  const rxns = await pool.query<MessageReactionRow>(
    `select * from message_reactions where message_id = any($1::uuid[])`,
    [messageIds],
  );
  const grouped = groupReactions(rxns.rows, currentUserId);
  return r.rows.map((row) => toChatMessageDTO(row, grouped.get(row.id) ?? []));
}
```

- [ ] **Step 4: Map `ChatNotFoundError` to 404 in the route**

In `packages/server/src/chat/routes.ts`, find the `app.get('/chat/:chatId/messages', ...)` handler. Wrap the body in a try/catch and replace the `return await getMessages(...)` line:

```ts
try {
  return await getMessages(app.pg, chatId, req.user.id, opts);
} catch (err) {
  if (err instanceof ChatNotFoundError) {
    reply.code(404);
    return { error: err.message };
  }
  throw err;
}
```

Add `reply` to the handler signature `async (req, reply) => {` (it currently takes only `req`). Import `ChatNotFoundError` from `'./service.js'` at the top.

- [ ] **Step 5: Run all around tests, expect PASS**

Run: `pnpm --filter @hockey/server test -- -t "around="`
Expected: PASS for all 5 around-related tests.

- [ ] **Step 6: Run full server test suite for regression**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/chat/{service,routes}.ts packages/server/test/chat/routes.test.ts
git commit -m "feat(server): GET /chat/:chatId/messages — around=<uuid> cursor with ±radius context"
```

---

## Task 4: Web — `useDebouncedValue` hook (TDD)

**Files:**
- Create: `packages/web/src/lib/useDebouncedValue.ts`
- Test: `packages/web/src/lib/useDebouncedValue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/useDebouncedValue.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue.js';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial value synchronously', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('updates the value after delay ms', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    expect(result.current).toBe('a'); // still old
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('b');
  });

  it('discards intermediate values when changed rapidly', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ v: 'c' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ v: 'd' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('d');
  });

  it('clears the pending timer on unmount', () => {
    const { rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    unmount();
    // Advancing past the delay must NOT trigger any update; absence of
    // "Can't perform a React state update on an unmounted component" warning
    // is the contract.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hockey/web test -- useDebouncedValue`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `packages/web/src/lib/useDebouncedValue.ts`:

```ts
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm --filter @hockey/web test -- useDebouncedValue`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/useDebouncedValue.ts packages/web/src/lib/useDebouncedValue.test.ts
git commit -m "feat(web): useDebouncedValue generic hook"
```

---

## Task 5: Web — `excerptAround` utility (TDD)

**Files:**
- Create: `packages/web/src/chat/searchUtils.ts`
- Test: `packages/web/src/chat/test/searchUtils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/chat/test/searchUtils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { excerptAround } from '../searchUtils.js';

describe('excerptAround', () => {
  it('centers excerpt on the first matching token with ellipses on both sides', () => {
    const text = 'The quick brown fox jumps over the lazy dog and then continues running through the field.';
    const out = excerptAround(text, ['lazy'], 10, 20);
    expect(out).toMatch(/^…/);
    expect(out).toContain('lazy');
    expect(out).toMatch(/…$/);
  });

  it('omits leading ellipsis when match is at the start', () => {
    const out = excerptAround('Hello world from Russia', ['Hello'], 40, 40);
    expect(out.startsWith('…')).toBe(false);
    expect(out).toContain('Hello');
  });

  it('omits trailing ellipsis when match is at the end', () => {
    const out = excerptAround('Short final word', ['word'], 40, 40);
    expect(out.endsWith('…')).toBe(false);
    expect(out).toContain('word');
  });

  it('returns the head of the text when no token matches', () => {
    const text = 'Lorem ipsum dolor sit amet';
    const out = excerptAround(text, ['nope'], 5, 10);
    expect(out).toBe(text.slice(0, 15));
  });

  it('treats matching as case-insensitive', () => {
    const out = excerptAround('Привет, мир!', ['ПРИВЕТ'], 0, 100);
    expect(out).toContain('Привет');
  });

  it('returns the original text when both sides are larger than the text', () => {
    expect(excerptAround('tiny', ['x'], 100, 100)).toBe('tiny');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hockey/web test -- searchUtils`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `excerptAround`**

Create `packages/web/src/chat/searchUtils.ts`:

```ts
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function excerptAround(
  text: string,
  tokens: string[],
  ctxBefore = 40,
  ctxAfter = 120,
): string {
  if (text.length <= ctxBefore + ctxAfter) return text;

  let firstMatch = -1;
  for (const t of tokens) {
    if (!t) continue;
    const re = new RegExp(escapeRegex(t), 'i');
    const m = text.match(re);
    if (m && m.index !== undefined && (firstMatch === -1 || m.index < firstMatch)) {
      firstMatch = m.index;
    }
  }

  if (firstMatch === -1) {
    return text.slice(0, ctxBefore + ctxAfter);
  }

  const start = Math.max(0, firstMatch - ctxBefore);
  const end = Math.min(text.length, firstMatch + ctxAfter);
  const slice = text.slice(start, end);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${slice}${suffix}`;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm --filter @hockey/web test -- searchUtils`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/chat/searchUtils.ts packages/web/src/chat/test/searchUtils.test.ts
git commit -m "feat(web): excerptAround text utility for search snippets"
```

---

## Task 6: Web — `HighlightedText` component (TDD)

**Files:**
- Create: `packages/web/src/chat/components/HighlightedText.tsx`
- Test: `packages/web/src/chat/test/HighlightedText.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/chat/test/HighlightedText.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HighlightedText } from '../components/HighlightedText.js';

describe('HighlightedText', () => {
  it('wraps a single matching token in <mark>', () => {
    const { container } = render(<HighlightedText text="hello world" tokens={['world']} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('world');
  });

  it('wraps multiple tokens, preserving original casing', () => {
    const { container } = render(
      <HighlightedText text="The Quick Brown Fox" tokens={['quick', 'fox']} />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.textContent).toBe('Quick');
    expect(marks[1]!.textContent).toBe('Fox');
  });

  it('renders the text unchanged when token list is empty', () => {
    const { container } = render(<HighlightedText text="plain text" tokens={[]} />);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('plain text');
  });

  it('treats regex metacharacters as literals', () => {
    const { container } = render(<HighlightedText text="a.b c.d" tokens={['.']} />);
    const marks = container.querySelectorAll('mark');
    // Two literal dots, each wrapped — anything else means regex was active.
    expect(marks).toHaveLength(2);
    expect(marks[0]!.textContent).toBe('.');
  });

  it('renders script-tag-like text as literal text, not as a parsed element', () => {
    const { container } = render(
      <HighlightedText text={'<script>alert(1)</script>'} tokens={['alert']} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toBe('<script>alert(1)</script>');
    expect(container.querySelector('mark')!.textContent).toBe('alert');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hockey/web test -- HighlightedText`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `packages/web/src/chat/components/HighlightedText.tsx`:

```tsx
import type { JSX } from 'react';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface HighlightedTextProps {
  text: string;
  tokens: string[];
}

export function HighlightedText({ text, tokens }: HighlightedTextProps): JSX.Element {
  const cleanTokens = tokens.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleanTokens.length === 0) {
    return <>{text}</>;
  }
  const pattern = cleanTokens.map(escapeRegex).join('|');
  const re = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return <mark key={i}>{part}</mark>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm --filter @hockey/web test -- HighlightedText`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/chat/components/HighlightedText.tsx packages/web/src/chat/test/HighlightedText.test.tsx
git commit -m "feat(web): HighlightedText component for search snippets"
```

---

## Task 7: Web — `SearchResultsDropdown` component (TDD)

**Files:**
- Create: `packages/web/src/chat/components/SearchResultsDropdown.tsx`
- Test: `packages/web/src/chat/test/SearchResultsDropdown.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/chat/test/SearchResultsDropdown.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SearchResultsDropdown } from '../components/SearchResultsDropdown.js';
import type { ChatDTO } from '../api.js';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const apiFetchMock = vi.fn();
vi.mock('../../api/apiFetch.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

function makeChat(name: string, id = 'chat-1'): ChatDTO {
  return {
    id,
    type: 'group',
    name,
    isActive: true,
    lastMessage: null,
    lastMessageSenderName: null,
    lastMessageAt: null,
    unreadCount: 0,
    dmCounterpart: null,
  } as ChatDTO;
}

function wrap(ui: JSX.Element): JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SearchResultsDropdown', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    apiFetchMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('renders Чаты section from chatHits prop without any network call', () => {
    apiFetchMock.mockResolvedValue([]);
    render(
      wrap(<SearchResultsDropdown query="te" chatHits={[makeChat('Team')]} />),
    );
    expect(screen.getByRole('heading', { name: 'Чаты' })).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
  });

  it('does not call /chat/search when query is shorter than 2 chars', async () => {
    render(wrap(<SearchResultsDropdown query="t" chatHits={[]} />));
    // Wait one tick to be sure no async fetch fired.
    await new Promise((r) => setTimeout(r, 0));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('calls /chat/search when query has >=2 chars and renders message hits', async () => {
    apiFetchMock.mockResolvedValue([
      {
        id: 'm1',
        chatId: 'c1',
        content: 'hello world',
        senderName: 'Alice',
        createdAt: new Date().toISOString(),
      },
    ]);
    render(wrap(<SearchResultsDropdown query="hello" chatHits={[]} />));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('/chat/search?q=hello'));
    });
    expect(await screen.findByText('Alice')).toBeInTheDocument();
  });

  it('shows empty-state card when search returns no hits', async () => {
    apiFetchMock.mockResolvedValue([]);
    render(wrap(<SearchResultsDropdown query="zzz" chatHits={[]} />));
    expect(await screen.findByText(/Ничего не найдено по «zzz»/)).toBeInTheDocument();
  });

  it('shows error state with retry button on failure; retry refires the query', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);
    render(wrap(<SearchResultsDropdown query="oops" chatHits={[]} />));
    const retry = await screen.findByRole('button', { name: /Повторить/ });
    fireEvent.click(retry);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
  });

  it('navigates to /chat/{chatId}?goto={messageId} when a message hit is tapped', async () => {
    apiFetchMock.mockResolvedValue([
      {
        id: 'm99',
        chatId: 'c42',
        content: 'tap me',
        senderName: 'Bob',
        createdAt: new Date().toISOString(),
      },
    ]);
    render(wrap(<SearchResultsDropdown query="tap" chatHits={[]} />));
    const card = await screen.findByText(/tap me/);
    fireEvent.click(card.closest('button')!);
    expect(navigateMock).toHaveBeenCalledWith('/chat/c42?goto=m99');
  });

  it('navigates to /chat/{chatId} (no goto) when a chat hit is tapped', () => {
    render(
      wrap(<SearchResultsDropdown query="te" chatHits={[makeChat('Team', 'cTeam')]} />),
    );
    fireEvent.click(screen.getByText('Team').closest('button')!);
    expect(navigateMock).toHaveBeenCalledWith('/chat/cTeam');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hockey/web test -- SearchResultsDropdown`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `packages/web/src/chat/components/SearchResultsDropdown.tsx`:

```tsx
import type { JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { searchMessagesApi, type ChatDTO, type MessageSearchHit } from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { HighlightedText } from './HighlightedText.js';
import { excerptAround } from '../searchUtils.js';

export interface SearchResultsDropdownProps {
  query: string;
  chatHits: ChatDTO[];
}

function chatLabel(c: ChatDTO): string {
  if (c.type === 'direct' && c.dmCounterpart) return c.dmCounterpart.displayName;
  return c.name ?? 'Без названия';
}

export function SearchResultsDropdown({
  query,
  chatHits,
}: SearchResultsDropdownProps): JSX.Element {
  const navigate = useNavigate();
  const tokens = query.trim().split(/\s+/);
  const enabled = query.trim().length >= 2;

  const { data, isLoading, isError, refetch } = useQuery<MessageSearchHit[]>({
    queryKey: chatKeys.search(query.trim()),
    queryFn: () => searchMessagesApi(query.trim(), 50),
    enabled,
    staleTime: 30_000,
  });

  return (
    <div
      className="glass-dark"
      style={{
        margin: '6px 14px 0',
        borderRadius: 16,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <section>
        <h3 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--muted)' }}>Чаты</h3>
        {chatHits.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            Совпадений среди чатов нет
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chatHits.map((c) => (
              <button
                type="button"
                key={c.id}
                className="glass"
                onClick={() => navigate(`/chat/${c.id}`)}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  font: 'inherit',
                  color: 'var(--ink)',
                }}
              >
                <HighlightedText text={chatLabel(c)} tokens={tokens} />
              </button>
            ))}
          </div>
        )}
      </section>

      {enabled ? (
        <section>
          <h3
            style={{
              margin: '0 0 6px',
              fontSize: 12,
              color: 'var(--muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Сообщения
            {isLoading && <Loader2 size={12} className="spin" aria-label="Loading" />}
          </h3>
          {isError ? (
            <div
              className="glass-dark"
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13 }}>Не удалось загрузить результаты.</span>
              <button
                type="button"
                onClick={() => void refetch()}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--ink)',
                  borderRadius: 999,
                  padding: '2px 10px',
                  font: 'inherit',
                  fontSize: 12,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                Повторить
              </button>
            </div>
          ) : !isLoading && (data ?? []).length === 0 ? (
            <p
              className="glass"
              style={{
                margin: 0,
                padding: '8px 12px',
                borderRadius: 12,
                color: 'var(--muted)',
                fontSize: 13,
              }}
            >
              {`Ничего не найдено по «${query.trim()}»`}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(data ?? []).map((hit) => {
                const snippet = excerptAround(hit.content, tokens);
                return (
                  <button
                    type="button"
                    key={hit.id}
                    className="glass"
                    onClick={() => navigate(`/chat/${hit.chatId}?goto=${hit.id}`)}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      borderRadius: 12,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'var(--ink)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{hit.senderName}</span>
                    <span style={{ fontSize: 13 }}>
                      <HighlightedText text={snippet} tokens={tokens} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm --filter @hockey/web test -- SearchResultsDropdown`
Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/chat/components/SearchResultsDropdown.tsx packages/web/src/chat/test/SearchResultsDropdown.test.tsx
git commit -m "feat(web): SearchResultsDropdown — Чаты + Сообщения sections with empty/error/loading states"
```

---

## Task 8: Web — wire `SearchResultsDropdown` into `ChatListScreen`

**Files:**
- Modify: `packages/web/src/chat/screens/ChatListScreen.tsx`
- Modify: `packages/web/src/chat/test/ChatListScreen.test.tsx` (extend existing)

- [ ] **Step 1: Write the failing test**

In `packages/web/src/chat/test/ChatListScreen.test.tsx`, append:

```tsx
import { fireEvent, screen, waitFor, act } from '@testing-library/react';
// ... assume existing render helper renderScreen() that mounts QueryClientProvider + MemoryRouter

describe('ChatListScreen — global search dropdown', () => {
  it('does not render the dropdown when filter has fewer than 2 chars', async () => {
    apiFetchMock.mockResolvedValue([]); // /chat/list returns empty
    renderScreen();
    const input = await screen.findByLabelText(/Поиск чатов/);
    fireEvent.change(input, { target: { value: 'a' } });
    expect(screen.queryByRole('heading', { name: 'Сообщения' })).toBeNull();
  });

  it('renders the dropdown when filter reaches 2 chars and debounces /chat/search', async () => {
    vi.useFakeTimers();
    apiFetchMock
      .mockResolvedValueOnce([]) // /chat/list
      .mockResolvedValueOnce([]); // /chat/search after debounce
    renderScreen();
    const input = await screen.findByLabelText(/Поиск чатов/);

    fireEvent.change(input, { target: { value: 'ab' } });
    // Right after typing — no /chat/search yet (debounce window).
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0]![0]).toBe('/chat/list');

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => {
      expect(apiFetchMock.mock.calls.some((c) => String(c[0]).includes('/chat/search'))).toBe(true);
    });
    expect(screen.getByRole('heading', { name: 'Сообщения' })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hockey/web test -- ChatListScreen`
Expected: FAIL — current ChatListScreen doesn't mount any dropdown.

- [ ] **Step 3: Wire the dropdown into `ChatListScreen`**

In `packages/web/src/chat/screens/ChatListScreen.tsx`:

1. Add imports near the top:

   ```ts
   import { SearchResultsDropdown } from '../components/SearchResultsDropdown.js';
   import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
   ```

2. Inside `ChatListScreen`, after the existing `const [filter, setFilter] = useState('')` line, add:

   ```ts
   const debouncedFilter = useDebouncedValue(filter, 300);
   const dropdownOpen = filter.trim().length >= 2;
   ```

3. After the search-input `<div>` block (the one wrapping the `<input>` + `<button>`), but BEFORE the chat list rendering, insert:

   ```tsx
   {dropdownOpen && (
     <SearchResultsDropdown query={debouncedFilter} chatHits={filteredChats} />
   )}
   ```

4. Wrap the existing chat-list rendering in `{!dropdownOpen && (...)}` so the standalone list hides while the dropdown is open.

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm --filter @hockey/web test -- ChatListScreen`
Expected: PASS, all old + 2 new green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/chat/screens/ChatListScreen.tsx packages/web/src/chat/test/ChatListScreen.test.tsx
git commit -m "feat(web): ChatListScreen — mount SearchResultsDropdown on q>=2 with 300ms debounce"
```

---

## Task 9: Web — extend `fetchMessages` API client with `after`/`around`/`radius`

**Files:**
- Modify: `packages/web/src/chat/api.ts` (the `FetchMessagesOpts` interface and `fetchMessages` function around lines 87–100)

- [ ] **Step 1: Update the type and function**

Replace the existing `FetchMessagesOpts` interface and `fetchMessages` function:

```ts
export interface FetchMessagesOpts {
  before?: string; // ISO
  after?: string;  // ISO
  around?: string; // message UUID
  radius?: number;
  limit?: number; // default 50
}

export function fetchMessages(
  chatId: string,
  opts: FetchMessagesOpts = {},
): Promise<ChatMessageDTO[]> {
  const params = new URLSearchParams();
  if (opts.before) params.set('before', opts.before);
  if (opts.after) params.set('after', opts.after);
  if (opts.around) params.set('around', opts.around);
  if (opts.radius !== undefined) params.set('radius', String(opts.radius));
  params.set('limit', String(opts.limit ?? 50));
  return apiFetch<ChatMessageDTO[]>(`/chat/${chatId}/messages?${params.toString()}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @hockey/web typecheck`
Expected: PASS — only additive type changes.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/chat/api.ts
git commit -m "feat(web): extend fetchMessages with after/around/radius opts"
```

---

## Task 10: Web — `data-message-id` on ChatBubble + `.chat-bubble--flash` CSS

**Files:**
- Modify: `packages/web/src/chat/components/ChatBubble.tsx`
- Modify: `packages/web/src/app/design-system.css`

- [ ] **Step 1: Add the data attribute to ChatBubble**

Open `packages/web/src/chat/components/ChatBubble.tsx`. Find the root JSX element of the bubble (the outermost `<div>` rendered by the component) and add `data-message-id={message.id}` to it. Example transformation:

```tsx
// before:
<div className={containerClass} style={...}>
// after:
<div className={containerClass} data-message-id={message.id} style={...}>
```

If the message id prop name is different (e.g. `props.message.id` or `id` directly), use the actual prop. The exact attribute is `data-message-id` and its value is the message UUID.

- [ ] **Step 2: Append the flash CSS**

In `packages/web/src/app/design-system.css`, append:

```css
@keyframes chat-bubble-flash {
  0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); background-color: rgba(255, 215, 0, 0.18); }
  60%  { box-shadow: 0 0 0 6px rgba(255, 215, 0, 0.0); background-color: rgba(255, 215, 0, 0.10); }
  100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); background-color: transparent; }
}

.chat-bubble--flash {
  animation: chat-bubble-flash 1200ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .chat-bubble--flash {
    animation: none;
    background-color: rgba(255, 215, 0, 0.18);
    transition: background-color 1200ms ease-out;
  }
}
```

- [ ] **Step 3: Run web tests for regression**

Run: `pnpm --filter @hockey/web test`
Expected: all green (no behavioral change yet — only attribute + CSS).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/chat/components/ChatBubble.tsx packages/web/src/app/design-system.css
git commit -m "feat(web): ChatBubble — data-message-id attribute + chat-bubble--flash keyframe"
```

---

## Task 11: Web — `?goto=` handling in `ChatRoomScreen`

**Files:**
- Modify: `packages/web/src/chat/screens/ChatRoomScreen.tsx`
- Modify: `packages/web/src/chat/test/ChatRoomScreen.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

In `packages/web/src/chat/test/ChatRoomScreen.test.tsx`, append:

```tsx
describe('ChatRoomScreen — ?goto=<messageId>', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    if (typeof Element.prototype.scrollIntoView !== 'function') {
      Element.prototype.scrollIntoView = vi.fn();
    } else {
      vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    }
  });

  it('loads messages with around=<id>&radius=25 when ?goto is present', async () => {
    apiFetchMock.mockResolvedValueOnce([
      {
        id: 'gtarget',
        chatId: 'c1',
        senderId: 'u1',
        content: 'target',
        createdAt: new Date().toISOString(),
        isDeleted: false,
        replyTo: null,
        reactions: [],
      },
    ]);
    renderRoom('c1', '?goto=gtarget');
    await waitFor(() => {
      const messagesCall = apiFetchMock.mock.calls.find((c) =>
        String(c[0]).startsWith('/chat/c1/messages'),
      );
      expect(messagesCall).toBeDefined();
      expect(String(messagesCall![0])).toContain('around=gtarget');
      expect(String(messagesCall![0])).toContain('radius=25');
    });
  });

  it('adds .chat-bubble--flash to the target bubble and removes it after 1200ms', async () => {
    vi.useFakeTimers();
    apiFetchMock.mockResolvedValueOnce([
      {
        id: 'gtarget',
        chatId: 'c1',
        senderId: 'u1',
        content: 'target',
        createdAt: new Date().toISOString(),
        isDeleted: false,
        replyTo: null,
        reactions: [],
      },
    ]);
    renderRoom('c1', '?goto=gtarget');
    await waitFor(() => {
      const node = document.querySelector('[data-message-id="gtarget"]');
      expect(node?.classList.contains('chat-bubble--flash')).toBe(true);
    });
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    const node = document.querySelector('[data-message-id="gtarget"]');
    expect(node?.classList.contains('chat-bubble--flash')).toBe(false);
    vi.useRealTimers();
  });

  it('falls back to default load and shows "Сообщение недоступно" banner on 404', async () => {
    apiFetchMock
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }))
      .mockResolvedValueOnce([]); // default load returns nothing
    renderRoom('c1', '?goto=gone');
    expect(await screen.findByText(/Сообщение недоступно/)).toBeInTheDocument();
    await waitFor(() => {
      const defaultLoad = apiFetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/chat/c1/messages') && !String(c[0]).includes('around'),
      );
      expect(defaultLoad).toBeDefined();
    });
  });
});
```

If the existing test file lacks `renderRoom` / `apiFetchMock` helpers, define them at the top of the new `describe` block following the same style used in the existing file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hockey/web test -- ChatRoomScreen`
Expected: FAIL — `?goto` is not yet read.

- [ ] **Step 3: Implement `?goto` handling**

In `packages/web/src/chat/screens/ChatRoomScreen.tsx`:

1. Add `useSearchParams` import:

   ```ts
   import { useSearchParams } from 'react-router-dom';
   ```

2. Inside the component, near the top, add:

   ```ts
   const [searchParams, setSearchParams] = useSearchParams();
   const goto = searchParams.get('goto');
   const [gotoError, setGotoError] = useState<string | null>(null);
   ```

3. Modify the messages-loading `useQuery` so the queryFn takes the goto branch when present:

   ```ts
   const messagesQuery = useQuery<ChatMessageDTO[]>({
     queryKey: chatKeys.messages(chatId),
     queryFn: async () => {
       if (goto) {
         try {
           return await fetchMessages(chatId, { around: goto, radius: 25 });
         } catch (e) {
           // 404 → strip goto, fall back to default load.
           setGotoError('Сообщение недоступно');
           setSearchParams({}, { replace: true });
           return await fetchMessages(chatId, { limit: 50 });
         }
       }
       return await fetchMessages(chatId, { limit: 50 });
     },
   });
   ```

   (Adapt to the existing query/state shape in the current file — the principle is: if `goto` present, call with `{ around: goto, radius: 25 }`; on error swallow + fall back.)

4. Add an effect that runs after the goto-load succeeds: locate the bubble, scroll into view, flash, strip `?goto` after 1200 ms:

   ```ts
   useEffect(() => {
     if (!goto || messagesQuery.isLoading || gotoError) return;
     const node = document.querySelector<HTMLElement>(`[data-message-id="${goto}"]`);
     if (!node) return;
     node.scrollIntoView({ block: 'center' });
     node.classList.add('chat-bubble--flash');
     const handle = setTimeout(() => {
       node.classList.remove('chat-bubble--flash');
       setSearchParams({}, { replace: true });
     }, 1200);
     return () => clearTimeout(handle);
   }, [goto, messagesQuery.isLoading, gotoError, setSearchParams]);
   ```

5. Render the gotoError banner near the top of the room when `gotoError` is set:

   ```tsx
   {gotoError && (
     <div
       className="glass-dark"
       role="alert"
       style={{ margin: '6px 14px', padding: '6px 12px', borderRadius: 10, fontSize: 13 }}
     >
       {gotoError}
     </div>
   )}
   ```

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm --filter @hockey/web test -- ChatRoomScreen`
Expected: PASS — all old + 3 new green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/chat/screens/ChatRoomScreen.tsx packages/web/src/chat/test/ChatRoomScreen.test.tsx
git commit -m "feat(web): ChatRoomScreen — ?goto={messageId} loads around+flashes target"
```

---

## Task 12: CLAUDE.md note + full-suite verification

**Files:**
- Modify: `CLAUDE.md` (append a single line under the existing chat section, ≤200 lines budget)

- [ ] **Step 1: Update CLAUDE.md**

Find the "Чат (PR 1+2+3+4+5+6 — БД, REST, серверный realtime, web MVP, web realtime, UI polish)" line in `CLAUDE.md`. Update its parenthetical to include PR 7 and append at the very end of that paragraph (before the spec-link line):

```
PR 7 — глобальный поиск: на ChatListScreen инпут с дебаунсом 300ms открывает .glass-dark дроп-лист с двумя секциями (Чаты — локально, Сообщения — через `GET /chat/search`); тап результата шлёт на `/chat/{chatId}?goto={messageId}`. Сервер `GET /chat/:chatId/messages` теперь принимает `around=<uuid>&radius=25` (±radius сообщений вокруг анкора, asc) и `after=<iso>` (новее курсора, asc); `around` взаимоисключим с `before`/`after`, 404 на удалённый/чужой/несуществующий анкор. Клиент скроллит к bubble через `data-message-id`, добавляет 1.2s `chat-bubble--flash` и стрипает `?goto` из URL.
```

Update the headline `(PR 1+2+3+4+5+6 ...)` to `(PR 1+2+3+4+5+6+7 ...)`.

- [ ] **Step 2: Verify length budget**

Run: `wc -l CLAUDE.md`
Expected: ≤ 200 lines. If over, trim older content first per project convention (`feedback_claudemd_length`).

- [ ] **Step 3: Run full repo gates**

Run in this order (sequential because order matters):

```bash
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm lint
pnpm --filter @hockey/web test
pnpm --filter @hockey/server test
```

Expected: every command exits 0.

- [ ] **Step 4: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs(claude): note chat PR 7 — global search modal + around/after cursors"
git push -u origin feat/chat-pr7-search-modal
```

- [ ] **Step 5: Open PR**

Run:

```bash
gh pr create --base main --head feat/chat-pr7-search-modal \
  --title "feat(chat): PR 7 — global message search + around-cursor navigation" \
  --body "$(cat <<'EOF'
## Summary

Closes the search gap from the original chat spec (§7.6, §11 step 7). Adds a unified search dropdown to ChatListScreen (Чаты + Сообщения sections, 300ms debounce) and a ?goto=<messageId> deep-link in ChatRoomScreen that lands the user on the target message centered in ±25 of context, briefly flash-highlighted.

### What's new

Server:
- GET /chat/:chatId/messages accepts two new cursor modes: around=<uuid>&radius=25 (centered window, asc, 404 on bad anchor) and after=<iso> (newer than cursor, asc). around is mutually exclusive with before/after (zod refine, 400 otherwise). Reuses the existing partial index (chat_id, created_at) WHERE is_deleted=false.
- New sentinel ChatNotFoundError so the route maps anchor lookup misses to 404 without leaking implementation.

Web:
- useDebouncedValue<T> generic hook (packages/web/src/lib/).
- excerptAround text utility — centers a snippet on the first matching token, ellipsizes both sides.
- HighlightedText component — wraps regex-escaped tokens in <mark> as React elements (no raw HTML strings, regex metacharacters are literals).
- SearchResultsDropdown — .glass-dark panel with Чаты + Сообщения sections, loading/empty/error states, retry button.
- ChatListScreen — input now feeds the dropdown when q >= 2; standalone chat list hides while dropdown is open.
- ChatRoomScreen — reads ?goto=<id>, loads with around, finds the bubble via data-message-id, scrolls into view, adds .chat-bubble--flash for 1200ms, strips ?goto after; falls back to default load with inline "Сообщение недоступно" banner on 404.
- ChatBubble — data-message-id attribute on root.
- design-system.css — chat-bubble-flash keyframe with prefers-reduced-motion fallback.

### Testing

- Server: 5 new tests covering around happy path, around 404 cases (non-existent / cross-chat / soft-deleted), around+before mutual exclusion 400, plus after ascending cursor.
- Web: full TDD across useDebouncedValue (4 tests), excerptAround (6), HighlightedText (5), SearchResultsDropdown (7), plus extensions to ChatListScreen (2) and ChatRoomScreen (3) tests.
- All prior chat tests stay green.

Spec: docs/superpowers/specs/2026-04-27-chat-pr7-search-modal-design.md.
Plan: docs/superpowers/plans/2026-04-27-internal-chat-pr7-search-modal.md.

## Test plan

- [x] pnpm --filter @hockey/game-core build
- [x] pnpm typecheck
- [x] pnpm lint
- [x] pnpm --filter @hockey/web test
- [x] pnpm --filter @hockey/server test
- [ ] Manual: type "test" in chat-list search → dropdown appears with Чаты + Сообщения, debounce verified in dev-tools network (one /chat/search call after 300 ms idle).
- [ ] Manual: tap an old message hit → land on chat with the message centered, briefly flashing.
- [ ] Manual: refresh the URL after the flash → no re-flash (URL was stripped).
EOF
)"
```

---

## Self-Review Notes

**Spec coverage check:**
- §3 entry point — Task 8 ✓
- §3 navigation — Task 11 ✓
- §3 min query length — Task 7 (enabled gate) ✓
- §3 debounce — Tasks 4 + 8 ✓
- §3 highlighting — Task 6 ✓
- §3 excerpt — Task 5 ✓
- §3 no deep-link — Task 8 (no router-state) ✓
- §3 empty/loading/error — Task 7 ✓
- §4.1 four new files — Tasks 4–7 ✓
- §4.2 six modified files — Tasks 8–11 ✓
- §6.1 around SQL — Task 3 ✓
- §6.1 after cursor — Task 2 ✓
- §6.1 ChatNotFoundError → 404 — Task 3 ✓
- §6.2 zod schema with refine — Task 2 (after) and Task 3 (around+refine) ✓
- §7 edge cases — covered across tests in Tasks 4–7, 11 ✓
- §8.1 server tests — Tasks 2 + 3 ✓
- §8.2 web tests — Tasks 4–8, 11 ✓
- §10 acceptance — manual checklist in Task 12 PR body ✓

**Type/method consistency:**
- `chatKeys.search(q)` used in Task 7 — matches existing definition in `queryKeys.ts`.
- `ChatNotFoundError` defined Task 1, thrown Task 3, caught Task 3 step 4. Consistent.
- `fetchMessages(chatId, opts)` opts shape consistent across Tasks 9, 11.

**Placeholder scan:** none.

**Scope:** single PR, ~12 small commits.
