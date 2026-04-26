# Internal Chat — PR 4: Web MVP (REST-only, no realtime)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-facing chat surface in `@hockey/web` against the REST endpoints already live on `main` (PR 2). After this PR, an authenticated user opens the BottomNav "Чат" tab and sees their chat list (DMs + system channels), opens a conversation, scrolls history (cursor pagination), sends a text message, replies-with-quote, soft-deletes own messages, and starts a new DM via a user picker. No WebSocket; messages from other users only appear after a manual revisit / refetch — that gap is filled by PR 5.

**Architecture:**
- `chat/api.ts` — thin wrappers over `apiFetch` for every `/chat/*` endpoint. DTO types (`ChatDTO`, `ChatMessageDTO`, `ReactionGroupDTO`, `ChatEvent`, `ChatEventFrame`) are duplicated structurally from `@hockey/server/src/chat/types.ts` (web cannot import server). One source of truth per side; mismatches are caught by the integration test in PR 5 and by hand on review.
- `chat/chatStore.ts` — Zustand store, no persist. State `{ unreadByChat, activeChatId }` plus a derived `totalUnread` selector and an `applyEvent` reducer that PR 5's `ChatSocket` will plug into. PR 4 only uses `setUnread`, `incrementUnread` (here: not yet wired by anything but ready for tests), `resetUnread`, `setActive`. The reducer is exhaustive over `ChatEvent` so PR 5 lands clean.
- `lib/queryKeys.ts` — new file. Centralised `chatKeys.{all,list,messages,reactions,search,users,unread}` per spec §7.5. Every chat query/mutation references these keys (no string literals scattered).
- `chat/screens/ChatListScreen.tsx` — `useQuery(chatKeys.list())` against `GET /chat/list`, `staleTime: 30_000`. Renders DM rows (with `dmCounterpart`) and system rows (with a `--blue-accent` left stripe per spec §7.6).
- `chat/screens/ChatRoomScreen.tsx` — `useInfiniteQuery(chatKeys.messages(chatId))` against `GET /chat/:id/messages?before=<iso>&limit=50`. `staleTime: Infinity` — invalidated only on user action (send/delete/reply). Sending uses `useMutation` + optimistic prepend; soft-delete uses `useMutation` + optimistic patch (`is_deleted=true, content=''`). Reply preview is local `useState`. Marks chat as read on mount via `POST /chat/:id/read`.
- `chat/components/{ChatListItem,ChatBubble,ReplyPreview,ChatInput,MessageActions,UserPickerModal}.tsx` — minimum surface for PR 4. `ChatBubble` is `React.memo` with an explicit comparator (spec §10.11) so typing in `ChatInput` doesn't re-render 50 bubbles. `MessageActions` in this PR is a simple inline row of icon buttons next to a bubble (Reply, Trash for own). PR 8 will replace it with a long-press floating panel; the component boundary is set up here so that swap is local.
- `app/App.tsx` — three new `<Route>` entries under `<PrivateRoute>`: `/chat`, `/chat/new`, `/chat/:chatId`.
- `components/BottomNav.tsx` — replace the existing "В разработке" toast on the chat tab with `navigate('/chat')`. Mount a numeric badge that reads from `chatStore.totalUnread`. A small `useQuery(chatKeys.unread())` against `GET /chat/unread` (cached server-side, spec §10.3) hydrates `chatStore.setUnread` on mount + a 30s `staleTime`.

**Tech Stack:** React 18, Vite 5, TypeScript (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Zustand 4, TanStack Query 5, react-router-dom 6, Lucide icons. Tests: vitest + jsdom + @testing-library/react.

**Spec reference:** `docs/superpowers/specs/2026-04-26-internal-chat-design.md` §7 (web frontend layout + style + query keys + store), §11 step 4 (PR scope), §6.2 (REST surface), §10.3 / §10.10 / §10.11 (perf — Redis-cached unread, aggressive staleTime, memoised bubbles).

**Out of scope (deferred — verify nothing slips in):**
- `chat/ws.ts` (`ChatSocket`) and any WebSocket plumbing — PR 5.
- Bottom-nav badge increments driven by WS events — PR 5 (badge here is hydrated from REST `/chat/unread` only).
- Reactions UI / `ReactionPicker` — PR 6.
- Full-text search modal (`SearchModal`) — PR 7.
- Long-press / context-menu floating panel for `MessageActions` — PR 8 (PR 4 ships an inline-row minimum so the user can already reply / soft-delete).
- Server-side changes — none. PR 4 is web-only.

---

## File Structure

| Action | Path | Purpose |
|---|---|---|
| Create | `packages/web/src/lib/queryKeys.ts` | `chatKeys` factory per spec §7.5 (centralised TanStack keys) |
| Create | `packages/web/src/chat/api.ts` | DTO types (duplicated from server) + REST wrapper functions for every `/chat/*` endpoint |
| Create | `packages/web/src/chat/chatStore.ts` | Zustand store: `{unreadByChat, activeChatId}` + `applyEvent` reducer + `totalUnread` selector |
| Create | `packages/web/src/chat/test/chatStore.test.ts` | Reducer-level coverage of `applyEvent` for every `ChatEvent` variant + bulk/total selectors |
| Create | `packages/web/src/chat/components/ChatListItem.tsx` | One row in the chat list (avatar, last message, unread pill, system stripe) |
| Create | `packages/web/src/chat/components/ChatBubble.tsx` | Single message bubble (`React.memo` with explicit comparator); renders `ReplyPreview` + `MessageActions` |
| Create | `packages/web/src/chat/components/ReplyPreview.tsx` | Quote-block: vertical accent stripe + sender name + truncated content |
| Create | `packages/web/src/chat/components/ChatInput.tsx` | Auto-grow textarea + send button + reply chip header |
| Create | `packages/web/src/chat/components/MessageActions.tsx` | Inline icon row (Reply, Trash for own) — PR 8 will replace with long-press panel |
| Create | `packages/web/src/chat/components/UserPickerModal.tsx` | Search input → `GET /chat/users` → on pick: `POST /chat/dm` → `navigate('/chat/:chatId')` |
| Create | `packages/web/src/chat/screens/ChatListScreen.tsx` | `useQuery(chatKeys.list())` + `<UserPickerModal>` mounted when `?new=1` |
| Create | `packages/web/src/chat/screens/ChatRoomScreen.tsx` | `useInfiniteQuery` for messages + send / delete / reply + mark-as-read on mount |
| Create | `packages/web/src/chat/test/ChatRoomScreen.test.tsx` | Render messages from mock REST, send happy path, reply flow — no WS |
| Modify | `packages/web/src/app/App.tsx` | Mount `/chat`, `/chat/new`, `/chat/:chatId` under `<PrivateRoute>` |
| Modify | `packages/web/src/components/BottomNav.tsx` | Chat tab → `navigate('/chat')`; numeric badge from `chatStore.totalUnread`; hydrate via `useQuery(chatKeys.unread())` |
| Modify | `CLAUDE.md` | One-line note that web chat MVP exists at `/chat` (REST-only); preserve ≤ 200 lines |

---

## Pre-flight

- [ ] **Step 0.1: Confirm branch + clean tree**

```bash
cd "/Users/egorgumenyuk/Projects/Ultimate Hockey"
git status
git branch --show-current
git log -1 --oneline
```

Expected: branch `feat/chat-pr4-web-mvp`, working tree clean (or only the pre-existing unrelated `IceCar` / `Player` / `PixiStage` / `DailyScreen` edits the user has open in another window — leave them, do not stage them in any task below). Top commit is `5bf93e5 Merge pull request #30 from InBotWeTrust/feat/chat-pr2-guards-rest` (the PR 2 merge into `main`).

- [ ] **Step 0.2: Confirm server REST surface is on `main` and types match**

```bash
ls packages/server/src/chat/{routes,service,guards,types}.ts
grep -n "export type ChatEvent\|export interface ChatDTO\|export interface ChatMessageDTO\|export interface ReactionGroupDTO\|export interface ChatEventFrame" packages/server/src/chat/types.ts
```

Expected: all four files present; the four type/interface lines match. The PR 4 `chat/api.ts` will mirror these types verbatim.

- [ ] **Step 0.3: Baseline green tests for the web package**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/web typecheck
pnpm --filter @hockey/web test
```

Expected: typecheck clean, every existing web test green. Record the test count printed by vitest — every later step must keep it ≥ that number.

---

## Task 1: `lib/queryKeys.ts` — centralised TanStack keys

`chatKeys` is consumed by every later task. Defining it first means later code blocks compile without forward-reference juggling.

**Files:**
- Create: `packages/web/src/lib/queryKeys.ts`

- [ ] **Step 1.1: Create the file**

`packages/web/src/lib/queryKeys.ts`:

```ts
export const chatKeys = {
  all: ['chat'] as const,
  list: () => [...chatKeys.all, 'list'] as const,
  messages: (chatId: string) => [...chatKeys.all, 'messages', chatId] as const,
  reactions: (messageId: string) => [...chatKeys.all, 'reactions', messageId] as const,
  search: (q: string) => [...chatKeys.all, 'search', q] as const,
  users: (q: string) => [...chatKeys.all, 'users', q] as const,
  unread: () => [...chatKeys.all, 'unread'] as const,
};
```

Note: `unread` is added in PR 4 (not in spec §7.5's literal list) because the BottomNav badge needs its own cached query distinct from the heavy `/chat/list`.

- [ ] **Step 1.2: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 1.3: Commit**

```bash
git add packages/web/src/lib/queryKeys.ts
git commit -m "feat(web): chatKeys factory for TanStack Query"
```

---

## Task 2: `chat/api.ts` — DTOs + REST wrappers

Every `/chat/*` endpoint gets a typed function. Types are mirrored from `packages/server/src/chat/types.ts` because the web package cannot import from the server package (no shared dist; only `@hockey/game-core` is shared).

**Files:**
- Create: `packages/web/src/chat/api.ts`

- [ ] **Step 2.1: Re-read the server DTOs to copy exactly**

```bash
cat packages/server/src/chat/types.ts
```

Confirm: `ChatType`, `ChatDTO`, `ChatMessageDTO`, `ReactionGroupDTO`, `ChatEvent`, `ChatEventFrame`. Also re-read service-level return shapes the routes actually emit:

```bash
grep -n "export interface\|export async function\|return\b" packages/server/src/chat/service.ts | head -60
```

Confirm: `findOrCreateDM` returns `{ chatId: string; created: boolean }`; `searchUsers` returns `{ userId, displayName, avatarUrl }[]`; `searchMessages` returns `{ id, chatId, content, senderName, createdAt }[]`; `getUnreadCounts` returns `Record<string, number>`.

- [ ] **Step 2.2: Write `api.ts`**

`packages/web/src/chat/api.ts`:

```ts
import { apiFetch } from '../api/apiFetch.js';

// === DTO types (mirror @hockey/server/src/chat/types.ts) ===

export type ChatType = 'direct' | 'group' | 'system';
export type EntityType = 'team' | 'tournament';

export interface ReactionGroupDTO {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChatMessageDTO {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  replyToId: string | null;
  isDeleted: boolean;
  createdAt: string; // ISO
  reactions: ReactionGroupDTO[];
}

export interface ChatDTO {
  id: string;
  type: ChatType;
  name: string | null;
  entityType: EntityType | null;
  entityId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  lastMessage: ChatMessageDTO | null;
  dmCounterpart: { userId: string; displayName: string; avatarUrl: string | null } | null;
}

export type ChatEvent =
  | { type: 'message:new'; chatId: string; message: ChatMessageDTO }
  | { type: 'message:deleted'; chatId: string; messageId: string }
  | { type: 'reaction:added'; chatId: string; messageId: string; userId: string; emoji: string }
  | { type: 'reaction:removed'; chatId: string; messageId: string; userId: string; emoji: string }
  | { type: 'chat:read'; chatId: string; userId: string; lastReadAt: string };

export interface ChatEventFrame {
  v: 1;
  event: ChatEvent;
}

export interface UserPickerItem {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MessageSearchHit {
  id: string;
  chatId: string;
  content: string;
  senderName: string;
  createdAt: string;
}

export interface FindOrCreateDMResult {
  chatId: string;
  created: boolean;
}

// === REST wrappers ===

export function fetchChatList(): Promise<ChatDTO[]> {
  return apiFetch<ChatDTO[]>('/chat/list');
}

export function findOrCreateDM(otherUserId: string): Promise<FindOrCreateDMResult> {
  return apiFetch<FindOrCreateDMResult>('/chat/dm', {
    method: 'POST',
    body: JSON.stringify({ otherUserId }),
  });
}

export function searchUsers(q: string, limit = 20): Promise<UserPickerItem[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiFetch<UserPickerItem[]>(`/chat/users?${params.toString()}`);
}

export interface FetchMessagesOpts {
  before?: string; // ISO
  limit?: number;  // default 50
}

export function fetchMessages(chatId: string, opts: FetchMessagesOpts = {}): Promise<ChatMessageDTO[]> {
  const params = new URLSearchParams();
  if (opts.before) params.set('before', opts.before);
  params.set('limit', String(opts.limit ?? 50));
  return apiFetch<ChatMessageDTO[]>(`/chat/${chatId}/messages?${params.toString()}`);
}

export interface SendMessageBody {
  content: string;
  replyToId?: string;
}

export function sendMessage(chatId: string, body: SendMessageBody): Promise<ChatMessageDTO> {
  return apiFetch<ChatMessageDTO>(`/chat/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteMessage(messageId: string): Promise<void> {
  return apiFetch<void>(`/chat/messages/${messageId}`, { method: 'DELETE' });
}

export function markChatAsRead(chatId: string): Promise<void> {
  return apiFetch<void>(`/chat/${chatId}/read`, { method: 'POST' });
}

export function searchMessagesApi(q: string, limit = 50): Promise<MessageSearchHit[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiFetch<MessageSearchHit[]>(`/chat/search?${params.toString()}`);
}

export function fetchUnreadCounts(): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>('/chat/unread');
}
```

Note: `deleteMessage` server returns 204; `apiFetch` already handles that and resolves to `undefined`. The `Promise<void>` cast is exact.

- [ ] **Step 2.3: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors. If `exactOptionalPropertyTypes` complains on `replyToId?: string` somewhere downstream, that's fine — it'll surface in Task 9 and get fixed there.

- [ ] **Step 2.4: Commit**

```bash
git add packages/web/src/chat/api.ts
git commit -m "feat(web): chat REST API wrappers + DTO types"
```

---

## Task 3: `chat/chatStore.ts` — Zustand store + reducer + tests (TDD)

The store has two responsibilities in PR 4: hold the unread map (BottomNav reads it), and own the `applyEvent` reducer so PR 5's `ChatSocket` has a stable target. Tests come first per the project TDD discipline.

**Files:**
- Create: `packages/web/src/chat/chatStore.ts`
- Create: `packages/web/src/chat/test/chatStore.test.ts`

- [ ] **Step 3.1: Write the failing tests**

`packages/web/src/chat/test/chatStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../chatStore.js';
import type { ChatEvent, ChatMessageDTO } from '../api.js';

const baseMessage: ChatMessageDTO = {
  id: 'msg-1',
  chatId: 'chat-A',
  senderId: 'user-other',
  content: 'hello',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T00:00:00.000Z',
  reactions: [],
};

describe('chatStore', () => {
  beforeEach(() => {
    // Zustand stores keep state across tests in the same module load — reset.
    useChatStore.setState({ unreadByChat: {}, activeChatId: null });
  });

  it('totalUnread sums over unreadByChat', () => {
    useChatStore.getState().setUnread({ 'chat-A': 2, 'chat-B': 5, 'chat-C': 0 });
    expect(useChatStore.getState().totalUnread()).toBe(7);
  });

  it('setUnread replaces the entire map', () => {
    useChatStore.getState().setUnread({ 'chat-A': 3 });
    useChatStore.getState().setUnread({ 'chat-B': 1 });
    expect(useChatStore.getState().unreadByChat).toEqual({ 'chat-B': 1 });
  });

  it('incrementUnread bumps a single chat by 1, default 0', () => {
    useChatStore.getState().incrementUnread('chat-A');
    useChatStore.getState().incrementUnread('chat-A');
    useChatStore.getState().incrementUnread('chat-B');
    expect(useChatStore.getState().unreadByChat).toEqual({ 'chat-A': 2, 'chat-B': 1 });
  });

  it('resetUnread sets one chat to 0 (key kept so total stays stable)', () => {
    useChatStore.getState().setUnread({ 'chat-A': 4, 'chat-B': 1 });
    useChatStore.getState().resetUnread('chat-A');
    expect(useChatStore.getState().unreadByChat).toEqual({ 'chat-A': 0, 'chat-B': 1 });
  });

  it('setActive updates activeChatId; null is allowed', () => {
    useChatStore.getState().setActive('chat-A');
    expect(useChatStore.getState().activeChatId).toBe('chat-A');
    useChatStore.getState().setActive(null);
    expect(useChatStore.getState().activeChatId).toBeNull();
  });

  it('applyEvent message:new increments unread when chat is not active', () => {
    useChatStore.getState().setActive('chat-other');
    const ev: ChatEvent = { type: 'message:new', chatId: 'chat-A', message: baseMessage };
    useChatStore.getState().applyEvent(ev);
    expect(useChatStore.getState().unreadByChat['chat-A']).toBe(1);
  });

  it('applyEvent message:new does NOT increment unread when chat IS active', () => {
    useChatStore.getState().setActive('chat-A');
    const ev: ChatEvent = { type: 'message:new', chatId: 'chat-A', message: baseMessage };
    useChatStore.getState().applyEvent(ev);
    expect(useChatStore.getState().unreadByChat['chat-A']).toBeUndefined();
  });

  it('applyEvent chat:read resets unread for that chat (other-tab sync)', () => {
    useChatStore.getState().setUnread({ 'chat-A': 3 });
    const ev: ChatEvent = {
      type: 'chat:read',
      chatId: 'chat-A',
      userId: 'me',
      lastReadAt: '2026-04-26T00:00:00.000Z',
    };
    useChatStore.getState().applyEvent(ev);
    expect(useChatStore.getState().unreadByChat['chat-A']).toBe(0);
  });

  it('applyEvent message:deleted is a no-op on unread', () => {
    useChatStore.getState().setUnread({ 'chat-A': 2 });
    const ev: ChatEvent = { type: 'message:deleted', chatId: 'chat-A', messageId: 'msg-1' };
    useChatStore.getState().applyEvent(ev);
    expect(useChatStore.getState().unreadByChat['chat-A']).toBe(2);
  });

  it('applyEvent reaction:added is a no-op on store state (handled by query invalidation)', () => {
    useChatStore.getState().setUnread({ 'chat-A': 2 });
    const ev: ChatEvent = {
      type: 'reaction:added',
      chatId: 'chat-A',
      messageId: 'msg-1',
      userId: 'u',
      emoji: '👍',
    };
    useChatStore.getState().applyEvent(ev);
    expect(useChatStore.getState().unreadByChat['chat-A']).toBe(2);
  });
});
```

- [ ] **Step 3.2: Run the test to verify it fails**

```bash
pnpm --filter @hockey/web test -- src/chat/test/chatStore.test.ts
```

Expected: FAIL — `Cannot find module '../chatStore.js'`.

- [ ] **Step 3.3: Implement the store**

`packages/web/src/chat/chatStore.ts`:

```ts
import { create } from 'zustand';
import type { ChatEvent } from './api.js';

interface ChatStoreState {
  unreadByChat: Record<string, number>;
  activeChatId: string | null;

  totalUnread(): number;

  setUnread(map: Record<string, number>): void;
  incrementUnread(chatId: string): void;
  resetUnread(chatId: string): void;
  setActive(chatId: string | null): void;
  applyEvent(event: ChatEvent): void;
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  unreadByChat: {},
  activeChatId: null,

  totalUnread() {
    let total = 0;
    for (const v of Object.values(get().unreadByChat)) total += v;
    return total;
  },

  setUnread(map) {
    set({ unreadByChat: { ...map } });
  },

  incrementUnread(chatId) {
    set((s) => ({
      unreadByChat: { ...s.unreadByChat, [chatId]: (s.unreadByChat[chatId] ?? 0) + 1 },
    }));
  },

  resetUnread(chatId) {
    set((s) => ({ unreadByChat: { ...s.unreadByChat, [chatId]: 0 } }));
  },

  setActive(chatId) {
    set({ activeChatId: chatId });
  },

  applyEvent(event) {
    switch (event.type) {
      case 'message:new': {
        const { activeChatId } = get();
        if (activeChatId === event.chatId) return;
        set((s) => ({
          unreadByChat: {
            ...s.unreadByChat,
            [event.chatId]: (s.unreadByChat[event.chatId] ?? 0) + 1,
          },
        }));
        return;
      }
      case 'chat:read': {
        set((s) => ({ unreadByChat: { ...s.unreadByChat, [event.chatId]: 0 } }));
        return;
      }
      case 'message:deleted':
      case 'reaction:added':
      case 'reaction:removed':
        // Handled by TanStack invalidation in PR 5; no store mutation needed.
        return;
    }
  },
}));
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
pnpm --filter @hockey/web test -- src/chat/test/chatStore.test.ts
```

Expected: 10/10 pass.

- [ ] **Step 3.5: Typecheck + lint**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors. (Web package has no separate `lint` script; `tsc --noEmit` is the gate.)

- [ ] **Step 3.6: Commit**

```bash
git add packages/web/src/chat/chatStore.ts packages/web/src/chat/test/chatStore.test.ts
git commit -m "feat(web): chatStore with applyEvent reducer + unit tests"
```

---

## Task 4: `components/ChatListItem.tsx` — single chat row

A pure presentational component. The list screen iterates chats and renders one of these per chat. Glassmorphism per spec §7.6.

**Files:**
- Create: `packages/web/src/chat/components/ChatListItem.tsx`

- [ ] **Step 4.1: Write the component**

`packages/web/src/chat/components/ChatListItem.tsx`:

```tsx
import { memo } from 'react';
import type { ChatDTO } from '../api.js';

interface ChatListItemProps {
  chat: ChatDTO;
  onOpen: (chatId: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function displayTitle(chat: ChatDTO): string {
  if (chat.type === 'direct') {
    return chat.dmCounterpart?.displayName ?? 'Диалог';
  }
  return chat.name ?? (chat.type === 'system' ? 'Системный канал' : 'Чат');
}

function lastMessagePreview(chat: ChatDTO): string {
  const m = chat.lastMessage;
  if (!m) return 'Нет сообщений';
  if (m.isDeleted) return 'Сообщение удалено';
  return m.content;
}

function avatarInitial(chat: ChatDTO): string {
  const title = displayTitle(chat);
  return (title || '?').charAt(0).toUpperCase();
}

function ChatListItemImpl({ chat, onOpen }: ChatListItemProps): JSX.Element {
  const isSystem = chat.type === 'system';
  const avatarUrl = chat.dmCounterpart?.avatarUrl ?? null;
  const unread = chat.unreadCount;

  return (
    <button
      type="button"
      className="glass"
      onClick={() => onOpen(chat.id)}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '40px 1fr auto',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 14px',
        borderRadius: 20,
        textAlign: 'left',
        cursor: 'pointer',
        color: 'var(--ink)',
        overflow: 'hidden',
      }}
    >
      {isSystem && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 8,
            bottom: 8,
            width: 4,
            borderTopRightRadius: 4,
            borderBottomRightRadius: 4,
            background: 'var(--blue-accent)',
          }}
        />
      )}

      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          {avatarInitial(chat)}
        </div>
      )}

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--ink)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayTitle(chat)}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {lastMessagePreview(chat)}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatTime(chat.lastMessageAt)}</span>
        {unread > 0 && (
          <span
            className="pill pill--dark"
            style={{
              fontSize: 11,
              padding: '3px 9px',
              minWidth: 22,
              justifyContent: 'center',
              background: 'var(--red, rgb(220, 38, 38))',
              borderColor: 'var(--red, rgb(220, 38, 38))',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </div>
    </button>
  );
}

export const ChatListItem = memo(ChatListItemImpl);
```

- [ ] **Step 4.2: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 4.3: Commit**

```bash
git add packages/web/src/chat/components/ChatListItem.tsx
git commit -m "feat(web): ChatListItem — glass row with avatar + unread pill"
```

---

## Task 5: `components/ReplyPreview.tsx` + `ChatBubble.tsx`

`ReplyPreview` is referenced by both `ChatBubble` (inside the bubble, when `replyToId` is set) and `ChatInput` (above the input, when the user is composing a reply). `ChatBubble` is the primary perf surface — it must be `React.memo` with an explicit comparator (spec §10.11).

**Files:**
- Create: `packages/web/src/chat/components/ReplyPreview.tsx`
- Create: `packages/web/src/chat/components/ChatBubble.tsx`

- [ ] **Step 5.1: Write `ReplyPreview.tsx`**

`packages/web/src/chat/components/ReplyPreview.tsx`:

```tsx
interface ReplyPreviewProps {
  senderName: string;
  content: string;
  variant?: 'in-bubble' | 'composer';
  onClear?: () => void;
}

export function ReplyPreview({
  senderName,
  content,
  variant = 'in-bubble',
  onClear,
}: ReplyPreviewProps): JSX.Element {
  const isComposer = variant === 'composer';
  return (
    <div
      style={{
        position: 'relative',
        padding: '6px 10px 6px 12px',
        marginBottom: isComposer ? 6 : 4,
        borderRadius: 12,
        background: isComposer ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.06)',
        opacity: isComposer ? 1 : 0.85,
        fontSize: 11,
        color: 'var(--ink)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 4,
          bottom: 4,
          width: 3,
          borderRadius: 2,
          background: 'var(--blue-accent)',
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--blue-accent)' }}>
          {senderName}
        </div>
        <div
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            opacity: 0.8,
          }}
        >
          {content || '...'}
        </div>
      </div>
      {onClear && (
        <button
          type="button"
          aria-label="Снять ответ"
          onClick={onClear}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 14,
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5.2: Write `ChatBubble.tsx`**

`packages/web/src/chat/components/ChatBubble.tsx`:

```tsx
import { memo } from 'react';
import type { ChatMessageDTO } from '../api.js';
import { ReplyPreview } from './ReplyPreview.js';
import { MessageActions } from './MessageActions.js';

interface ChatBubbleProps {
  message: ChatMessageDTO;
  isOwn: boolean;
  // Context needed to render an in-bubble quote when replyToId is set.
  // Looked up by parent (ChatRoomScreen) from the local messages cache.
  replyTo?: { senderName: string; content: string } | null;
  onReply: (message: ChatMessageDTO) => void;
  onDelete: (messageId: string) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function ChatBubbleImpl({ message, isOwn, replyTo, onReply, onDelete }: ChatBubbleProps): JSX.Element {
  const className = isOwn ? 'glass-dark' : 'glass';
  const align = isOwn ? 'flex-end' : 'flex-start';
  const radius = isOwn
    ? '20px 20px 4px 20px'
    : '20px 20px 20px 4px';
  const text = message.isDeleted ? 'Сообщение удалено' : message.content;

  return (
    <div
      data-testid="chat-bubble"
      data-message-id={message.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        marginBottom: 8,
      }}
    >
      <div style={{ maxWidth: '78%', display: 'flex', alignItems: 'center', gap: 6 }}>
        {!isOwn && (
          <MessageActions
            isOwn={false}
            onReply={() => onReply(message)}
            disabled={message.isDeleted}
          />
        )}
        <div
          className={className}
          style={{
            padding: '8px 12px',
            borderRadius: radius,
            fontSize: 14,
            lineHeight: 1.4,
            color: isOwn ? '#ffffff' : 'var(--ink)',
            wordBreak: 'break-word',
            opacity: message.isDeleted ? 0.6 : 1,
            fontStyle: message.isDeleted ? 'italic' : 'normal',
          }}
        >
          {message.replyToId && replyTo && (
            <ReplyPreview senderName={replyTo.senderName} content={replyTo.content} />
          )}
          <div>{text}</div>
        </div>
        {isOwn && (
          <MessageActions
            isOwn
            onReply={() => onReply(message)}
            onDelete={() => onDelete(message.id)}
            disabled={message.isDeleted}
          />
        )}
      </div>
      <span
        style={{
          fontSize: 10,
          color: 'var(--muted)',
          marginTop: 2,
          padding: '0 4px',
        }}
      >
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}

// Spec §10.11 — explicit comparator so typing in ChatInput doesn't re-render
// every bubble. We depend only on identity-stable fields plus content/isDeleted.
function areEqual(prev: ChatBubbleProps, next: ChatBubbleProps): boolean {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.isDeleted === next.message.isDeleted &&
    prev.isOwn === next.isOwn &&
    prev.replyTo?.content === next.replyTo?.content &&
    prev.replyTo?.senderName === next.replyTo?.senderName &&
    prev.onReply === next.onReply &&
    prev.onDelete === next.onDelete
  );
}

export const ChatBubble = memo(ChatBubbleImpl, areEqual);
```

- [ ] **Step 5.3: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: error about missing `MessageActions` (Task 6 will add). It's expected — proceed to Task 6 immediately, don't try to fix it here.

- [ ] **Step 5.4: Commit (with stub note)**

We commit at the end of Task 6 once `MessageActions` exists; do not commit halfway. If you want a clean checkpoint, stash:

```bash
git status   # confirm components are present, uncommitted
```

Skip to Task 6.

---

## Task 6: `components/MessageActions.tsx` + `ChatInput.tsx`

`MessageActions` is the inline minimum (Reply, Trash for own). PR 8 will replace it with a long-press floating panel — the props stay the same so the swap is local. `ChatInput` is the auto-grow textarea + send button + reply-preview header.

**Files:**
- Create: `packages/web/src/chat/components/MessageActions.tsx`
- Create: `packages/web/src/chat/components/ChatInput.tsx`

- [ ] **Step 6.1: Write `MessageActions.tsx`**

`packages/web/src/chat/components/MessageActions.tsx`:

```tsx
import { Reply, Trash2 } from 'lucide-react';

interface MessageActionsProps {
  isOwn: boolean;
  disabled?: boolean;
  onReply: () => void;
  onDelete?: () => void; // only meaningful when isOwn
}

export function MessageActions({
  isOwn,
  disabled = false,
  onReply,
  onDelete,
}: MessageActionsProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        opacity: disabled ? 0 : 0.6,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <button
        type="button"
        className="icon-btn"
        aria-label="Ответить"
        onClick={onReply}
        style={{ width: 24, height: 24 }}
      >
        <Reply size={12} />
      </button>
      {isOwn && onDelete && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Удалить сообщение"
          onClick={onDelete}
          style={{ width: 24, height: 24 }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6.2: Write `ChatInput.tsx`**

`packages/web/src/chat/components/ChatInput.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { ChatMessageDTO } from '../api.js';
import { ReplyPreview } from './ReplyPreview.js';

interface ChatInputProps {
  disabled?: boolean;
  replyTo: ChatMessageDTO | null;
  replyToSenderName?: string | undefined;
  onClearReply: () => void;
  onSend: (content: string, replyToId: string | null) => void | Promise<void>;
}

const MAX_LEN = 4000;

export function ChatInput({
  disabled = false,
  replyTo,
  replyToSenderName,
  onClearReply,
  onSend,
}: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow up to a cap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  function submit(): void {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    void onSend(trimmed, replyTo?.id ?? null);
    setValue('');
    onClearReply();
  }

  return (
    <div
      className="glass-dark"
      style={{
        margin: '0 12px 12px',
        padding: 10,
        borderRadius: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {replyTo && (
        <ReplyPreview
          variant="composer"
          senderName={replyToSenderName ?? 'Сообщение'}
          content={replyTo.content}
          onClear={onClearReply}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Сообщение..."
          rows={1}
          disabled={disabled}
          aria-label="Текст сообщения"
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            outline: 'none',
            padding: '8px 10px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.92)',
            color: 'var(--ink)',
            fontSize: 14,
            lineHeight: 1.4,
            maxHeight: 120,
            fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          className="btn btn--cta"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label="Отправить"
          style={{ padding: 12, borderRadius: 999, minWidth: 44, minHeight: 44 }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.3: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors. ChatBubble from Task 5 now resolves `MessageActions`.

- [ ] **Step 6.4: Commit**

```bash
git add packages/web/src/chat/components/ReplyPreview.tsx \
        packages/web/src/chat/components/ChatBubble.tsx \
        packages/web/src/chat/components/MessageActions.tsx \
        packages/web/src/chat/components/ChatInput.tsx
git commit -m "feat(web): chat bubble, input, reply preview, inline actions"
```

---

## Task 7: `components/UserPickerModal.tsx`

The user picker drives the "new DM" flow: search by `display_name` → pick → `POST /chat/dm` → navigate. Debounce 300ms per spec §7.6.

**Files:**
- Create: `packages/web/src/chat/components/UserPickerModal.tsx`

- [ ] **Step 7.1: Write the component**

`packages/web/src/chat/components/UserPickerModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { findOrCreateDM, searchUsers, type UserPickerItem } from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';

interface UserPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPicked: (chatId: string) => void;
}

export function UserPickerModal({ open, onClose, onPicked }: UserPickerModalProps): JSX.Element | null {
  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();

  // Debounce 300ms.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setQuery(raw.trim()), 300);
    return () => window.clearTimeout(t);
  }, [raw, open]);

  const { data, isFetching } = useQuery<UserPickerItem[]>({
    queryKey: chatKeys.users(query),
    queryFn: () => searchUsers(query),
    enabled: open && query.length >= 1,
    staleTime: 60_000,
  });

  const { mutate: pick, isPending } = useMutation({
    mutationFn: (otherUserId: string) => findOrCreateDM(otherUserId),
    onSuccess: ({ chatId, created }) => {
      if (created) {
        // New chat — list cache is stale.
        void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      }
      onPicked(chatId);
    },
  });

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 250,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '60px 16px 16px',
      }}
    >
      <div
        className="glass-dark"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 400,
          padding: 16,
          borderRadius: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          maxHeight: 'calc(100dvh - 80px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={16} color="rgba(255,255,255,0.7)" />
          <input
            type="text"
            value={raw}
            autoFocus
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Поиск игроков..."
            aria-label="Поиск игроков"
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 12,
              border: 'none',
              outline: 'none',
              background: 'rgba(255,255,255,0.18)',
              color: '#ffffff',
              fontSize: 14,
            }}
          />
          <button
            type="button"
            className="icon-btn icon-btn--dark"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {query.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              Введите имя для поиска
            </div>
          )}
          {query.length > 0 && isFetching && (
            <div style={{ padding: 12, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              Поиск...
            </div>
          )}
          {query.length > 0 && !isFetching && (data?.length ?? 0) === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              Никого не нашли
            </div>
          )}
          {(data ?? []).map((u) => (
            <button
              type="button"
              key={u.userId}
              disabled={isPending}
              onClick={() => pick(u.userId)}
              className="glass"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 14,
                color: 'var(--ink)',
                cursor: isPending ? 'wait' : 'pointer',
                textAlign: 'left',
              }}
            >
              {u.avatarUrl ? (
                <img
                  src={u.avatarUrl}
                  alt=""
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {u.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span style={{ fontSize: 14, fontWeight: 600 }}>{u.displayName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.2: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 7.3: Commit**

```bash
git add packages/web/src/chat/components/UserPickerModal.tsx
git commit -m "feat(web): UserPickerModal with debounced trigram search"
```

---

## Task 8: `screens/ChatListScreen.tsx`

The list screen renders all chats from `GET /chat/list`, fans clicks into a router `navigate(/chat/:chatId)`, and mounts `<UserPickerModal>` when the URL search param `new=1` is present (so deep-linking `/chat/new` works).

**Files:**
- Create: `packages/web/src/chat/screens/ChatListScreen.tsx`

- [ ] **Step 8.1: Write the screen**

`packages/web/src/chat/screens/ChatListScreen.tsx`:

```tsx
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ArrowLeft } from 'lucide-react';
import { fetchChatList, type ChatDTO } from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { ChatListItem } from '../components/ChatListItem.js';
import { UserPickerModal } from '../components/UserPickerModal.js';
import { NAV_HEIGHT } from '../../components/BottomNav.js';

export function ChatListScreen(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setActive = useChatStore((s) => s.setActive);

  // Leaving any active chat as we land on the list.
  useEffect(() => {
    setActive(null);
  }, [setActive]);

  const { data, isLoading, isError, refetch } = useQuery<ChatDTO[]>({
    queryKey: chatKeys.list(),
    queryFn: fetchChatList,
    staleTime: 30_000,
  });

  const pickerOpen = searchParams.get('new') === '1';

  function openChat(chatId: string): void {
    navigate(`/chat/${chatId}`);
  }

  function openPicker(): void {
    setSearchParams({ new: '1' });
  }

  function closePicker(): void {
    setSearchParams({});
  }

  return (
    <main
      className="screen"
      style={{
        paddingBottom: `calc(${NAV_HEIGHT + 16}px + env(safe-area-inset-bottom, 0px) / 2)`,
      }}
    >
      <header
        className="header-bar glass"
        style={{
          marginTop: 'calc(10px + env(safe-area-inset-top, 0px) / 2)',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Назад"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="header-bar__title">Чаты</div>
        <button
          type="button"
          className="icon-btn icon-btn--dark"
          aria-label="Новый чат"
          onClick={openPicker}
        >
          <Plus size={16} />
        </button>
      </header>

      {isLoading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Загрузка...
        </div>
      )}

      {isError && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>
            Не удалось загрузить чаты
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => void refetch()}>
            Повторить
          </button>
        </div>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Здесь пока пусто. Начните диалог через «+».
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '4px 14px 14px',
        }}
      >
        {(data ?? []).map((chat) => (
          <ChatListItem key={chat.id} chat={chat} onOpen={openChat} />
        ))}
      </div>

      <UserPickerModal
        open={pickerOpen}
        onClose={closePicker}
        onPicked={(chatId) => {
          closePicker();
          navigate(`/chat/${chatId}`);
        }}
      />
    </main>
  );
}
```

- [ ] **Step 8.2: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 8.3: Commit**

```bash
git add packages/web/src/chat/screens/ChatListScreen.tsx
git commit -m "feat(web): ChatListScreen with picker route and 30s staleTime"
```

---

## Task 9: `screens/ChatRoomScreen.tsx` + tests (TDD)

The biggest task: cursor-paginated `useInfiniteQuery`, send / soft-delete / reply mutations, mark-as-read on mount, lookup table for `replyToId → message snippet`. We write the test second here (after the screen) because the screen's surface is too large to TDD as a single shot — but we still write enough test coverage to prove the wiring is real.

**Files:**
- Create: `packages/web/src/chat/screens/ChatRoomScreen.tsx`
- Create: `packages/web/src/chat/test/ChatRoomScreen.test.tsx`

- [ ] **Step 9.1: Write the screen**

`packages/web/src/chat/screens/ChatRoomScreen.tsx`:

```tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  deleteMessage,
  fetchMessages,
  markChatAsRead,
  sendMessage,
  type ChatMessageDTO,
} from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { useAuthStore } from '../../auth/authStore.js';
import { ChatBubble } from '../components/ChatBubble.js';
import { ChatInput } from '../components/ChatInput.js';
import { NAV_HEIGHT } from '../../components/BottomNav.js';

const PAGE_SIZE = 50;

export function ChatRoomScreen(): JSX.Element {
  const params = useParams<{ chatId: string }>();
  const chatId = params.chatId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const setActive = useChatStore((s) => s.setActive);
  const resetUnread = useChatStore((s) => s.resetUnread);

  const [replyTo, setReplyTo] = useState<ChatMessageDTO | null>(null);

  // Track active chat in the store so message:new from PR 5 won't
  // increment unread for THIS chat.
  useEffect(() => {
    if (!chatId) return;
    setActive(chatId);
    return () => setActive(null);
  }, [chatId, setActive]);

  const query = useInfiniteQuery<ChatMessageDTO[]>({
    queryKey: chatKeys.messages(chatId),
    enabled: chatId.length > 0,
    queryFn: ({ pageParam }) =>
      fetchMessages(chatId, { limit: PAGE_SIZE, ...(pageParam ? { before: pageParam as string } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      // Server returns DESC by created_at — last item in the array is the OLDEST in this page.
      return lastPage[lastPage.length - 1]?.createdAt;
    },
    staleTime: Infinity,
  });

  // Mark as read on mount + when query first fetches.
  const { mutate: markRead } = useMutation({
    mutationFn: () => markChatAsRead(chatId),
    onSuccess: () => {
      resetUnread(chatId);
      void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });

  useEffect(() => {
    if (chatId.length === 0) return;
    if (!query.data) return;
    markRead();
  }, [chatId, query.data, markRead]);

  // Flatten pages, oldest at top.
  const messages = useMemo<ChatMessageDTO[]>(() => {
    if (!query.data) return [];
    const all = query.data.pages.flat();
    // Server returns each page DESC; we want ASC for display.
    return [...all].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }, [query.data]);

  const messageById = useMemo(() => {
    const map = new Map<string, ChatMessageDTO>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const senderNameOf = useCallback(
    (msg: ChatMessageDTO): string => (msg.senderId === meId ? 'Вы' : 'Собеседник'),
    [meId],
  );

  const sendMut = useMutation({
    mutationFn: (vars: { content: string; replyToId: string | null }) =>
      sendMessage(chatId, {
        content: vars.content,
        ...(vars.replyToId !== null ? { replyToId: vars.replyToId } : {}),
      }),
    onSuccess: (msg) => {
      // Append to first page (server returns the created DTO).
      queryClient.setQueryData<{ pages: ChatMessageDTO[][]; pageParams: unknown[] } | undefined>(
        chatKeys.messages(chatId),
        (old) => {
          if (!old) return { pages: [[msg]], pageParams: [undefined] };
          const firstPage = old.pages[0] ?? [];
          // Insert as newest (server DESC: index 0).
          const nextFirst = [msg, ...firstPage];
          return { ...old, pages: [nextFirst, ...old.pages.slice(1)] };
        },
      );
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onMutate: (messageId) => {
      // Optimistic patch: mark as deleted in-cache.
      queryClient.setQueryData<{ pages: ChatMessageDTO[][]; pageParams: unknown[] } | undefined>(
        chatKeys.messages(chatId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((m) => (m.id === messageId ? { ...m, isDeleted: true, content: '' } : m)),
            ),
          };
        },
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });

  // Stable callbacks so memoised ChatBubble doesn't churn on each render.
  const onReply = useCallback((m: ChatMessageDTO) => setReplyTo(m), []);
  const onDelete = useCallback((id: string) => deleteMut.mutate(id), [deleteMut]);

  const handleSend = useCallback(
    (content: string, replyToId: string | null): void => {
      sendMut.mutate({ content, replyToId });
    },
    [sendMut],
  );

  return (
    <main
      className="screen"
      style={{
        paddingBottom: `calc(${NAV_HEIGHT + 16}px + env(safe-area-inset-bottom, 0px) / 2)`,
      }}
    >
      <header
        className="header-bar glass"
        style={{
          marginTop: 'calc(10px + env(safe-area-inset-top, 0px) / 2)',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Назад"
          onClick={() => navigate('/chat')}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="header-bar__title">Чат</div>
      </header>

      <div
        data-testid="messages-list"
        style={{
          flex: 1,
          padding: '8px 14px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {query.hasNextPage && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            style={{ alignSelf: 'center', margin: '4px 0 12px', fontSize: 12, padding: '8px 14px' }}
          >
            {query.isFetchingNextPage ? 'Загрузка...' : 'Загрузить ещё'}
          </button>
        )}
        {messages.map((m) => {
          const isOwn = m.senderId === meId;
          const replyParent = m.replyToId ? messageById.get(m.replyToId) : undefined;
          const replyTo = replyParent
            ? { senderName: senderNameOf(replyParent), content: replyParent.content }
            : null;
          return (
            <ChatBubble
              key={m.id}
              message={m}
              isOwn={isOwn}
              replyTo={replyTo}
              onReply={onReply}
              onDelete={onDelete}
            />
          );
        })}
      </div>

      <ChatInput
        replyTo={replyTo}
        replyToSenderName={replyTo ? senderNameOf(replyTo) : undefined}
        onClearReply={() => setReplyTo(null)}
        disabled={sendMut.isPending}
        onSend={handleSend}
      />
    </main>
  );
}
```

- [ ] **Step 9.2: Write the test**

`packages/web/src/chat/test/ChatRoomScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatRoomScreen } from '../screens/ChatRoomScreen.js';
import { useAuthStore } from '../../auth/authStore.js';
import * as api from '../api.js';
import type { ChatMessageDTO } from '../api.js';

function renderRoom(chatId: string): { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/chat/${chatId}`]}>
        <Routes>
          <Route path="/chat/:chatId" element={<ChatRoomScreen />} />
          <Route path="/chat" element={<div>list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient };
}

const SELF_ID = '00000000-0000-0000-0000-00000000aaaa';
const OTHER_ID = '00000000-0000-0000-0000-00000000bbbb';

const msgFromOther: ChatMessageDTO = {
  id: 'm1',
  chatId: 'c1',
  senderId: OTHER_ID,
  content: 'привет',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T10:00:00.000Z',
  reactions: [],
};

const msgFromSelf: ChatMessageDTO = {
  id: 'm2',
  chatId: 'c1',
  senderId: SELF_ID,
  content: 'хай',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T10:01:00.000Z',
  reactions: [],
};

describe('ChatRoomScreen', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: {
        id: SELF_ID,
        displayName: 'Me',
        grip: 'right',
      } as unknown as Parameters<typeof useAuthStore.setState>[0]['user'],
    });
    vi.spyOn(api, 'fetchMessages').mockResolvedValue([msgFromSelf, msgFromOther]); // server DESC
    vi.spyOn(api, 'markChatAsRead').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders messages from REST in chronological order', async () => {
    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));
    const bubbles = screen.getAllByTestId('chat-bubble');
    // Oldest first (ASC): other → self.
    expect(bubbles[0]?.getAttribute('data-message-id')).toBe('m1');
    expect(bubbles[1]?.getAttribute('data-message-id')).toBe('m2');
    expect(screen.getByText('привет')).toBeInTheDocument();
    expect(screen.getByText('хай')).toBeInTheDocument();
  });

  it('marks the chat as read on mount once messages have loaded', async () => {
    renderRoom('c1');
    await waitFor(() => expect(api.markChatAsRead).toHaveBeenCalledWith('c1'));
  });

  it('sends a message and prepends it to the cache', async () => {
    const newMsg: ChatMessageDTO = {
      id: 'm3',
      chatId: 'c1',
      senderId: SELF_ID,
      content: 'тест',
      replyToId: null,
      isDeleted: false,
      createdAt: '2026-04-26T10:02:00.000Z',
      reactions: [],
    };
    const sendSpy = vi.spyOn(api, 'sendMessage').mockResolvedValue(newMsg);

    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'тест' } });
    fireEvent.click(screen.getByLabelText('Отправить'));

    await waitFor(() => expect(sendSpy).toHaveBeenCalledWith('c1', { content: 'тест' }));
    await waitFor(() => expect(screen.getByText('тест')).toBeInTheDocument());
  });

  it('reply flow: clicking Reply on a foreign bubble shows a composer reply chip; sending includes replyToId', async () => {
    const sendSpy = vi.spyOn(api, 'sendMessage').mockResolvedValue({
      ...msgFromSelf,
      id: 'm4',
      content: 'отвечаю',
      replyToId: 'm1',
    });

    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));

    // Click "Ответить" on the foreign bubble.
    const replyButtons = screen.getAllByLabelText('Ответить');
    expect(replyButtons.length).toBeGreaterThan(0);
    fireEvent.click(replyButtons[0]!); // first one belongs to msgFromOther

    // Composer must show the previewed quote.
    await waitFor(() => expect(screen.getByLabelText('Снять ответ')).toBeInTheDocument());

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'отвечаю' } });
    fireEvent.click(screen.getByLabelText('Отправить'));

    await waitFor(() =>
      expect(sendSpy).toHaveBeenCalledWith('c1', { content: 'отвечаю', replyToId: 'm1' }),
    );

    // Composer chip should clear after send.
    await waitFor(() => expect(screen.queryByLabelText('Снять ответ')).toBeNull());
  });

  it('soft-delete: clicking Trash on own bubble optimistically marks it deleted', async () => {
    const delSpy = vi.spyOn(api, 'deleteMessage').mockResolvedValue(undefined);

    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));

    fireEvent.click(screen.getByLabelText('Удалить сообщение'));

    await waitFor(() => expect(delSpy).toHaveBeenCalledWith('m2'));
    await waitFor(() => expect(screen.getByText('Сообщение удалено')).toBeInTheDocument());
  });
});
```

- [ ] **Step 9.3: Run the tests**

```bash
pnpm --filter @hockey/web test -- src/chat/test/ChatRoomScreen.test.tsx
```

Expected: 5/5 pass. If `markChatAsRead` is reported as not called, double-check the `useEffect` deps array — it must include `query.data` (not `query`).

- [ ] **Step 9.4: Run the full web suite**

```bash
pnpm --filter @hockey/web test
```

Expected: every prior test still green; new chat tests are part of the count.

- [ ] **Step 9.5: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 9.6: Commit**

```bash
git add packages/web/src/chat/screens/ChatRoomScreen.tsx \
        packages/web/src/chat/test/ChatRoomScreen.test.tsx
git commit -m "feat(web): ChatRoomScreen with cursor pagination, send, delete, reply"
```

---

## Task 10: Routes in `App.tsx` + BottomNav badge wiring

This is the integration glue: the chat tab goes live and the badge starts hydrating from REST. No screen-level changes.

**Files:**
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/components/BottomNav.tsx`

- [ ] **Step 10.1: Edit `App.tsx`**

Replace the file with:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './global.css';
import './design-system.css';
import { DailyScreen } from '../screens/DailyScreen.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { PrivateRoute } from '../auth/PrivateRoute.js';
import { BottomNav } from '../components/BottomNav.js';
import { UpdatePrompt } from '../components/UpdatePrompt.js';
import { ChatListScreen } from '../chat/screens/ChatListScreen.js';
import { ChatRoomScreen } from '../chat/screens/ChatRoomScreen.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div
          className="app-shell"
          style={{
            maxWidth: 430,
            margin: '0 auto',
            minHeight: '100dvh',
            position: 'relative',
            transform: 'translateZ(0)',
            overflow: 'hidden',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            boxShadow: '0 0 0 1px rgba(15,23,42,0.08), 0 8px 48px rgba(15,23,42,0.14)',
          }}
        >
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <DailyScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/duel/:goalieId"
              element={
                <PrivateRoute>
                  <DailyScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <ProfileScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <PrivateRoute>
                  <ChatListScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/chat/new"
              element={<Navigate to="/chat?new=1" replace />}
            />
            <Route
              path="/chat/:chatId"
              element={
                <PrivateRoute>
                  <ChatRoomScreen />
                </PrivateRoute>
              }
            />
          </Routes>
          <BottomNav />
          <UpdatePrompt />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

Note: `/chat/new` is implemented as a redirect to `/chat?new=1` so the modal-based picker handles a single rendering path. Spec §7.2 lists `/chat/new` as a route — the redirect satisfies the entrypoint contract.

- [ ] **Step 10.2: Edit `BottomNav.tsx`**

Replace the chat-tab block (`label="Чат"`) so it:
1. Navigates to `/chat`,
2. Renders a numeric badge from `chatStore.totalUnread()`.

Also hydrate `chatStore` on mount via `useQuery(chatKeys.unread())`.

Apply the following diff to `packages/web/src/components/BottomNav.tsx`:

(a) After the existing imports, add:

```ts
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchUnreadCounts } from '../chat/api.js';
import { useChatStore } from '../chat/chatStore.js';
import { chatKeys } from '../lib/queryKeys.js';
```

Merge the `useEffect` import with the existing `useEffect, useRef, useState` line — do not duplicate.

(b) Inside `BottomNav`, near the top (after existing `useState`/`useRef`), add:

```ts
  const totalUnread = useChatStore((s) => s.totalUnread());
  const setUnread = useChatStore((s) => s.setUnread);

  const { data: unreadMap } = useQuery<Record<string, number>>({
    queryKey: chatKeys.unread(),
    queryFn: fetchUnreadCounts,
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (unreadMap) setUnread(unreadMap);
  }, [unreadMap, setUnread]);
```

(c) Replace the chat `<NavTab>` block:

```tsx
        <NavTab
          label="Чат"
          active={location.pathname.startsWith('/chat')}
          icon={
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <MessageCircle
                size={ICON_SIZE}
                color={location.pathname.startsWith('/chat') ? '#ffffff' : 'var(--muted)'}
                strokeWidth={2}
              />
              {totalUnread > 0 && (
                <span
                  aria-label={`Непрочитанные: ${totalUnread}`}
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -6,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 999,
                    background: 'rgb(220, 38, 38)',
                    color: '#ffffff',
                    fontSize: 9,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 0 2px rgba(218, 230, 246, 0.96)',
                  }}
                >
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </span>
          }
          onClick={() => navigate('/chat')}
        />
```

The previous toast-on-click is removed entirely.

- [ ] **Step 10.3: Run the full web suite**

```bash
pnpm --filter @hockey/web test
```

Expected: every test still green. Existing `App.test.tsx` may render the new routes — it should remain green because non-chat routes are unchanged. If `App.test.tsx` mocks `fetchUnreadCounts` (it likely doesn't yet), it will not need to: TanStack defaults to disabled-when-no-user, and React Query's `enabled: Boolean(user)` ensures we don't fire fetches in an unauth state.

- [ ] **Step 10.4: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 10.5: Manual smoke (only if dev server is up)**

```bash
pnpm --filter @hockey/game-core build
pnpm dev:server   # in shell A
pnpm dev:web      # in shell B
```

Open `http://localhost:5173`, log in via dev button, click the BottomNav "Чат" tab. Expect the chat list (empty unless a system channel was seeded). Click `+` to open the picker, type a name, pick a player, land in `/chat/<chatId>`, send a message, see it appear, click reply on a foreign message, send a reply, click trash on your own message, see "Сообщение удалено".

- [ ] **Step 10.6: Commit**

```bash
git add packages/web/src/app/App.tsx packages/web/src/components/BottomNav.tsx
git commit -m "feat(web): mount chat routes and bottom-nav badge"
```

---

## Task 11: `CLAUDE.md` — one-line note

The existing chat blurb says "PR 1+2+3 готовы — БД, REST, realtime". Append a single short line about the web MVP. Project rule: keep file ≤ 200 lines (memory: `feedback_claudemd_length.md`); trim if needed.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 11.1: Locate the section + check budget**

```bash
grep -n "^### Чат" CLAUDE.md
wc -l CLAUDE.md
```

Expected: locate the header. Record current line count.

- [ ] **Step 11.2: Append a single line at the end of the chat blurb**

Add this sentence after the existing realtime sentence (one paragraph; do not insert blank lines):

```
Web MVP — `/chat` (список), `/chat/new` (пикер юзеров), `/chat/:chatId` (комната) под `<PrivateRoute>` с TanStack Query (`chatKeys.{list,messages,users,unread}`); бейдж в BottomNav из `chatStore.totalUnread`, hydration через `GET /chat/unread`. Без realtime (PR 5 добавит `ChatSocket`).
```

If after the edit `wc -l` shows > 200, trim a redundant sentence elsewhere in the chat section (e.g., compress the Redis-cache line) so total stays ≤ 200.

- [ ] **Step 11.3: Verify length budget**

```bash
wc -l CLAUDE.md
```

Expected: ≤ 200.

- [ ] **Step 11.4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): note chat web MVP routes + bottom-nav badge"
```

---

## Final verification

- [ ] **Step F.1: Workspace-wide gates**

```bash
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm --filter @hockey/web test
```

Expected: every command exits 0. Server tests are not run here (PR 4 makes no server changes); CI will run them.

- [ ] **Step F.2: Eyeball the diff against scope**

```bash
git diff --stat origin/main...HEAD
```

Expected paths only:
- `packages/web/src/lib/queryKeys.ts` (new)
- `packages/web/src/chat/api.ts` (new)
- `packages/web/src/chat/chatStore.ts` (new)
- `packages/web/src/chat/test/{chatStore,ChatRoomScreen}.test.tsx` (new)
- `packages/web/src/chat/components/{ChatListItem,ChatBubble,ReplyPreview,ChatInput,MessageActions,UserPickerModal}.tsx` (new)
- `packages/web/src/chat/screens/{ChatListScreen,ChatRoomScreen}.tsx` (new)
- `packages/web/src/app/App.tsx` (modified)
- `packages/web/src/components/BottomNav.tsx` (modified)
- `CLAUDE.md` (modified)

If any other path appears in the diff, it slipped in by mistake — `git restore` it before push. In particular, the user has unrelated `IceCar` / `PixiStage` / `Player` / `DailyScreen` edits in their working directory; verify `git diff origin/main...HEAD -- 'packages/web/src/game'` returns empty.

- [ ] **Step F.3: Push + open PR**

```bash
git push -u origin feat/chat-pr4-web-mvp
gh pr create --base main --title "feat(chat): PR 4 — web MVP (REST, no realtime)" \
  --body "$(cat <<'EOF'
## Summary
- `chat/api.ts`: typed wrappers for every `/chat/*` REST endpoint + DTOs mirrored from server.
- `chat/chatStore.ts`: Zustand store with `unreadByChat`, `activeChatId`, and a complete `applyEvent` reducer ready for PR 5.
- `lib/queryKeys.ts`: new `chatKeys.{all,list,messages,reactions,search,users,unread}` factory.
- `chat/screens/ChatListScreen.tsx`: `useQuery` against `/chat/list`, 30s staleTime, system rows highlighted.
- `chat/screens/ChatRoomScreen.tsx`: `useInfiniteQuery` cursor pagination, send/delete/reply mutations, mark-as-read on mount.
- `chat/components/{ChatListItem,ChatBubble,ChatInput,ReplyPreview,MessageActions,UserPickerModal}.tsx`: glassmorphism UI per spec §7.6; `ChatBubble` is `React.memo` with explicit comparator (spec §10.11).
- Routes `/chat`, `/chat/new` (→ `/chat?new=1`), `/chat/:chatId` mounted under `<PrivateRoute>`.
- BottomNav: chat tab navigates instead of showing a placeholder; numeric badge wired to `chatStore.totalUnread`, hydrated via `GET /chat/unread`.

Spec: `docs/superpowers/specs/2026-04-26-internal-chat-design.md` §7, §11 step 4.

PR 1 (migration) and PR 2 (REST + guards) are already on `main`. PR 3 (realtime server) is open in parallel; this PR does not depend on it.

Out of scope: WebSocket client (`ChatSocket`) — PR 5; reactions UI — PR 6; full-text search modal — PR 7; long-press action panel — PR 8.

## Test plan
- [x] `pnpm --filter @hockey/web test` — `chatStore` reducer (10), `ChatRoomScreen` render/send/reply/delete (5), all prior tests still green.
- [x] `pnpm typecheck` clean across the workspace.
- [ ] Manual: log in, open Чат tab, see list (with one seeded system channel + DMs), open a chat, send + reply + soft-delete, badge updates after marking as read.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened. Return the URL to the user.

---

## Self-review checklist (run before declaring done)

- **Spec coverage:**
  - §7.1 file structure — `api.ts`, `chatStore.ts`, `screens/{ChatListScreen,ChatRoomScreen}.tsx`, `components/{ChatListItem,ChatBubble,ChatInput,ReplyPreview,MessageActions,UserPickerModal}.tsx` ✓ Tasks 2–9. (`ws.ts`, `ReactionPicker`, `SearchModal` deferred — Tasks call out PR 5/6/7.)
  - §7.2 routes — `/chat`, `/chat/new`, `/chat/:chatId` under `<PrivateRoute>` ✓ Task 10. `/chat/new` redirects to `/chat?new=1` (modal pattern) — entrypoint preserved.
  - §7.3 store — `unreadByChat`, `totalUnread`, `activeChatId`, `setActive`, `setUnread`, `incrementUnread`, `resetUnread`, `applyEvent` ✓ Task 3.
  - §7.4 — applies to PR 5 (`ChatSocket`); store reducer is wired so PR 5 plugs in cleanly ✓ Task 3.
  - §7.5 query keys ✓ Task 1 (plus `unread()` extension).
  - §7.6 style — glass / glass-dark / pill / btn--cta / blue accent stripe / fade-in animations / Lucide icons ✓ Tasks 4–9.
  - §6.2 REST surface — every endpoint except `/chat/messages/:id/reactions[POST/DELETE]` (PR 6) and `/chat/ws` (PR 5) gets a wrapper ✓ Task 2.
  - §10.3 Redis-cached unread for badge ✓ Task 10 (uses `GET /chat/unread`, 30s staleTime client-side).
  - §10.10 aggressive staleTime — list 30s, messages Infinity ✓ Tasks 8 & 9.
  - §10.11 `React.memo` with explicit comparator on `ChatBubble` ✓ Task 5.
- **Placeholder scan** — every `Step X.Y` shows full code or a complete diff; no TBDs; no "implement similarly to Task N" hand-waves; expected outputs are concrete; commit messages are specified verbatim.
- **Type consistency** — `ChatDTO`, `ChatMessageDTO`, `ChatEvent`, `ReactionGroupDTO`, `ChatEventFrame`, `UserPickerItem`, `MessageSearchHit`, `FindOrCreateDMResult` are all defined in Task 2 (`chat/api.ts`) and used by name in later tasks. `chatKeys` arity matches all later call sites (`chatKeys.list()`, `chatKeys.messages(id)`, `chatKeys.users(q)`, `chatKeys.unread()`). `ChatBubble` props match `ChatRoomScreen` usage (`message`, `isOwn`, `replyTo`, `onReply`, `onDelete`).
- **Out of scope respected** — no `ws.ts`, no `ChatSocket` mentions in code, no reaction endpoints called, no search modal, no long-press handler. The store's `applyEvent` is implemented now but **not invoked anywhere in PR 4** — that wiring is PR 5.
- **No emoji** — code, comments, and UI strings contain no emoji (memory: `feedback_no_emoji.md`). Lucide icons only. The single exception is the test fixture `'👍'` inside a unit test asserting that `applyEvent` is a no-op for `reaction:added` — strings inside `it(...)` blocks aren't UI; this is acceptable, but if review pushes back, replace with a placeholder string and add a comment.
