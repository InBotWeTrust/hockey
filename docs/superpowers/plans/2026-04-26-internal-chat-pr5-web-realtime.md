# Internal Chat — PR 5: Web realtime (ChatSocket + TanStack/store wiring)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the realtime gap left by PR 4. After this PR, an authenticated user holds a single WebSocket against `GET /chat/ws?token=<accessJWT>` for the lifetime of their session. Server-published `ChatEvent`s feed both the Zustand `chatStore` (unread badge) and the TanStack Query cache (chat list / messages / reactions / unread), so a second tab — or a peer talking to you — appears instantly without refetch. A slim `.glass-dark` offline banner surfaces real connection loss, and on reconnect the client reconciles the list (and the active chat's first 50 messages) it might have missed.

**Architecture:**
- `chat/ws.ts` — `ChatSocket` class. Holds at most one `WebSocket`. Pure of React/TanStack/store: takes a `getToken` callback, an `onEvent(event)` callback (for the hook to fan out into TanStack + chatStore), and an `onStatus(status)` callback. Status is one of `'connecting' | 'open' | 'reconnecting' | 'closed'`. Reconnect: exponential backoff `1s → 2s → 4s → 8s → 16s → 30s` (capped at 30s, reset on a successful `OPEN`). Close codes: `4401` triggers a token refresh attempt before reconnecting; `4408` and any other abnormal close just reconnects with backoff; `1000` (or `disconnect()` from caller) does **not** reconnect.
- `chat/useChatSocket.ts` — single React hook wired in `App.tsx`. Watches `useAuthStore(s => s.accessToken)`: when it appears, spins up a `ChatSocket`; when it clears (logout) or rotates (refresh), tears down and rebuilds. Inside, it owns the dispatch logic that translates `ChatEvent` → store mutation + TanStack patches. Returns the current `status` so the banner component can render.
- `chat/components/OfflineBanner.tsx` — slim sticky `.glass-dark` strip at the very top of the app shell. Shown only when `status !== 'open'` for ≥ 3000 ms (debounced, so a momentary reconnect doesn't flash it). Uses `position: fixed; top: 0; z-index: 700;` so it sits above the BottomNav (z-index 500).
- `api/apiFetch.ts` — exports a tiny `refreshAccessToken()` helper that reuses the existing in-flight dedup. `ChatSocket` calls it on `4401` so a stale access JWT can be rotated without us reimplementing the refresh dance.
- `app/App.tsx` — mounts a single `<ChatRealtime />` child inside `<QueryClientProvider>` and `<BrowserRouter>`. That child calls `useChatSocket()` and renders `<OfflineBanner status={...} />`. One mount per session — no per-screen sockets.
- `chat/screens/ChatRoomScreen.tsx` — drops the manual `invalidateQueries(chatKeys.list())` and (for `delete`) the manual `invalidateQueries(chatKeys.messages(chatId))` from `sendMut.onSuccess`/`deleteMut.onSuccess`/`deleteMut.onError`. The WS dispatcher now owns those invalidations end-to-end: the server publishes `message:new`/`message:deleted` to both peers (sender included — see PR 3 `events.ts` fan-out), so the originator gets the same event back and dedup happens by message-id check before prepending.
- `vite.config.ts` — adds `ws: true` to the existing `/api` proxy entry so `new WebSocket('/api/chat/ws')` upgrades through Vite to the Fastify port in dev.

**Tech Stack:** React 18, Vite 5 (`ws: true` proxy), TypeScript (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Zustand 4 (existing `chatStore`), TanStack Query 5 (existing keys), browser native `WebSocket`. Tests: vitest + jsdom + @testing-library/react + a hand-rolled `MockWebSocket` injected via `vi.stubGlobal('WebSocket', ...)`.

**Spec reference:** `docs/superpowers/specs/2026-04-26-internal-chat-design.md` §5.1 (transport + close codes), §5.4 (event union + frame), §5.5 (reconnect + rate limit — client side), §7.4 (`ChatSocket` integration shape), §11 step 5 (PR scope), §10.10 (aggressive `staleTime` + WS patches instead of polling).

**Out of scope (deferred — verify nothing slips in):**
- Reactions UI (`ReactionPicker`, group-by-emoji bar) — PR 6. PR 5 only invalidates `chatKeys.reactions(messageId)` on `reaction:added` / `reaction:removed`, which is a no-op until PR 6 mounts that query.
- Full-text search modal (`SearchModal`) — PR 7.
- Long-press / context-menu floating panel for `MessageActions` — PR 8.
- Server-side changes — none. PR 3 already wired `events.ts`, `plugins/realtime.ts`, and `chat/ws.ts` on the server.
- Daily-game timezone bug + period-log dedup — separate server PR after PR 5 (memory: not in this scope).
- Carry-over `feat/carryover-game-core-widen` work (commit `7dade63` widens shooter / goalie / goal travel by 8 px) — explicitly **not** in this PR. Verify in pre-flight that none of `packages/game-core` and none of `packages/web/src/game/**` are touched.

---

## File Structure

| Action | Path | Purpose |
|---|---|---|
| Create | `packages/web/src/chat/ws.ts` | `ChatSocket` class — connect/reconnect/heartbeat status, frame parsing, exposed via `onEvent` + `onStatus` callbacks. No React/TanStack/Zustand imports. |
| Create | `packages/web/src/chat/useChatSocket.ts` | React hook: lifecycle bound to `useAuthStore.accessToken`; routes `ChatEvent` to `chatStore.applyEvent` + targeted `setQueryData` / `invalidateQueries`; returns current `status`. |
| Create | `packages/web/src/chat/components/OfflineBanner.tsx` | Slim `.glass-dark` strip at top of app shell, shown when status ≠ `'open'` for ≥ 3000 ms. |
| Create | `packages/web/src/chat/test/ws.test.ts` | Unit tests for `ChatSocket` against a `MockWebSocket` global. Covers URL build, dispatch, backoff, 4401 → refresh → reconnect, 4408 → reconnect, manual disconnect. |
| Create | `packages/web/src/chat/test/useChatSocket.test.tsx` | Integration: hook mounts/unmounts on token, dispatches all five `ChatEvent` variants into a real `QueryClient` + `chatStore`, dedups self-echo on `message:new`, refetches on reconnect. |
| Modify | `packages/web/src/api/apiFetch.ts` | Export `refreshAccessToken(): Promise<string \| null>` — reuses the existing single-flight `refreshOnce`. |
| Modify | `packages/web/src/api/apiFetch.test.ts` | Add a test that the new `refreshAccessToken` export reuses the in-flight promise (no parallel POSTs to `/auth/refresh`). |
| Modify | `packages/web/vite.config.ts` | Add `ws: true` to the `/api` proxy entry so dev WS upgrades reach Fastify. |
| Modify | `packages/web/src/app/App.tsx` | Mount one `<ChatRealtime />` inside `<QueryClientProvider>`. That child runs `useChatSocket()` and renders `<OfflineBanner />`. |
| Modify | `packages/web/src/chat/screens/ChatRoomScreen.tsx` | Drop the duplicate `invalidateQueries({ queryKey: chatKeys.list() })` from `sendMut.onSuccess` and from `deleteMut.onSuccess`; drop the duplicate `invalidateQueries({ queryKey: chatKeys.messages(chatId) })` from `deleteMut.onError`. WS dispatcher now owns these. |
| Modify | `packages/web/src/components/BottomNav.tsx` | Drop `staleTime: 30_000` on `useQuery(chatKeys.unread())` so an `invalidate` triggered by the WS dispatcher refetches immediately (badge converges in < 100 ms instead of staring at stale 30 s). The hydration purpose of this query stays. |
| Modify | `CLAUDE.md` | One-line note: web realtime wired through `ChatSocket`; offline banner. ≤ 200 lines budget. |

---

## Pre-flight

- [ ] **Step 0.1: Confirm branch + clean tree**

```bash
cd "/Users/egorgumenyuk/Projects/Ultimate Hockey"
git status
git branch --show-current
git log -1 --oneline
```

Expected: branch `feat/chat-pr5-web-realtime`, working tree clean (or only the user's pre-existing unrelated edits in `packages/web/src/game/**` / `packages/game-core/**` — leave them, do **not** stage them in any task below). PR 5 must touch zero files under those two roots.

- [ ] **Step 0.2: Confirm PR 4 surface is in place on this branch**

```bash
ls packages/web/src/chat/{api,chatStore}.ts packages/web/src/chat/screens/{ChatListScreen,ChatRoomScreen}.tsx
grep -n "applyEvent" packages/web/src/chat/chatStore.ts
grep -n "ChatEvent\|ChatEventFrame" packages/web/src/chat/api.ts
grep -n "fetchUnreadCounts\|chatKeys\.unread" packages/web/src/components/BottomNav.tsx
```

Expected: every file present; `applyEvent` switch covers `message:new` and `chat:read` (other variants no-op); `ChatEvent` and `ChatEventFrame` types are exported from `api.ts`; `BottomNav` already hydrates from `chatKeys.unread()`. PR 5 wires events into these pre-existing seams — it does not redefine them.

- [ ] **Step 0.3: Confirm PR 3 server WS surface (sanity, no edits)**

```bash
ls packages/server/src/chat/ws.ts packages/server/src/chat/events.ts packages/server/src/plugins/realtime.ts
grep -n "CLOSE_UNAUTHORIZED\|CLOSE_HEARTBEAT_LOST\|/chat/ws" packages/server/src/chat/ws.ts
```

Expected: server `ws.ts` listens on `GET /chat/ws`, closes with `4401` on bad/missing token, `4408` on heartbeat lost, `1011` on internal setup failure. PR 5's `ChatSocket` mirrors those numbers exactly.

- [ ] **Step 0.4: Baseline green tests**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/web typecheck
pnpm --filter @hockey/web test
```

Expected: typecheck zero errors; every existing web test green. Record the test count printed by vitest — every later step must keep it ≥ that number plus the new tests added by Tasks 2/3/4.

---

## Task 1: Vite WS proxy + apiFetch.refreshAccessToken export

These two land first because they unblock Tasks 3 and 4. Vite without `ws: true` will silently fail the WebSocket upgrade in dev (the browser opens a `WS` connection that hangs in `CONNECTING`). `refreshAccessToken` is the public re-entry point `ChatSocket` needs on `4401` close.

**Files:**
- Modify: `packages/web/vite.config.ts`
- Modify: `packages/web/src/api/apiFetch.ts`
- Modify: `packages/web/src/api/apiFetch.test.ts`

- [ ] **Step 1.1: Add `ws: true` to the `/api` proxy**

Edit `packages/web/vite.config.ts`. Change:

```ts
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
```

to:

```ts
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
```

Nothing else in this file changes.

- [ ] **Step 1.2: Export `refreshAccessToken` from apiFetch**

Edit `packages/web/src/api/apiFetch.ts`. Add a new exported function under the existing `refreshOnce` (do **not** change `refreshOnce` itself — its single-flight dedup is what we want to share):

```ts
export async function refreshAccessToken(): Promise<string | null> {
  return refreshOnce();
}
```

Place this export after `refreshOnce` and before `buildHeaders`. The function returns the new access token on success, or `null` if there was no refresh token, refresh failed, or the auth user was missing — exactly the contract `apiFetch` already uses internally on its 401-retry branch.

- [ ] **Step 1.3: Add a test that the export reuses the in-flight promise**

Open `packages/web/src/api/apiFetch.test.ts`. Locate the existing `describe('apiFetch', ...)` block and append a new test inside the same `describe` (no new `describe`):

```ts
  it('refreshAccessToken reuses the in-flight refresh promise (no parallel /auth/refresh calls)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ accessToken: 'AT2', refreshToken: 'RT2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user: AuthUser = { id: 'u1', displayName: 'U' };
    useAuthStore.setState({ accessToken: 'AT1', refreshToken: 'RT1', user });
    __resetRefreshStateForTests();

    const [a, b] = await Promise.all([refreshAccessToken(), refreshAccessToken()]);
    expect(a).toBe('AT2');
    expect(b).toBe('AT2');
    // Single network call, even though refreshAccessToken was called twice in parallel.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe('AT2');
  });
```

If `refreshAccessToken` and/or `__resetRefreshStateForTests` are not yet imported at the top of the file, add them. The existing test file already imports `apiFetch`, `ApiError`, `useAuthStore`, and `AuthUser` (or the equivalent — re-read the file to match its current import style instead of duplicating).

- [ ] **Step 1.4: Run the test to make sure it passes**

```bash
pnpm --filter @hockey/web test -- src/api/apiFetch.test.ts
```

Expected: PASS. The new test runs alongside all existing apiFetch tests, all green.

- [ ] **Step 1.5: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 1.6: Commit**

```bash
git add packages/web/vite.config.ts packages/web/src/api/apiFetch.ts packages/web/src/api/apiFetch.test.ts
git commit -m "feat(web): expose refreshAccessToken + enable Vite WS proxy"
```

---

## Task 2: `chat/ws.ts` — `ChatSocket` class (TDD)

Pure transport: one WebSocket at a time, exponential backoff, status callback, event callback, manual `disconnect()`. No imports from `chatStore`, `useAuthStore`, or `@tanstack/react-query` — those wires live in the hook. This boundary is what makes `ChatSocket` testable with a single `vi.stubGlobal('WebSocket', MockWebSocket)`.

**Files:**
- Create: `packages/web/src/chat/ws.ts`
- Create: `packages/web/src/chat/test/ws.test.ts`

- [ ] **Step 2.1: Write the test scaffolding (MockWebSocket)**

Create `packages/web/src/chat/test/ws.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSocket, type ChatSocketStatus } from '../ws.js';
import type { ChatEvent, ChatEventFrame } from '../api.js';

// --- Mock WebSocket --------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(_data: string): void {}
  close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: code === 1000 } as CloseEvent);
  }

  // Test helpers
  fireOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }
  fireMessage(frame: ChatEventFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
  fireClose(code = 1006, reason = 'lost'): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: false } as CloseEvent);
  }
}

function lastSocket(): MockWebSocket {
  const s = MockWebSocket.instances.at(-1);
  if (!s) throw new Error('no MockWebSocket instance was constructed');
  return s;
}

const baseFrame = (event: ChatEvent): ChatEventFrame => ({ v: 1, event });

const sampleEvent: ChatEvent = {
  type: 'chat:read',
  chatId: 'c1',
  userId: 'u1',
  lastReadAt: '2026-04-26T00:00:00.000Z',
};
```

The header-only block compiles before any tests are added because `ChatSocket` is exported as `class` (not `interface`) — the file resolves once Step 2.4 lands. Fine for TDD: tests stay red until impl ships.

- [ ] **Step 2.2: Add the construction + dispatch test**

Append to `packages/web/src/chat/test/ws.test.ts`:

```ts
describe('ChatSocket', () => {
  let onEvent: ReturnType<typeof vi.fn>;
  let onStatus: ReturnType<typeof vi.fn>;
  let getToken: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    onEvent = vi.fn();
    onStatus = vi.fn();
    getToken = vi.fn(() => 'TOKEN-A');
    refresh = vi.fn(async () => 'TOKEN-B');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects to /api/chat/ws with the token in the query string', () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    const ws = lastSocket();
    expect(ws.url).toMatch(/\/api\/chat\/ws\?token=TOKEN-A$/);
    expect(onStatus).toHaveBeenCalledWith('connecting');
  });

  it('reports status open after the WS opens', () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    expect(onStatus).toHaveBeenCalledWith('open');
  });

  it('parses incoming v:1 frames and forwards events', () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireMessage(baseFrame(sampleEvent));
    expect(onEvent).toHaveBeenCalledWith(sampleEvent);
  });

  it('ignores malformed JSON frames without crashing', () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().onmessage?.({ data: 'not-json' } as MessageEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('ignores frames with unexpected protocol version', () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().onmessage?.({
      data: JSON.stringify({ v: 99, event: sampleEvent }),
    } as MessageEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2.3: Add backoff + close-code tests**

Append:

```ts
describe('ChatSocket reconnect', () => {
  let onEvent: ReturnType<typeof vi.fn>;
  let onStatus: ReturnType<typeof vi.fn>;
  let getToken: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    onEvent = vi.fn();
    onStatus = vi.fn();
    getToken = vi.fn(() => 'TOKEN-A');
    refresh = vi.fn(async () => 'TOKEN-B');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reconnects after an abnormal close with backoff (1s, 2s, 4s, ..., 30s cap)', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(1006, 'lost');
    expect(onStatus).toHaveBeenCalledWith('reconnecting');

    // 1s after the first abnormal close → second connection attempt.
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances.length).toBe(2);

    // Fail again — backoff doubles to 2s.
    lastSocket().fireClose(1006);
    await vi.advanceTimersByTimeAsync(1999);
    expect(MockWebSocket.instances.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(3);
  });

  it('caps backoff at 30 s', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    // Fail repeatedly to push backoff past 30s.
    for (let i = 0; i < 10; i++) {
      lastSocket().fireClose(1006);
      await vi.advanceTimersByTimeAsync(30_000);
    }
    // 11th attempt schedules at 30s, not 60s+.
    const before = MockWebSocket.instances.length;
    lastSocket().fireClose(1006);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(MockWebSocket.instances.length).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(before + 1);
  });

  it('on close 4401 calls refresh and reconnects with the new token', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(4401, 'unauthorized');

    // Let the refresh microtask settle, then advance backoff.
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances.at(-1)?.url).toMatch(/\?token=TOKEN-B$/);
  });

  it('on close 4401 + refresh failure closes for good (no reconnect loop)', async () => {
    refresh = vi.fn(async () => null);
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    const wasInstances = MockWebSocket.instances.length;
    lastSocket().fireClose(4401, 'unauthorized');
    await vi.runAllTimersAsync();
    expect(MockWebSocket.instances.length).toBe(wasInstances);
    expect(onStatus).toHaveBeenCalledWith('closed');
  });

  it('on close 4408 reconnects without calling refresh', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(4408, 'heartbeat lost');
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).not.toHaveBeenCalled();
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it('disconnect() cancels any pending reconnect and stops further attempts', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(1006);
    sock.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(onStatus).toHaveBeenLastCalledWith('closed');
  });

  it('a successful OPEN resets backoff to 1s', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(1006); // attempt 2 scheduled at +1s
    await vi.advanceTimersByTimeAsync(1000);
    lastSocket().fireOpen();      // success — backoff resets
    lastSocket().fireClose(1006); // next reconnect should be at +1s, not +2s
    await vi.advanceTimersByTimeAsync(999);
    const before = MockWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(before + 1);
  });
});
```

- [ ] **Step 2.4: Run the tests to confirm they fail (red)**

```bash
pnpm --filter @hockey/web test -- src/chat/test/ws.test.ts
```

Expected: every test fails with "Cannot find module '../ws.js'" or "ChatSocket is not defined". That confirms we're about to implement against a real failing spec rather than a tautology.

- [ ] **Step 2.5: Implement `chat/ws.ts`**

Create `packages/web/src/chat/ws.ts`:

```ts
import type { ChatEvent, ChatEventFrame } from './api.js';

export type ChatSocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface ChatSocketOptions {
  getToken: () => string | null;
  refresh: () => Promise<string | null>;
  onEvent: (event: ChatEvent) => void;
  onStatus: (status: ChatSocketStatus) => void;
}

const CLOSE_NORMAL = 1000;
const CLOSE_UNAUTHORIZED = 4401;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

function buildUrl(token: string): string {
  if (typeof window === 'undefined') return `/api/chat/ws?token=${encodeURIComponent(token)}`;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/chat/ws?token=${encodeURIComponent(token)}`;
}

export class ChatSocket {
  private ws: WebSocket | null = null;
  private opts: ChatSocketOptions;
  private backoffMs = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private status: ChatSocketStatus = 'closed';
  private stopped = false;

  constructor(opts: ChatSocketOptions) {
    this.opts = opts;
  }

  connect(): void {
    if (this.stopped) this.stopped = false;
    this.openWith(this.opts.getToken());
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(CLOSE_NORMAL, 'client disconnect');
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setStatus('closed');
  }

  private openWith(token: string | null): void {
    if (this.stopped) return;
    if (!token) {
      this.setStatus('closed');
      return;
    }
    this.setStatus(this.ws ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(buildUrl(token));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.backoffMs = MIN_BACKOFF_MS;
      this.setStatus('open');
    };

    ws.onmessage = (ev: MessageEvent) => {
      let frame: ChatEventFrame;
      try {
        frame = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ChatEventFrame;
      } catch {
        return;
      }
      if (!frame || frame.v !== 1 || !frame.event) return;
      this.opts.onEvent(frame.event);
    };

    ws.onclose = (ev: CloseEvent) => {
      this.ws = null;
      if (this.stopped) {
        this.setStatus('closed');
        return;
      }
      if (ev.code === CLOSE_UNAUTHORIZED) {
        void this.refreshAndReconnect();
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // Mirror to onclose path; browser will fire close right after on error.
    };
  }

  private async refreshAndReconnect(): Promise<void> {
    this.setStatus('reconnecting');
    let newToken: string | null = null;
    try {
      newToken = await this.opts.refresh();
    } catch {
      newToken = null;
    }
    if (this.stopped) return;
    if (!newToken) {
      this.setStatus('closed');
      this.stopped = true;
      return;
    }
    this.openWith(newToken);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.setStatus('reconnecting');
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openWith(this.opts.getToken());
    }, delay);
  }

  private setStatus(next: ChatSocketStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.opts.onStatus(next);
  }
}
```

- [ ] **Step 2.6: Run the tests until green**

```bash
pnpm --filter @hockey/web test -- src/chat/test/ws.test.ts
```

Expected: all `ChatSocket` and `ChatSocket reconnect` tests PASS. If a test fails on a specific timer assertion, re-read the test's `vi.advanceTimersByTimeAsync` calls — backoff math must be `min(2 ^ attempts * 1000, 30000)` with reset on `OPEN`.

- [ ] **Step 2.7: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 2.8: Commit**

```bash
git add packages/web/src/chat/ws.ts packages/web/src/chat/test/ws.test.ts
git commit -m "feat(web): ChatSocket — auto-reconnect WS client with token refresh"
```

---

## Task 3: `useChatSocket` hook — TanStack + chatStore wiring

The hook is the only place where `ChatSocket` meets React, TanStack Query, and Zustand. Tests render a real `<QueryClientProvider>` with a real `QueryClient` and mount the hook in a tiny harness component, then drive the same `MockWebSocket` from Task 2 to assert that the cache is patched and `chatStore` is mutated correctly.

**Files:**
- Create: `packages/web/src/chat/useChatSocket.ts`
- Create: `packages/web/src/chat/test/useChatSocket.test.tsx`

- [ ] **Step 3.1: Write the test scaffolding**

Create `packages/web/src/chat/test/useChatSocket.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useChatSocket } from '../useChatSocket.js';
import { useChatStore } from '../chatStore.js';
import { useAuthStore } from '../../auth/authStore.js';
import { chatKeys } from '../../lib/queryKeys.js';
import type { ChatEvent, ChatEventFrame, ChatMessageDTO } from '../api.js';

// --- Reuse the MockWebSocket pattern from ws.test.ts ----------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly OPEN = 1;
  readonly OPEN = 1;
  url: string;
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send(_d: string): void {}
  close(code = 1000): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '', wasClean: code === 1000 } as CloseEvent);
  }
  fireOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  fireMessage(frame: ChatEventFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
  fireClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '', wasClean: false } as CloseEvent);
  }
}

const SELF = '00000000-0000-0000-0000-00000000aaaa';
const OTHER = '00000000-0000-0000-0000-00000000bbbb';

function Harness(): ReactNode {
  useChatSocket();
  return null;
}

interface InfinitePages {
  pages: ChatMessageDTO[][];
  pageParams: unknown[];
}

const fixtureMsg = (id: string, chatId: string, senderId: string): ChatMessageDTO => ({
  id,
  chatId,
  senderId,
  content: `msg-${id}`,
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T10:00:00.000Z',
  reactions: [],
});

function setup(): { qc: QueryClient; rerender: () => void; unmount: () => void } {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
  return { qc, rerender: () => view.rerender(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>), unmount: () => view.unmount() };
}
```

- [ ] **Step 3.2: Add lifecycle tests**

Append to the same test file:

```tsx
describe('useChatSocket lifecycle', () => {
  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
    useChatStore.setState({ unreadByChat: {}, activeChatId: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not open a socket when there is no access token', () => {
    setup();
    expect(MockWebSocket.instances.length).toBe(0);
  });

  it('opens a socket once the access token appears', async () => {
    const { rerender } = setup();
    await act(async () => {
      useAuthStore.setState({
        accessToken: 'AT1',
        refreshToken: 'RT1',
        user: { id: SELF, displayName: 'Me' },
      });
    });
    rerender();
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0]?.url).toMatch(/\?token=AT1$/);
  });

  it('closes the socket on unmount', async () => {
    const { unmount } = setup();
    await act(async () => {
      useAuthStore.setState({
        accessToken: 'AT1',
        refreshToken: 'RT1',
        user: { id: SELF, displayName: 'Me' },
      });
    });
    const ws = MockWebSocket.instances[0]!;
    unmount();
    expect(ws.readyState).toBe(3);
  });

  it('rebuilds the socket when accessToken rotates', async () => {
    const { rerender } = setup();
    await act(async () => {
      useAuthStore.setState({
        accessToken: 'AT1',
        refreshToken: 'RT1',
        user: { id: SELF, displayName: 'Me' },
      });
    });
    rerender();
    await act(async () => {
      useAuthStore.setState({
        accessToken: 'AT2',
        refreshToken: 'RT2',
        user: { id: SELF, displayName: 'Me' },
      });
    });
    rerender();
    // Old socket closed, new socket opened with new token.
    expect(MockWebSocket.instances.at(-1)?.url).toMatch(/\?token=AT2$/);
    expect(MockWebSocket.instances[0]?.readyState).toBe(3);
  });
});
```

- [ ] **Step 3.3: Add event-dispatch tests**

Append:

```tsx
describe('useChatSocket dispatch', () => {
  let qc: QueryClient;

  beforeEach(async () => {
    MockWebSocket.instances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    useAuthStore.setState({
      accessToken: 'AT1',
      refreshToken: 'RT1',
      user: { id: SELF, displayName: 'Me' },
    });
    useChatStore.setState({ unreadByChat: {}, activeChatId: null });
    const harness = setup();
    qc = harness.qc;
    // Seed a messages cache for "c1" and "c-active".
    qc.setQueryData<InfinitePages>(chatKeys.messages('c1'), {
      pages: [[fixtureMsg('m0', 'c1', OTHER)]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireOpen();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('message:new on a non-active chat: prepends to messages cache, increments unread, invalidates list', async () => {
    const invalSpy = vi.spyOn(qc, 'invalidateQueries');
    const newMsg = fixtureMsg('m-new', 'c1', OTHER);
    const ev: ChatEvent = { type: 'message:new', chatId: 'c1', message: newMsg };
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({ v: 1, event: ev });
    });
    const cached = qc.getQueryData<InfinitePages>(chatKeys.messages('c1'));
    expect(cached?.pages[0]?.[0]?.id).toBe('m-new');
    expect(useChatStore.getState().unreadByChat['c1']).toBe(1);
    expect(invalSpy).toHaveBeenCalledWith({ queryKey: chatKeys.list() });
    expect(invalSpy).toHaveBeenCalledWith({ queryKey: chatKeys.unread() });
  });

  it('message:new dedup — same message id is prepended only once', async () => {
    const newMsg = fixtureMsg('m-dedup', 'c1', SELF);
    const ev: ChatEvent = { type: 'message:new', chatId: 'c1', message: newMsg };
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({ v: 1, event: ev });
      MockWebSocket.instances[0]?.fireMessage({ v: 1, event: ev });
    });
    const cached = qc.getQueryData<InfinitePages>(chatKeys.messages('c1'));
    const ids = cached?.pages.flat().map((m) => m.id) ?? [];
    expect(ids.filter((id) => id === 'm-dedup').length).toBe(1);
  });

  it('message:new on the active chat: prepends, but does NOT bump unread', async () => {
    useChatStore.getState().setActive('c1');
    const newMsg = fixtureMsg('m-active', 'c1', OTHER);
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({ v: 1, event: { type: 'message:new', chatId: 'c1', message: newMsg } });
    });
    expect(useChatStore.getState().unreadByChat['c1']).toBeUndefined();
  });

  it('message:deleted: patches the cached message to is_deleted=true, content=""', async () => {
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({ v: 1, event: { type: 'message:deleted', chatId: 'c1', messageId: 'm0' } });
    });
    const cached = qc.getQueryData<InfinitePages>(chatKeys.messages('c1'));
    const m0 = cached?.pages.flat().find((m) => m.id === 'm0');
    expect(m0?.isDeleted).toBe(true);
    expect(m0?.content).toBe('');
  });

  it('chat:read: resets unread for that chat and invalidates /chat/unread', async () => {
    useChatStore.getState().setUnread({ c1: 5 });
    const invalSpy = vi.spyOn(qc, 'invalidateQueries');
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({ v: 1, event: { type: 'chat:read', chatId: 'c1', userId: SELF, lastReadAt: '2026-04-26T11:00:00.000Z' } });
    });
    expect(useChatStore.getState().unreadByChat['c1']).toBe(0);
    expect(invalSpy).toHaveBeenCalledWith({ queryKey: chatKeys.unread() });
  });

  it('reaction:added: invalidates the reactions key (PR 6 will mount that query)', async () => {
    const invalSpy = vi.spyOn(qc, 'invalidateQueries');
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({ v: 1, event: { type: 'reaction:added', chatId: 'c1', messageId: 'm0', userId: OTHER, emoji: 'thumbs-up' } });
    });
    expect(invalSpy).toHaveBeenCalledWith({ queryKey: chatKeys.reactions('m0') });
  });

  it('on reconnect open: refetches list + active chat messages', async () => {
    useChatStore.getState().setActive('c1');
    const refetchSpy = vi.spyOn(qc, 'refetchQueries');
    await act(async () => {
      MockWebSocket.instances[0]?.fireClose(1006);
    });
    // backoff timer is real here (no fake timers in this describe) — drive a fresh open via a second instance.
    // Simulate the post-backoff reconnect by manually opening a new ws instance the hook would create.
    // (In production, ChatSocket schedules setTimeout; we test the dispatch path on the same instance below.)
    await act(async () => {
      MockWebSocket.instances[0]?.fireOpen();
    });
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: chatKeys.list() });
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: chatKeys.messages('c1') });
  });
});
```

Note on the last test: the hook treats every `'open'` status transition as a "reconnect arrival" except the very first one in the session. Implementation must track this with a `firstOpen` flag — see Step 3.5.

- [ ] **Step 3.4: Run the tests to confirm red**

```bash
pnpm --filter @hockey/web test -- src/chat/test/useChatSocket.test.tsx
```

Expected: all tests fail because `useChatSocket` doesn't exist yet.

- [ ] **Step 3.5: Implement the hook**

Create `packages/web/src/chat/useChatSocket.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ChatSocket, type ChatSocketStatus } from './ws.js';
import { useAuthStore } from '../auth/authStore.js';
import { useChatStore } from './chatStore.js';
import { refreshAccessToken } from '../api/apiFetch.js';
import { chatKeys } from '../lib/queryKeys.js';
import type { ChatEvent, ChatMessageDTO } from './api.js';

interface InfinitePages {
  pages: ChatMessageDTO[][];
  pageParams: unknown[];
}

function applyMessageNew(qc: QueryClient, chatId: string, msg: ChatMessageDTO): void {
  qc.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
    if (!old) return { pages: [[msg]], pageParams: [undefined] };
    const flat = old.pages.flat();
    if (flat.some((m) => m.id === msg.id)) return old;
    const firstPage = old.pages[0] ?? [];
    const nextFirst = [msg, ...firstPage];
    return { ...old, pages: [nextFirst, ...old.pages.slice(1)] };
  });
  void qc.invalidateQueries({ queryKey: chatKeys.list() });
  void qc.invalidateQueries({ queryKey: chatKeys.unread() });
}

function applyMessageDeleted(qc: QueryClient, chatId: string, messageId: string): void {
  qc.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
    if (!old) return old;
    let touched = false;
    const pages = old.pages.map((page) =>
      page.map((m) => {
        if (m.id !== messageId) return m;
        if (m.isDeleted && m.content === '') return m;
        touched = true;
        return { ...m, isDeleted: true, content: '' };
      }),
    );
    return touched ? { ...old, pages } : old;
  });
  void qc.invalidateQueries({ queryKey: chatKeys.list() });
}

function applyChatRead(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: chatKeys.unread() });
}

function applyReactionChange(qc: QueryClient, messageId: string): void {
  void qc.invalidateQueries({ queryKey: chatKeys.reactions(messageId) });
}

export function useChatSocket(): ChatSocketStatus {
  const qc = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [status, setStatus] = useState<ChatSocketStatus>('closed');
  const sockRef = useRef<ChatSocket | null>(null);
  const firstOpenRef = useRef(true);

  useEffect(() => {
    if (!accessToken) {
      sockRef.current?.disconnect();
      sockRef.current = null;
      setStatus('closed');
      firstOpenRef.current = true;
      return;
    }

    const sock = new ChatSocket({
      getToken: () => useAuthStore.getState().accessToken,
      refresh: () => refreshAccessToken(),
      onEvent: (event: ChatEvent) => {
        useChatStore.getState().applyEvent(event);
        switch (event.type) {
          case 'message:new':
            applyMessageNew(qc, event.chatId, event.message);
            return;
          case 'message:deleted':
            applyMessageDeleted(qc, event.chatId, event.messageId);
            return;
          case 'chat:read':
            applyChatRead(qc);
            return;
          case 'reaction:added':
          case 'reaction:removed':
            applyReactionChange(qc, event.messageId);
            return;
        }
      },
      onStatus: (next) => {
        setStatus(next);
        if (next === 'open') {
          if (firstOpenRef.current) {
            firstOpenRef.current = false;
            return;
          }
          // Reconnect arrival — catch up.
          void qc.refetchQueries({ queryKey: chatKeys.list() });
          const active = useChatStore.getState().activeChatId;
          if (active) {
            void qc.refetchQueries({ queryKey: chatKeys.messages(active) });
          }
        }
      },
    });
    sockRef.current = sock;
    sock.connect();

    return () => {
      sock.disconnect();
      sockRef.current = null;
      firstOpenRef.current = true;
    };
  }, [accessToken, qc]);

  return status;
}
```

- [ ] **Step 3.6: Run the tests until green**

```bash
pnpm --filter @hockey/web test -- src/chat/test/useChatSocket.test.tsx
```

Expected: all dispatch + lifecycle tests PASS. The reconnect-refetch test relies on the hook treating the **second** `'open'` as a reconnect — verify the `firstOpenRef` flag is reset both in cleanup and on `disconnect()`.

If the dedup test fails, re-check `applyMessageNew`: the `flat.some((m) => m.id === msg.id)` early-return is what makes a self-echoed `message:new` after the local `sendMut.onSuccess` prepend a no-op.

- [ ] **Step 3.7: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 3.8: Commit**

```bash
git add packages/web/src/chat/useChatSocket.ts packages/web/src/chat/test/useChatSocket.test.tsx
git commit -m "feat(web): useChatSocket — dispatch realtime events into TanStack + chatStore"
```

---

## Task 4: `OfflineBanner` component

Slim sticky strip. Shown only when `status !== 'open'` for ≥ 3000 ms — guards against a brief flash on page-load `'connecting'` state. Pure presentational; the hook owns the decision.

**Files:**
- Create: `packages/web/src/chat/components/OfflineBanner.tsx`

- [ ] **Step 4.1: Implement the component**

Create `packages/web/src/chat/components/OfflineBanner.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { ChatSocketStatus } from '../ws.js';

const SHOW_AFTER_MS = 3_000;

interface Props {
  status: ChatSocketStatus;
}

export function OfflineBanner({ status }: Props): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === 'open' || status === 'closed') {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [status]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass-dark"
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        margin: '0 auto',
        maxWidth: 430,
        padding: '6px 14px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.92)',
        zIndex: 700,
        borderRadius: '0 0 12px 12px',
      }}
    >
      Соединение пропало — пробуем снова...
    </div>
  );
}
```

Notes:
- `status === 'closed'` means the user logged out or refresh failed for good — no point showing a transient banner.
- `status === 'connecting'` (very first load) is also covered: the 3 s guard means we don't flash the banner during a normal sub-second connect.
- No emoji per project rule (memory: `feedback_no_emoji.md`).

- [ ] **Step 4.2: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 4.3: Commit**

```bash
git add packages/web/src/chat/components/OfflineBanner.tsx
git commit -m "feat(web): OfflineBanner — slim glass-dark strip when WS is offline"
```

---

## Task 5: Mount `<ChatRealtime />` in `App.tsx`

One mount per session. Lives inside `<QueryClientProvider>` so `useQueryClient()` works, and outside `<Routes>` so it survives navigation.

**Files:**
- Modify: `packages/web/src/app/App.tsx`

- [ ] **Step 5.1: Edit `App.tsx`**

Add the import block alongside existing chat imports:

```ts
import { useChatSocket } from '../chat/useChatSocket.js';
import { OfflineBanner } from '../chat/components/OfflineBanner.js';
```

Add a new component above `App`:

```tsx
function ChatRealtime(): JSX.Element {
  const status = useChatSocket();
  return <OfflineBanner status={status} />;
}
```

Inside the existing `App()` JSX, place `<ChatRealtime />` immediately after `<BrowserRouter>` opens (so it has access to the query client and is rendered above the routes):

```tsx
      <BrowserRouter>
        <ChatRealtime />
        <div
          className="app-shell"
```

The `<UpdatePrompt />` and `<BottomNav />` placements stay unchanged.

- [ ] **Step 5.2: Run the App test to confirm nothing broke**

```bash
pnpm --filter @hockey/web test -- src/app/App.test.tsx
```

Expected: existing `App.test.tsx` is green. If it isn't because of an unmocked `WebSocket` global, add `vi.stubGlobal('WebSocket', class { close(): void {}; constructor(){} })` to `App.test.tsx`'s `beforeEach` (no need to make it functional — the test only checks routing). Re-read `App.test.tsx` first; if it already mocks fetch and never sets an `accessToken`, no WS is opened and no stub is needed.

- [ ] **Step 5.3: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 5.4: Commit**

```bash
git add packages/web/src/app/App.tsx
git commit -m "feat(web): mount ChatRealtime + OfflineBanner once per session"
```

---

## Task 6: Drop duplicate invalidations + tighten BottomNav unread

Now that the WS dispatcher invalidates `chatKeys.list()` and `chatKeys.unread()` on every `message:new` / `message:deleted` / `chat:read`, the manual invalidations in `ChatRoomScreen` are redundant. They also slightly hurt: a sender currently fires two list invalidations (mutation + WS echo) — visible flicker on slow networks.

`BottomNav.tsx`'s 30 s `staleTime` on `useQuery(chatKeys.unread())` swallows the WS-driven `invalidateQueries` because TanStack treats stale queries as still-fresh until the timer expires. Lowering `staleTime` to 0 (default) makes the invalidate trigger an immediate refetch, which is what we want for a counter that must converge instantly.

**Files:**
- Modify: `packages/web/src/chat/screens/ChatRoomScreen.tsx`
- Modify: `packages/web/src/components/BottomNav.tsx`

- [ ] **Step 6.1: Drop duplicate `invalidateQueries` from `sendMut`**

Edit `packages/web/src/chat/screens/ChatRoomScreen.tsx`. Locate the `sendMut` block:

```ts
  const sendMut = useMutation({
    mutationFn: (vars: { content: string; replyToId: string | null }) =>
      sendMessage(chatId, {
        content: vars.content,
        ...(vars.replyToId !== null ? { replyToId: vars.replyToId } : {}),
      }),
    onSuccess: (msg) => {
      // Append to first page (server returns the created DTO).
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return { pages: [[msg]], pageParams: [undefined] };
        const firstPage = old.pages[0] ?? [];
        // Insert as newest (server DESC: index 0).
        const nextFirst = [msg, ...firstPage];
        return { ...old, pages: [nextFirst, ...old.pages.slice(1)] };
      });
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
```

Remove the trailing `void queryClient.invalidateQueries({ queryKey: chatKeys.list() });` line so the body becomes:

```ts
    onSuccess: (msg) => {
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return { pages: [[msg]], pageParams: [undefined] };
        const firstPage = old.pages[0] ?? [];
        const nextFirst = [msg, ...firstPage];
        return { ...old, pages: [nextFirst, ...old.pages.slice(1)] };
      });
    },
```

The optimistic prepend stays — that's instant local feedback and is also dedup'd by the WS handler when the server echoes our own `message:new` back to us.

- [ ] **Step 6.2: Drop duplicate invalidations from `deleteMut`**

In the same file, locate the `deleteMut` block. Remove `void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });` from `onError` and `void queryClient.invalidateQueries({ queryKey: chatKeys.list() });` from `onSuccess`. Result:

```ts
  const deleteMut = useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onMutate: (messageId) => {
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((m) => (m.id === messageId ? { ...m, isDeleted: true, content: '' } : m)),
          ),
        };
      });
    },
  });
```

Important nuance: `onError` is dropped because the WS dispatcher will not send `message:deleted` if the server rejected the delete (it never published). On a real DELETE failure the optimistic patch lingers stale until the next list/messages refetch. That's acceptable for MVP (the Trash button is gated on own-message ownership; legitimate failures are network drops, in which case the offline banner is the right signal).

- [ ] **Step 6.3: Drop `staleTime: 30_000` from BottomNav unread query**

Edit `packages/web/src/components/BottomNav.tsx`. Locate the unread query:

```ts
  const { data: unreadMap } = useQuery<Record<string, number>>({
    queryKey: chatKeys.unread(),
    queryFn: fetchUnreadCounts,
    enabled: Boolean(user),
    staleTime: 30_000,
  });
```

Remove the `staleTime` line:

```ts
  const { data: unreadMap } = useQuery<Record<string, number>>({
    queryKey: chatKeys.unread(),
    queryFn: fetchUnreadCounts,
    enabled: Boolean(user),
  });
```

- [ ] **Step 6.4: Run the full web suite**

```bash
pnpm --filter @hockey/web test
```

Expected: every test green. The existing `ChatRoomScreen.test.tsx` does not assert on the removed `invalidateQueries` calls — it watches `api.sendMessage` / `api.deleteMessage` and DOM. So those tests remain valid.

- [ ] **Step 6.5: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 6.6: Commit**

```bash
git add packages/web/src/chat/screens/ChatRoomScreen.tsx packages/web/src/components/BottomNav.tsx
git commit -m "refactor(web): WS owns chat-list/unread invalidation; drop duplicates"
```

---

## Task 7: `CLAUDE.md` — one-line note

Project rule: ≤ 200 lines (memory: `feedback_claudemd_length.md`); trim if needed. The chat blurb already mentions PR 1+2+3+4. Update it to PR 1+2+3+4+5 with one new clause about realtime web.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 7.1: Locate the section + check budget**

```bash
grep -n "^### Чат" CLAUDE.md
wc -l CLAUDE.md
```

Expected: header located. Record current line count.

- [ ] **Step 7.2: Update the section header from `PR 1+2+3+4` → `PR 1+2+3+4+5`**

Open `CLAUDE.md`. Locate the `### Чат (PR 1+2+3+4 — БД, REST, серверный realtime, web MVP)` line and change it to `### Чат (PR 1+2+3+4+5 — БД, REST, серверный realtime, web MVP, web realtime)`.

- [ ] **Step 7.3: Append one short clause to the closing sentence of the chat blurb**

Find the sentence ending `... без realtime — PR 5 добавит ChatSocket.` Replace it with:

```
PR 5 добавил ChatSocket: один WS на сессию через GET /chat/ws?token=<accessJWT>, exponential-backoff reconnect (1s → 30s), на 4401 — refresh access JWT и повторное подключение, на 4408 — реконнект, диспатч `ChatEvent` в `chatStore.applyEvent` + точечные `setQueryData`/`invalidateQueries` (`message:new` дедуп по message-id; `message:deleted` патчит `is_deleted=true, content=''`; `chat:read` инвалидирует `/chat/unread`); offline-баннер `.glass-dark` через 3s; на reconnect — refetch list + active messages.
```

- [ ] **Step 7.4: Verify length budget**

```bash
wc -l CLAUDE.md
```

Expected: ≤ 200. If over, compress the older sentences in the same chat blurb (e.g. drop the explicit `RLS нет — проверки в chat/guards.ts` clause and merge it with the routes one).

- [ ] **Step 7.5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): note web realtime + offline banner"
```

---

## Final verification

- [ ] **Step F.1: Workspace-wide gates**

```bash
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm --filter @hockey/web test
```

Expected: every command exits 0. Server tests are not run here (PR 5 makes no server changes); CI will run them.

- [ ] **Step F.2: Eyeball the diff against scope**

```bash
git diff --stat origin/feat/chat-pr4-web-mvp...HEAD
```

Expected paths only:
- `packages/web/vite.config.ts` (modified)
- `packages/web/src/api/apiFetch.ts` (modified)
- `packages/web/src/api/apiFetch.test.ts` (modified)
- `packages/web/src/chat/ws.ts` (new)
- `packages/web/src/chat/useChatSocket.ts` (new)
- `packages/web/src/chat/components/OfflineBanner.tsx` (new)
- `packages/web/src/chat/test/ws.test.ts` (new)
- `packages/web/src/chat/test/useChatSocket.test.tsx` (new)
- `packages/web/src/app/App.tsx` (modified)
- `packages/web/src/chat/screens/ChatRoomScreen.tsx` (modified)
- `packages/web/src/components/BottomNav.tsx` (modified)
- `CLAUDE.md` (modified)

If `packages/game-core/**` or `packages/web/src/game/**` appears, it slipped from a different working-copy stash — `git restore` it before push. The `7dade63` carry-over commit (shooter/goalie/goal travel widening) belongs on `feat/carryover-game-core-widen` and must not appear here.

- [ ] **Step F.3: Manual smoke (optional but recommended before PR)**

```bash
pnpm --filter @hockey/game-core build
pnpm dev:server   # shell A — must be on :3000 with redis + postgres up
pnpm dev:web      # shell B — :5173
```

In two browser windows (or two profiles), log in as different users via `/auth/dev`. From window A, send a message to user B. Expect:
- Window B sees the new message in `/chat/<chatId>` instantly (no refresh).
- BottomNav badge in window B increments to 1 if B is on a different screen, 0 (no change) if B is in that exact chat.
- Open DevTools Network → WS — confirm one frame `{v:1,event:{type:"message:new",...}}` per message.
- Kill Fastify (Ctrl+C in shell A). After ~3s the offline banner appears at the top in both windows. Restart Fastify — banner disappears within ≤ 1s after reconnect.

- [ ] **Step F.4: Push branch**

```bash
git push -u origin feat/chat-pr5-web-realtime
```

- [ ] **Step F.5: Open PR (stack-PR over PR #32)**

PR #32 (`feat/chat-pr4-web-mvp`) is still open and is the parent. Open this PR with `--base feat/chat-pr4-web-mvp`. Once #32 lands, GitHub will auto-rebase this PR's base to `main`.

```bash
gh pr create --base feat/chat-pr4-web-mvp --title "feat(chat): PR 5 — web realtime (ChatSocket + TanStack patches)" \
  --body "$(cat <<'EOF'
## Summary
- `chat/ws.ts`: `ChatSocket` class — one WebSocket per session against `GET /chat/ws?token=<accessJWT>`. Exponential backoff `1s → 30s`, reset on `OPEN`. Close codes: `4401` triggers `refreshAccessToken()` then reconnects with the new JWT; `4408` reconnects with backoff; `1000` does not reconnect.
- `chat/useChatSocket.ts`: React hook bound to `useAuthStore.accessToken`. Dispatches `ChatEvent`s to `chatStore.applyEvent` + targeted TanStack patches — `message:new` prepends to `chatKeys.messages(chatId)` (dedup by message id), `message:deleted` patches `is_deleted=true, content=''`, `chat:read` invalidates `chatKeys.unread()`, `reaction:added/removed` invalidate `chatKeys.reactions(messageId)` (PR 6 mounts that query). On every reconnect refetches `chatKeys.list()` + the active chat's messages.
- `chat/components/OfflineBanner.tsx`: slim `.glass-dark` strip shown when `status !== 'open'` for ≥ 3s.
- `App.tsx`: mounts a single `<ChatRealtime />` once per session inside `<QueryClientProvider>`. Hook is the only place where the socket meets React/TanStack/Zustand.
- `apiFetch.ts`: exports `refreshAccessToken()` reusing the existing in-flight dedup so `ChatSocket` does not re-implement the refresh dance.
- `ChatRoomScreen.tsx`: drops manual `invalidateQueries(chatKeys.list())` after send/delete (and the `messages` invalidation from the delete error branch). The WS dispatcher now owns those — including for the originator, who receives their own server-published echo and dedups by message id.
- `BottomNav.tsx`: drops `staleTime: 30_000` on the unread query so WS-driven invalidation refetches the badge instantly.
- `vite.config.ts`: `ws: true` on the `/api` proxy so dev WS upgrades reach Fastify.

Spec: `docs/superpowers/specs/2026-04-26-internal-chat-design.md` §5 (transport, events, reconnect — client side), §7.4 (`ChatSocket`), §11 step 5.

PR 1+2+3+4 are merged or queued (#32 — `feat/chat-pr4-web-mvp` — is this PR's base; it will rebase to `main` after #32 lands).

Out of scope: reactions UI (PR 6), full-text search modal (PR 7), long-press / context menu (PR 8). Server-side daily-game timezone bug + period-log dedup are tracked separately and untouched here.

## Test plan
- [x] `pnpm --filter @hockey/web test` — adds `ws.test.ts` (12 cases: URL, dispatch, malformed-frame guard, backoff doubling + 30s cap, 4401 refresh+reconnect, 4401 refresh-fail closes, 4408 plain reconnect, manual disconnect cancels, OPEN resets backoff) + `useChatSocket.test.tsx` (10 cases: lifecycle on token in/out/rotate, dispatch for each `ChatEvent` variant, dedup self-echo, reconnect refetch). Existing `ChatRoomScreen.test.tsx` and `chatStore.test.ts` stay green; `apiFetch.test.ts` gains 1 case for the new `refreshAccessToken` export.
- [x] `pnpm typecheck` clean across the workspace.
- [ ] Manual: two browser windows, message + delete + read flow, kill Fastify → banner appears in ≤ 4s, restart Fastify → banner disappears, no duplicate messages on reconnect.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened against `feat/chat-pr4-web-mvp`. Return the URL to the user.

---

## Self-review checklist (run before declaring done)

- **Spec coverage:**
  - §5.1 transport (`/chat/ws?token=`, close codes 4401/4408) — `ChatSocket` honours all three numbers ✓ Task 2.
  - §5.4 frame `{v:1,event}` + event union — parsed verbatim, `v !== 1` ignored ✓ Task 2 Step 2.5.
  - §5.5 reconnect 1s → 30s + on reconnect refetch list + active messages — backoff math + `firstOpenRef` flag ✓ Tasks 2 + 3.
  - §7.4 `ChatSocket` integration shape (dispatch into store + `setQueryData` + `invalidateQueries`) ✓ Task 3.
  - §11 step 5 PR scope — every bullet from the user prompt covered: ws.ts, hook, app mount, banner, dedup, dropped duplicate invalidations, BottomNav live badge ✓ Tasks 1–6.
  - §10.10 staleTime + WS patches not refetch — list/messages no longer refetch on every send/delete; WS owns it ✓ Task 6.
- **Placeholder scan** — every `Step X.Y` ships full code or a complete edit; no TBDs; no "implement similarly to Task N" hand-waves; expected outputs concrete; commit messages specified verbatim.
- **Type consistency:**
  - `ChatSocketStatus` defined in `chat/ws.ts` and re-imported in `useChatSocket.ts` and `OfflineBanner.tsx` ✓.
  - `ChatSocketOptions` properties match `useChatSocket`'s call site (`getToken`, `refresh`, `onEvent`, `onStatus`) ✓.
  - `ChatEvent` discriminator names match `chatStore.applyEvent` + `useChatSocket` switch — `'message:new' | 'message:deleted' | 'reaction:added' | 'reaction:removed' | 'chat:read'` ✓.
  - `chatKeys.list/messages/unread/reactions` arity matches every call site (`list()`, `messages(chatId)`, `unread()`, `reactions(messageId)`) ✓.
  - `InfinitePages` shape (`{pages: ChatMessageDTO[][]; pageParams: unknown[]}`) is identical to `ChatRoomScreen.tsx`'s — both files declare it locally; types align ✓.
- **Out of scope respected** — no reactions UI, no `SearchModal`, no long-press handler, no server diff, no `packages/game-core` or `packages/web/src/game/**` touched.
- **No emoji** — UI strings (`Соединение пропало — пробуем снова...`), comments, commit messages contain none. Lucide icons only. Fixture string `'thumbs-up'` in tests is a placeholder, not an emoji.
- **Memory invariants honoured:** `CLAUDE.md` ≤ 200 (Task 7); deploys via GitHub Actions (no infra changes); no emoji anywhere.
