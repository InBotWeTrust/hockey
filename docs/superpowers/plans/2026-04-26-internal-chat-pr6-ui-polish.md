# Internal Chat — PR 6: UI polish (chat-room header + long-press actions)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two outdated UX seams in the chat room shipped by PR 4. Header becomes Telegram-style — back arrow, chat avatar, title, search icon — and the search input slides down below the header only when the icon is tapped. Inline reply/delete icons next to every bubble are removed; reply and delete now live behind a long-press gesture that surfaces a floating `.glass` action panel anchored to the long-pressed bubble.

**Architecture:**
- `useLongPress` hook (`chat/useLongPress.ts`) — pointer-event-based, mobile + desktop. Returns props (`onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel`) you spread on the target element. Fires the callback after `delayMs` (default 500) of stationary press; cancels on movement > `moveThreshold` px (default 5) or early release. No external dependencies.
- `MessageActionsMenu` (`chat/components/MessageActionsMenu.tsx`) — floating `.glass` panel rendered via portal. Props: `{ open, anchorRect, isOwn, onReply, onDelete, onClose }`. Positions itself just above the anchor (or below if anchor is too close to the top). A transparent fixed-position backdrop catches outside clicks and Escape to close.
- `ChatRoomHeader` (`chat/components/ChatRoomHeader.tsx`) — top row of the chat room: back-arrow `.icon-btn glass`, 40px avatar (image or gradient-initial fallback, mirroring `ChatListItem`'s pattern), title, search-toggle `.icon-btn glass` button. Pure presentational; no state — parent owns `searchOpen`.
- `ChatRoomSearchBar` (`chat/components/ChatRoomSearchBar.tsx`) — slide-down search-input pill. Animates `max-height` and `opacity` on `open` toggle, focuses on open, clears on close. Single text input, debounced via the parent's filter state (already in place — we just relocate it).
- `ChatBubble` is refactored: drops the inline `MessageActions` component and instead spreads `useLongPress` handlers on its outer wrapper. Long-press fires a `onRequestActions(message, anchorRect)` callback that the parent uses to position `MessageActionsMenu`.
- `ChatRoomScreen` owns the new state slots: `searchOpen` (boolean), `actionTarget` (`{ message, anchorRect } | null`). It renders `ChatRoomHeader` + `ChatRoomSearchBar` (collapsed by default) + the existing message list + the new `MessageActionsMenu` when `actionTarget` is non-null. Two existing tests need updating to drive the new flow (long-press to expose Reply/Delete, click search-toggle to expose the input).
- `MessageActions.tsx` is deleted — its surface is replaced by `MessageActionsMenu`.

**Tech Stack:** React 18, TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, NodeNext ESM, Lucide icons (`ArrowLeft`, `Search`, `Reply`, `Trash2`, `X`). Tests: vitest + jsdom + @testing-library/react. Pointer events are stable in jsdom.

**Spec reference (informal — not from internal-chat-design.md):**
- User screenshot guidance — Header layout: back arrow + avatar + title + search-icon. Click search → input slides down below header (Telegram-style).
- User screenshot guidance — Long-press a message → floating menu with Reply / Delete (own only).
- Original spec roadmap §11 step 8 puts long-press menu in "PR 8". We're pulling it forward into this PR (renamed PR 6) per user request.

**Out of scope (deferred):**
- Subtitle in header — member count for group/system, last-seen for DM. Requires server-side `users.last_seen_at` + extending `ChatDTO.memberCount` / `dmCounterpart.lastSeenAt`. Tracked as a separate server PR. Current `ChatRoomHeader` shows only the title; the layout reserves vertical space (line-height 18) so adding a subtitle later is a one-line change.
- Reactions UI (`ReactionPicker`) — PR 7 territory.
- Full-text search across chats (`SearchModal`) — PR 8 territory. The new `ChatRoomSearchBar` only filters within the active chat (same scope as the current PR-4 in-room search).
- Server changes — none in this PR.
- Daily-game timezone bug — separate server PR.

---

## File Structure

| Action | Path | Purpose |
|---|---|---|
| Create | `packages/web/src/chat/useLongPress.ts` | Hook returning pointer-event handlers; fires callback after stationary press. No deps. |
| Create | `packages/web/src/chat/test/useLongPress.test.tsx` | Hook unit tests against pointer events in jsdom + fake timers. |
| Create | `packages/web/src/chat/components/MessageActionsMenu.tsx` | Floating `.glass` panel via portal; backdrop + Escape dismiss. |
| Create | `packages/web/src/chat/components/ChatRoomHeader.tsx` | Top row: arrow, avatar (image or gradient-initial), title, search-toggle. |
| Create | `packages/web/src/chat/components/ChatRoomSearchBar.tsx` | Slide-down search input; controlled `open`/`value`. |
| Modify | `packages/web/src/chat/components/ChatBubble.tsx` | Drop inline `MessageActions`; spread `useLongPress` on bubble wrapper; emit `onRequestActions`. |
| Modify | `packages/web/src/chat/screens/ChatRoomScreen.tsx` | Replace inline header markup with `ChatRoomHeader` + `ChatRoomSearchBar` + `MessageActionsMenu`. Add `searchOpen` and `actionTarget` state. |
| Modify | `packages/web/src/chat/test/ChatRoomScreen.test.tsx` | Update three tests to drive the new flow (search-toggle click, long-press to surface Reply/Delete). |
| Delete | `packages/web/src/chat/components/MessageActions.tsx` | Replaced by `MessageActionsMenu`. |
| Modify | `CLAUDE.md` | One-line note: header redesign + long-press menu landed in PR 6. ≤ 200 lines budget. |

---

## Pre-flight

- [ ] **Step 0.1: Confirm branch + clean tree**

```bash
cd "/Users/egorgumenyuk/Projects/Ultimate Hockey"
git status
git branch --show-current
git log -1 --oneline
```

Expected: branch `feat/chat-pr6-ui-polish`, working tree clean (or only the user's pre-existing unrelated edits in `packages/web/src/game/**` / `packages/game-core/**` — leave them, do **not** stage them in any task below). Top commit is `8ef6e8f docs(claude): note web realtime + offline banner` (the last PR-5 commit; PR 6 stacks above it).

- [ ] **Step 0.2: Confirm PR 5 surface is intact**

```bash
ls packages/web/src/chat/{ws,useChatSocket}.ts packages/web/src/chat/components/OfflineBanner.tsx
grep -n "ChatSocket\|useChatSocket\|OfflineBanner" packages/web/src/app/App.tsx
```

Expected: all files present; `App.tsx` references the three symbols. PR 6 must not regress any PR 5 wiring.

- [ ] **Step 0.3: Baseline green tests**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/web typecheck
pnpm --filter @hockey/web test
```

Expected: typecheck zero errors; 86/86 tests green (PR 5 baseline). Record the test count.

---

## Task 1: `useLongPress` hook (TDD)

Pure utility, no React Testing Library magic — all tests are React-mounted but the hook surface is a plain object of event handlers.

**Files:**
- Create: `packages/web/src/chat/useLongPress.ts`
- Create: `packages/web/src/chat/test/useLongPress.test.tsx`

- [ ] **Step 1.1: Write the failing tests**

Create `packages/web/src/chat/test/useLongPress.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useLongPress } from '../useLongPress.js';

function Probe(props: { onLongPress: (rect: DOMRect) => void; delayMs?: number }): JSX.Element {
  const handlers = useLongPress(props.onLongPress, { delayMs: props.delayMs ?? 500 });
  return (
    <div data-testid="target" {...handlers} style={{ width: 100, height: 50 }}>
      hold me
    </div>
  );
}

const pointerDown = (target: HTMLElement, x = 10, y = 10): void =>
  fireEvent.pointerDown(target, { pointerId: 1, clientX: x, clientY: y, isPrimary: true });
const pointerUp = (target: HTMLElement, x = 10, y = 10): void =>
  fireEvent.pointerUp(target, { pointerId: 1, clientX: x, clientY: y });
const pointerMove = (target: HTMLElement, x: number, y: number): void =>
  fireEvent.pointerMove(target, { pointerId: 1, clientX: x, clientY: y });
const pointerCancel = (target: HTMLElement): void =>
  fireEvent.pointerCancel(target, { pointerId: 1 });

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the callback after delayMs of stationary press', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    vi.advanceTimersByTime(499);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('passes the bounding rect of the target as the callback argument', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(typeof (arg as DOMRect).top).toBe('number');
  });

  it('cancels when the pointer moves more than 5 px', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target, 10, 10);
    pointerMove(target, 20, 10);
    vi.advanceTimersByTime(600);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not cancel for sub-threshold jitter (<= 5 px)', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target, 10, 10);
    pointerMove(target, 13, 12);
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancels on early pointer up', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    vi.advanceTimersByTime(300);
    pointerUp(target);
    vi.advanceTimersByTime(300);
    expect(cb).not.toHaveBeenCalled();
  });

  it('cancels on pointer cancel (e.g. browser scroll takes over)', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    pointerCancel(target);
    vi.advanceTimersByTime(600);
    expect(cb).not.toHaveBeenCalled();
  });

  it('respects a custom delayMs', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} delayMs={250} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    vi.advanceTimersByTime(249);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('only fires once per press (re-press required)', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(500); // no second fire from a single press
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm RED**

```bash
pnpm --filter @hockey/web test -- src/chat/test/useLongPress.test.tsx
```

Expected: every test fails with `Cannot find module '../useLongPress.js'`.

- [ ] **Step 1.3: Implement the hook**

Create `packages/web/src/chat/useLongPress.ts`:

```ts
import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface UseLongPressOptions {
  delayMs?: number;
  moveThreshold?: number;
}

export interface UseLongPressHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => void;
}

interface PressState {
  startX: number;
  startY: number;
  timer: ReturnType<typeof setTimeout> | null;
  pointerId: number;
}

export function useLongPress(
  callback: (rect: DOMRect) => void,
  opts: UseLongPressOptions = {},
): UseLongPressHandlers {
  const delayMs = opts.delayMs ?? 500;
  const moveThreshold = opts.moveThreshold ?? 5;
  const stateRef = useRef<PressState | null>(null);

  const cancel = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    stateRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!e.isPrimary) return;
      const target = e.currentTarget;
      const timer = setTimeout(() => {
        if (stateRef.current?.timer === timer) {
          stateRef.current = null;
          const rect = target.getBoundingClientRect();
          callback(rect);
        }
      }, delayMs);
      stateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        timer,
        pointerId: e.pointerId,
      };
    },
    [callback, delayMs],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const s = stateRef.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (Math.hypot(dx, dy) > moveThreshold) cancel();
    },
    [cancel, moveThreshold],
  );

  const onPointerUp = cancel;
  const onPointerCancel = cancel;
  const onPointerLeave = cancel;

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave };
}
```

- [ ] **Step 1.4: Run tests until GREEN**

```bash
pnpm --filter @hockey/web test -- src/chat/test/useLongPress.test.tsx
```

Expected: all 8 tests pass.

- [ ] **Step 1.5: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 1.6: Commit**

```bash
git add packages/web/src/chat/useLongPress.ts packages/web/src/chat/test/useLongPress.test.tsx
git commit -m "feat(web): useLongPress — pointer-based hold gesture"
```

---

## Task 2: `MessageActionsMenu` floating panel

A `.glass` panel rendered through `createPortal` so it escapes the message-list scroll container's stacking context. Backdrop catches outside taps; Escape key closes; arrow-up/down do not navigate (out of scope).

**Files:**
- Create: `packages/web/src/chat/components/MessageActionsMenu.tsx`

- [ ] **Step 2.1: Implement the component**

Create `packages/web/src/chat/components/MessageActionsMenu.tsx`:

```tsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Reply, Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  isOwn: boolean;
  onReply: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const PANEL_GAP = 8;
const PANEL_WIDTH = 168;
const PANEL_HEIGHT_OWN = 96;
const PANEL_HEIGHT_OTHER = 48;

function panelPosition(anchor: DOMRect, height: number): { top: number; left: number } {
  const above = anchor.top - height - PANEL_GAP;
  const below = anchor.bottom + PANEL_GAP;
  const top = above >= 8 ? above : below;
  const wantedLeft = anchor.left + anchor.width / 2 - PANEL_WIDTH / 2;
  const maxLeft = window.innerWidth - PANEL_WIDTH - 8;
  const left = Math.min(Math.max(8, wantedLeft), Math.max(8, maxLeft));
  return { top, left };
}

export function MessageActionsMenu({
  open,
  anchorRect,
  isOwn,
  onReply,
  onDelete,
  onClose,
}: Props): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  const height = isOwn ? PANEL_HEIGHT_OWN : PANEL_HEIGHT_OTHER;
  const pos = panelPosition(anchorRect, height);

  return createPortal(
    <>
      <div
        aria-hidden
        onPointerDown={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.04)',
          zIndex: 800,
        }}
      />
      <div
        role="menu"
        aria-label="Действия с сообщением"
        className="glass"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: PANEL_WIDTH,
          padding: 6,
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          zIndex: 801,
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onReply();
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            border: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 14,
            cursor: 'pointer',
            borderRadius: 12,
            textAlign: 'left',
          }}
        >
          <Reply size={16} />
          Ответить
        </button>
        {isOwn && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDelete();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              border: 'none',
              background: 'transparent',
              color: 'rgb(220, 38, 38)',
              fontSize: 14,
              cursor: 'pointer',
              borderRadius: 12,
              textAlign: 'left',
            }}
          >
            <Trash2 size={16} />
            Удалить
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
```

Notes:
- The panel uses `position: fixed` so it doesn't reflow when the message list scrolls. Anchor recalculation on scroll is **not** in MVP — the menu auto-closes on outside tap, which a scroll gesture triggers via the backdrop. (User scroll → backdrop pointerdown → close.)
- Aria roles: outer is `role="menu"`, items are `role="menuitem"`. No focus trap in MVP — a long-press gesture user is touching, not keyboard-navigating.
- Russian labels are `Ответить` / `Удалить`. No emoji.

- [ ] **Step 2.2: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 2.3: Commit**

```bash
git add packages/web/src/chat/components/MessageActionsMenu.tsx
git commit -m "feat(web): MessageActionsMenu — floating glass panel for long-press actions"
```

---

## Task 3: `ChatRoomHeader` component

40px avatar mirrors the `ChatListItem` pattern (image when present, otherwise gradient circle with title initial). Title truncates on overflow. Search-toggle is `.icon-btn glass`, identical 40×40 sizing as the existing back-arrow.

**Files:**
- Create: `packages/web/src/chat/components/ChatRoomHeader.tsx`

- [ ] **Step 3.1: Implement the component**

Create `packages/web/src/chat/components/ChatRoomHeader.tsx`:

```tsx
import { ArrowLeft, Search, X } from 'lucide-react';

interface Props {
  title: string;
  avatarUrl: string | null;
  onBack: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
}

function avatarInitial(title: string): string {
  return (title.trim() || '?').charAt(0).toUpperCase();
}

export function ChatRoomHeader({
  title,
  avatarUrl,
  onBack,
  searchOpen,
  onToggleSearch,
}: Props): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: 'calc(10px + env(safe-area-inset-top, 0px) / 2) 12px 0',
      }}
    >
      <button
        type="button"
        className="icon-btn glass"
        aria-label="К списку чатов"
        onClick={onBack}
        style={{
          width: 40,
          height: 40,
          minWidth: 40,
          minHeight: 40,
          borderRadius: 999,
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <ArrowLeft size={16} />
      </button>

      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          aria-hidden
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
            flexShrink: 0,
          }}
        >
          {avatarInitial(title)}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--ink)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: '18px',
          }}
        >
          {title}
        </div>
      </div>

      <button
        type="button"
        className="icon-btn glass"
        aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск по чату'}
        aria-pressed={searchOpen}
        onClick={onToggleSearch}
        style={{
          width: 40,
          height: 40,
          minWidth: 40,
          minHeight: 40,
          borderRadius: 999,
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {searchOpen ? <X size={16} /> : <Search size={16} />}
      </button>
    </div>
  );
}
```

Notes:
- The title container reserves `lineHeight: '18px'` instead of pushing a multi-line layout; later the subtitle (member count / last-seen) drops in as a second `<div>` here without changing the header height.
- `aria-pressed={searchOpen}` makes the toggle state announceable.

- [ ] **Step 3.2: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 3.3: Commit**

```bash
git add packages/web/src/chat/components/ChatRoomHeader.tsx
git commit -m "feat(web): ChatRoomHeader — back arrow, avatar, title, search toggle"
```

---

## Task 4: `ChatRoomSearchBar` slide-down input

Animates `max-height` from 0 to 56 and `opacity` from 0 to 1. Auto-focuses the input on open; the parent owns the value.

**Files:**
- Create: `packages/web/src/chat/components/ChatRoomSearchBar.tsx`

- [ ] **Step 4.1: Implement the component**

Create `packages/web/src/chat/components/ChatRoomSearchBar.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

interface Props {
  open: boolean;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}

export function ChatRoomSearchBar({ open, value, placeholder, onChange }: Props): JSX.Element {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      ref.current?.focus();
    } else if (value !== '') {
      onChange('');
    }
  }, [open, value, onChange]);

  return (
    <div
      aria-hidden={!open}
      style={{
        margin: '8px 14px 0',
        maxHeight: open ? 48 : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 180ms ease-out, opacity 140ms ease-out',
      }}
    >
      <div
        className="glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          height: 40,
          borderRadius: 999,
        }}
      >
        <Search size={14} color="var(--muted)" aria-hidden />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Поиск по чату"
          tabIndex={open ? 0 : -1}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );
}
```

Notes:
- Closing the bar clears the value (so the next open starts empty), via the `else if (value !== '')` branch in the effect.
- `tabIndex={open ? 0 : -1}` keeps the closed input out of the tab order.
- `aria-hidden={!open}` keeps screen readers from announcing the closed bar.

- [ ] **Step 4.2: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 4.3: Commit**

```bash
git add packages/web/src/chat/components/ChatRoomSearchBar.tsx
git commit -m "feat(web): ChatRoomSearchBar — slide-down search input pill"
```

---

## Task 5: Refactor `ChatBubble` to use long-press

Drops the inline `MessageActions` icons. The bubble's outer wrapper spreads `useLongPress` handlers; the long-press fires `onRequestActions(message, anchorRect)` at the parent. The bubble no longer takes `onReply` or `onDelete` directly — those move to the parent's `MessageActionsMenu`.

**Files:**
- Modify: `packages/web/src/chat/components/ChatBubble.tsx`

- [ ] **Step 5.1: Replace `ChatBubble.tsx`**

Overwrite `packages/web/src/chat/components/ChatBubble.tsx`:

```tsx
import { memo } from 'react';
import type { ChatMessageDTO } from '../api.js';
import { ReplyPreview } from './ReplyPreview.js';
import { useLongPress } from '../useLongPress.js';

interface ChatBubbleProps {
  message: ChatMessageDTO;
  isOwn: boolean;
  replyTo?: { senderName: string; content: string } | null;
  onRequestActions: (message: ChatMessageDTO, anchorRect: DOMRect) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function ChatBubbleImpl({
  message,
  isOwn,
  replyTo,
  onRequestActions,
}: ChatBubbleProps): JSX.Element {
  const className = isOwn ? 'glass-dark' : 'glass';
  const align = isOwn ? 'flex-end' : 'flex-start';
  const radius = isOwn ? '20px 20px 4px 20px' : '20px 20px 20px 4px';
  const text = message.isDeleted ? 'Сообщение удалено' : message.content;

  const longPress = useLongPress(
    (rect) => {
      if (message.isDeleted) return;
      onRequestActions(message, rect);
    },
    { delayMs: 500 },
  );

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
      <div
        {...longPress}
        style={{
          maxWidth: '78%',
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
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

function areEqual(prev: ChatBubbleProps, next: ChatBubbleProps): boolean {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.isDeleted === next.message.isDeleted &&
    prev.isOwn === next.isOwn &&
    prev.replyTo?.content === next.replyTo?.content &&
    prev.replyTo?.senderName === next.replyTo?.senderName &&
    prev.onRequestActions === next.onRequestActions
  );
}

export const ChatBubble = memo(ChatBubbleImpl, areEqual);
```

- [ ] **Step 5.2: Delete the now-unused `MessageActions.tsx`**

```bash
git rm packages/web/src/chat/components/MessageActions.tsx
```

- [ ] **Step 5.3: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors. (`ChatRoomScreen.tsx` still references `onReply`/`onDelete` props on `ChatBubble` at this point — typecheck will fail. That's expected; Task 6 fixes it.)

If typecheck fails ONLY on `ChatRoomScreen.tsx` for the `ChatBubble` props mismatch, proceed — Task 6 will resolve it. Do NOT fix it here; commits would mix concerns.

- [ ] **Step 5.4: Commit**

```bash
git add packages/web/src/chat/components/ChatBubble.tsx
git commit -m "refactor(web): ChatBubble — drop inline actions, route long-press to parent"
```

The `git rm` of MessageActions is staged in the same `git rm` invocation; verify with `git status` that both the modify and the delete are in the index. If they aren't, run `git add -A packages/web/src/chat/components/` before commit.

---

## Task 6: Refactor `ChatRoomScreen` to adopt the new pieces

Replaces the inline header markup with `ChatRoomHeader` + `ChatRoomSearchBar`, adds `searchOpen` and `actionTarget` state, mounts `MessageActionsMenu` when an action is requested, wires the existing reply/delete handlers to it.

**Files:**
- Modify: `packages/web/src/chat/screens/ChatRoomScreen.tsx`

- [ ] **Step 6.1: Replace `ChatRoomScreen.tsx`**

Overwrite `packages/web/src/chat/screens/ChatRoomScreen.tsx`:

```tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  deleteMessage,
  fetchMessages,
  markChatAsRead,
  sendMessage,
  type ChatDTO,
  type ChatMessageDTO,
} from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { useAuthStore } from '../../auth/authStore.js';
import { ChatBubble } from '../components/ChatBubble.js';
import { ChatInput } from '../components/ChatInput.js';
import { ChatRoomHeader } from '../components/ChatRoomHeader.js';
import { ChatRoomSearchBar } from '../components/ChatRoomSearchBar.js';
import { MessageActionsMenu } from '../components/MessageActionsMenu.js';

const PAGE_SIZE = 50;

interface InfinitePages {
  pages: ChatMessageDTO[][];
  pageParams: unknown[];
}

interface ActionTarget {
  message: ChatMessageDTO;
  anchorRect: DOMRect;
}

export function ChatRoomScreen(): JSX.Element {
  const params = useParams<{ chatId: string }>();
  const chatId = params.chatId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const setActive = useChatStore((s) => s.setActive);
  const resetUnread = useChatStore((s) => s.resetUnread);

  const [replyTo, setReplyTo] = useState<ChatMessageDTO | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);

  const chatMeta = queryClient
    .getQueryData<ChatDTO[]>(chatKeys.list())
    ?.find((c) => c.id === chatId);
  const chatTitle =
    chatMeta?.type === 'direct'
      ? (chatMeta.dmCounterpart?.displayName ?? 'Диалог')
      : (chatMeta?.name ?? (chatMeta?.type === 'system' ? 'Системный канал' : 'Чат'));
  const chatAvatarUrl = chatMeta?.dmCounterpart?.avatarUrl ?? null;

  useEffect(() => {
    if (!chatId) return;
    setActive(chatId);
    return () => setActive(null);
  }, [chatId, setActive]);

  const query = useInfiniteQuery<
    ChatMessageDTO[],
    Error,
    InfinitePages,
    ReturnType<typeof chatKeys.messages>,
    string | undefined
  >({
    queryKey: chatKeys.messages(chatId),
    enabled: chatId.length > 0,
    queryFn: ({ pageParam }) =>
      fetchMessages(chatId, {
        limit: PAGE_SIZE,
        ...(pageParam ? { before: pageParam } : {}),
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1]?.createdAt;
    },
    staleTime: Infinity,
  });

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

  const messages = useMemo<ChatMessageDTO[]>(() => {
    if (!query.data) return [];
    const all = query.data.pages.flat();
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
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return { pages: [[msg]], pageParams: [undefined] };
        const firstPage = old.pages[0] ?? [];
        const nextFirst = [msg, ...firstPage];
        return { ...old, pages: [nextFirst, ...old.pages.slice(1)] };
      });
    },
  });

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

  const onRequestActions = useCallback(
    (message: ChatMessageDTO, anchorRect: DOMRect): void => {
      setActionTarget({ message, anchorRect });
    },
    [],
  );
  const onCloseActions = useCallback(() => setActionTarget(null), []);

  const onReplyTo = useCallback((m: ChatMessageDTO) => setReplyTo(m), []);
  const onDeleteId = useCallback((id: string) => deleteMut.mutate(id), [deleteMut]);

  const handleSend = useCallback(
    (content: string, replyToId: string | null): void => {
      sendMut.mutate({ content, replyToId });
    },
    [sendMut],
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const visibleMessages = useMemo<ChatMessageDTO[]>(() => {
    if (trimmedQuery.length === 0) return messages;
    return messages.filter(
      (m) => !m.isDeleted && m.content.toLowerCase().includes(trimmedQuery),
    );
  }, [messages, trimmedQuery]);

  const actionMessage = actionTarget?.message ?? null;
  const actionIsOwn = actionMessage ? actionMessage.senderId === meId : false;

  return (
    <main
      className="screen"
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        bottom: 0,
        minHeight: 0,
      }}
    >
      <ChatRoomHeader
        title={chatTitle}
        avatarUrl={chatAvatarUrl}
        onBack={() => navigate('/chat')}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((o) => !o)}
      />
      <ChatRoomSearchBar
        open={searchOpen}
        value={searchQuery}
        placeholder={`Поиск в «${chatTitle}»`}
        onChange={setSearchQuery}
      />

      <div
        data-testid="messages-list"
        style={{
          flex: 1,
          minHeight: 0,
          padding: '8px 14px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {query.hasNextPage && trimmedQuery.length === 0 && (
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
        {visibleMessages.length === 0 && trimmedQuery.length > 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
            Ничего не найдено
          </div>
        )}
        {visibleMessages.map((m) => {
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
              onRequestActions={onRequestActions}
            />
          );
        })}
      </div>

      <div style={{ marginBottom: `calc(12px + env(safe-area-inset-bottom, 0px) / 2)` }}>
        <ChatInput
          replyTo={replyTo}
          replyToSenderName={replyTo ? senderNameOf(replyTo) : undefined}
          onClearReply={() => setReplyTo(null)}
          disabled={sendMut.isPending}
          onSend={handleSend}
        />
      </div>

      <MessageActionsMenu
        open={actionTarget !== null}
        anchorRect={actionTarget?.anchorRect ?? null}
        isOwn={actionIsOwn}
        onReply={() => actionMessage && onReplyTo(actionMessage)}
        onDelete={() => actionMessage && onDeleteId(actionMessage.id)}
        onClose={onCloseActions}
      />
    </main>
  );
}
```

- [ ] **Step 6.2: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 6.3: Commit**

```bash
git add packages/web/src/chat/screens/ChatRoomScreen.tsx
git commit -m "feat(web): chat-room — adopt header redesign + long-press action menu"
```

---

## Task 7: Update `ChatRoomScreen.test.tsx` for the new flow

Three existing tests assume the old surface: a directly visible search input, and inline `Ответить` / `Удалить сообщение` buttons next to every bubble. They need to drive the new flow — open the search via the header toggle, long-press to surface the action menu.

jsdom supports `pointerdown`/`pointerup`/`pointermove` events via `fireEvent.pointerDown`/etc., and `setTimeout` resolves under `vi.useFakeTimers()`.

**Files:**
- Modify: `packages/web/src/chat/test/ChatRoomScreen.test.tsx`

- [ ] **Step 7.1: Replace `ChatRoomScreen.test.tsx`**

Overwrite `packages/web/src/chat/test/ChatRoomScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatRoomScreen } from '../screens/ChatRoomScreen.js';
import { useAuthStore, type AuthUser } from '../../auth/authStore.js';
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

function longPressBubble(messageId: string): void {
  const bubble = screen.getAllByTestId('chat-bubble').find(
    (el) => el.getAttribute('data-message-id') === messageId,
  );
  if (!bubble) throw new Error(`bubble ${messageId} not in DOM`);
  // The long-press handlers are on the inner wrapper (first child of the bubble div).
  const wrapper = bubble.querySelector<HTMLElement>('div');
  if (!wrapper) throw new Error('bubble inner wrapper missing');
  fireEvent.pointerDown(wrapper, { pointerId: 1, clientX: 0, clientY: 0, isPrimary: true });
  vi.advanceTimersByTime(500);
  fireEvent.pointerUp(wrapper, { pointerId: 1, clientX: 0, clientY: 0 });
}

describe('ChatRoomScreen', () => {
  beforeEach(() => {
    const user: AuthUser = { id: SELF_ID, displayName: 'Me', grip: 'right' };
    useAuthStore.setState({ accessToken: 'tok', refreshToken: 'rtok', user });
    vi.spyOn(api, 'fetchMessages').mockResolvedValue([msgFromSelf, msgFromOther]); // server DESC
    vi.spyOn(api, 'markChatAsRead').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders messages from REST in chronological order', async () => {
    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));
    const bubbles = screen.getAllByTestId('chat-bubble');
    expect(bubbles[0]?.getAttribute('data-message-id')).toBe('m1');
    expect(bubbles[1]?.getAttribute('data-message-id')).toBe('m2');
    expect(screen.getByText('привет')).toBeInTheDocument();
    expect(screen.getByText('хай')).toBeInTheDocument();
  });

  it('marks the chat as read on mount once messages have loaded', async () => {
    renderRoom('c1');
    await waitFor(() => expect(api.markChatAsRead).toHaveBeenCalledWith('c1'));
  });

  it('search toggle: header search button reveals the input below; typing filters messages', async () => {
    renderRoom('c1');
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble').length).toBe(2));

    // Closed by default — input is in DOM but not in the tab order.
    const beforeOpen = screen.getByLabelText('Поиск по чату') as HTMLInputElement;
    expect(beforeOpen.tabIndex).toBe(-1);

    fireEvent.click(screen.getByLabelText('Поиск по чату', { selector: 'button' }));
    const input = screen.getByLabelText('Поиск по чату', { selector: 'input' }) as HTMLInputElement;
    expect(input.tabIndex).toBe(0);

    fireEvent.change(input, { target: { value: 'привет' } });
    await waitFor(() => expect(screen.queryByText('хай')).toBeNull());
    expect(screen.getByText('привет')).toBeInTheDocument();
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

  it('long-press on a foreign bubble surfaces a Reply action; using it sets replyToId on the next send', async () => {
    vi.useFakeTimers();
    const sendSpy = vi.spyOn(api, 'sendMessage').mockResolvedValue({
      ...msgFromSelf,
      id: 'm4',
      content: 'отвечаю',
      replyToId: 'm1',
    });

    renderRoom('c1');
    // Run pending timers from React's effects (mark-as-read + initial render),
    // then move on to the synchronous test interactions.
    await vi.runAllTimersAsync();

    longPressBubble('m1');
    expect(screen.getByRole('menuitem', { name: 'Ответить' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ответить' }));

    await waitFor(() => expect(screen.getByLabelText('Снять ответ')).toBeInTheDocument());

    // Switch back to real timers so userEvent fires settle naturally for the send path.
    vi.useRealTimers();

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'отвечаю' } });
    fireEvent.click(screen.getByLabelText('Отправить'));

    await waitFor(() =>
      expect(sendSpy).toHaveBeenCalledWith('c1', { content: 'отвечаю', replyToId: 'm1' }),
    );
    await waitFor(() => expect(screen.queryByLabelText('Снять ответ')).toBeNull());
  });

  it('long-press on own bubble surfaces a Delete action; using it optimistically marks the message deleted', async () => {
    vi.useFakeTimers();
    const delSpy = vi.spyOn(api, 'deleteMessage').mockResolvedValue(undefined);

    renderRoom('c1');
    await vi.runAllTimersAsync();

    longPressBubble('m2');
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));

    vi.useRealTimers();

    await waitFor(() => expect(delSpy).toHaveBeenCalledWith('m2'));
    await waitFor(() => expect(screen.getByText('Сообщение удалено')).toBeInTheDocument());
  });
});
```

Notes on the test:
- The two long-press tests use `vi.useFakeTimers()` so the 500 ms timer in `useLongPress` advances synchronously. After dismissing the menu (or before any `fetch` mock has to resolve), they switch back to real timers. `vi.restoreAllMocks` + `vi.useRealTimers` in `afterEach` keep test isolation.
- `getByLabelText('Поиск по чату', { selector: 'button' })` and `... { selector: 'input' }` distinguish the header toggle button (aria-label `Поиск по чату`) from the input (aria-label `Поиск по чату`). If Testing Library's selector qualifier is unreliable in this version, fall back to `getByRole('button', { name: 'Поиск по чату' })` + `getByRole('searchbox')`.
- The `data-testid="chat-bubble"` outer wrapper has the `useLongPress` handlers on its FIRST child div (the `maxWidth: '78%'` wrapper). `longPressBubble` finds that child.

- [ ] **Step 7.2: Run the full web suite**

```bash
pnpm --filter @hockey/web test
```

Expected: every test green, including the rewritten `ChatRoomScreen.test.tsx`. `useLongPress.test.tsx` continues to pass. Total = 86 (PR 5 baseline) + 8 (`useLongPress`) + 1 net new in `ChatRoomScreen.test.tsx` (search-toggle test) − 0 removed = 95.

If `getByLabelText('Поиск по чату', { selector: 'button' })` / `'input' }` fails to disambiguate, change those two lines to `getByRole('button', { name: 'Поиск по чату' })` and `getByRole('searchbox')`. Re-run and confirm green.

- [ ] **Step 7.3: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```

Expected: zero errors.

- [ ] **Step 7.4: Commit**

```bash
git add packages/web/src/chat/test/ChatRoomScreen.test.tsx
git commit -m "test(web): chat-room — drive new search toggle + long-press action flow"
```

---

## Task 8: `CLAUDE.md` — one-line note

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 8.1: Locate + check budget**

```bash
grep -n "^### Чат" CLAUDE.md
wc -l CLAUDE.md
```

Expected: header located. Total ≤ 200.

- [ ] **Step 8.2: Update the section header**

Open `CLAUDE.md`. Locate the header `### Чат (PR 1+2+3+4+5 — БД, REST, серверный realtime, web MVP, web realtime)` and change to:

```
### Чат (PR 1+2+3+4+5+6 — БД, REST, серверный realtime, web MVP, web realtime, UI polish)
```

- [ ] **Step 8.3: Append one short clause to the closing sentence**

Inside the same chat blurb, after the existing realtime sentence (the one ending `... refetch list + active messages.`), add:

```
PR 6 — UI-полиш: header переехал на `arrow + avatar + title + search-toggle`, поиск разворачивается ниже по клику; reply/delete переехали из inline-иконок в long-press floating menu (`useLongPress` 500ms + `MessageActionsMenu` через portal).
```

- [ ] **Step 8.4: Verify length budget**

```bash
wc -l CLAUDE.md
```

Expected: ≤ 200.

- [ ] **Step 8.5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): note chat-room header redesign + long-press menu"
```

---

## Final verification

- [ ] **Step F.1: Workspace-wide gates**

```bash
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm --filter @hockey/web test
```

Expected: every command exits 0. Total web tests ≈ 95 (86 PR-5 baseline + 8 useLongPress + 1 net new search-toggle test).

- [ ] **Step F.2: Eyeball the diff against scope**

```bash
git diff --stat origin/feat/chat-pr5-web-realtime...HEAD
```

Expected paths only:
- `packages/web/src/chat/useLongPress.ts` (new)
- `packages/web/src/chat/test/useLongPress.test.tsx` (new)
- `packages/web/src/chat/components/MessageActionsMenu.tsx` (new)
- `packages/web/src/chat/components/ChatRoomHeader.tsx` (new)
- `packages/web/src/chat/components/ChatRoomSearchBar.tsx` (new)
- `packages/web/src/chat/components/ChatBubble.tsx` (modified)
- `packages/web/src/chat/components/MessageActions.tsx` (deleted)
- `packages/web/src/chat/screens/ChatRoomScreen.tsx` (modified)
- `packages/web/src/chat/test/ChatRoomScreen.test.tsx` (modified)
- `CLAUDE.md` (modified)
- `docs/superpowers/plans/2026-04-26-internal-chat-pr6-ui-polish.md` (new — already committed in pre-flight)

If any other path appears (especially anything under `packages/web/src/game/**` or `packages/game-core/**`), `git restore` it before push.

- [ ] **Step F.3: Push branch**

```bash
git push -u origin feat/chat-pr6-ui-polish
```

- [ ] **Step F.4: Open PR (stack-PR over PR #33)**

```bash
gh pr create --base feat/chat-pr5-web-realtime --title "feat(chat): PR 6 — chat-room header redesign + long-press actions" \
  --body "$(cat <<'EOF'
## Summary

Two UX seams in the chat room get a polish pass — both surfaced from screenshots during the PR 5 session.

### Header redesign (Telegram-style)

- `ChatRoomHeader.tsx` — back arrow + 40px avatar (image or gradient-initial fallback, mirroring `ChatListItem`) + title + search-toggle icon button. The line-height is fixed at 18 px so a future subtitle (member count for group/system, last-seen for DM) drops in without changing header height.
- `ChatRoomSearchBar.tsx` — slide-down search input. `max-height` 0 → 48 + `opacity` 0 → 1 transition. Auto-focuses on open; clears value on close. `tabIndex` and `aria-hidden` are gated on `open` so a closed bar is invisible to screen readers and keyboard.
- `ChatRoomScreen.tsx` — replaces the inline header markup with the two new components. Adds `searchOpen` state. Title resolution (`chatTitle`) and avatar URL (`dmCounterpart?.avatarUrl ?? null`) are unchanged.

### Long-press action menu

- `useLongPress.ts` — pointer-event-based hook (`onPointerDown/Move/Up/Cancel/Leave`). Fires after 500 ms of stationary press; cancels on > 5 px movement or early release. 8 tests cover the matrix (delay, threshold, jitter, cancel paths, custom delay, single-fire-per-press).
- `MessageActionsMenu.tsx` — floating `.glass` panel rendered via portal so it escapes the message-list scroll context. Backdrop catches outside taps; Escape closes. Auto-positions above the anchored bubble (or below if too close to the top); horizontally clamps to viewport.
- `ChatBubble.tsx` refactored: drops the inline `MessageActions` icon row (file deleted), spreads `useLongPress` on the bubble wrapper, emits `onRequestActions(message, anchorRect)` to the parent.
- `ChatRoomScreen.tsx` — owns `actionTarget` state, renders `MessageActionsMenu` when long-press fires, wires its `Reply` and `Delete` to existing `setReplyTo` and `deleteMut`.

### Tests

- `useLongPress.test.tsx` — 8 cases (new).
- `ChatRoomScreen.test.tsx` — three existing tests updated to drive the new flow (open search via header toggle, long-press to expose Reply/Delete) + one new test for the search-toggle path. Unchanged tests (render order, mark-as-read, send happy path) keep their assertions.
- All prior web tests stay green.

### Out of scope

- **Subtitle** in header (member count / last-seen) — requires `users.last_seen_at` + `ChatDTO.memberCount` + `dmCounterpart.lastSeenAt`. Server PR tracked separately. Header reserves vertical space so adding a subtitle later is non-breaking.
- Reactions UI (PR 7), full-text cross-chat search (PR 8 in original roadmap, now bumped).
- No server changes in this PR.

### Stack note

This PR stacks on PR #33 (`feat/chat-pr5-web-realtime`). When that merges, GitHub auto-rebases this base to `main` (or to PR #32's eventual `main` arrival).

Plan: `docs/superpowers/plans/2026-04-26-internal-chat-pr6-ui-polish.md`.

## Test plan

- [x] `pnpm --filter @hockey/web test` — all green; ~95 total (86 PR-5 + 8 useLongPress + 1 net new search-toggle test).
- [x] `pnpm typecheck` clean.
- [ ] Manual: open a chat room, tap search icon → input slides down; type to filter; tap X → input slides up and clears. Long-press a foreign message → menu shows Reply only; long-press own message → menu shows Reply + Delete. Tap outside or Escape → menu dismisses without triggering a side-effect.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened against `feat/chat-pr5-web-realtime`. Return the URL.

---

## Self-review checklist (run before declaring done)

- **Spec coverage:**
  - Header layout (arrow + avatar + title + search-toggle) ✓ Task 3.
  - Slide-down search input on toggle ✓ Task 4.
  - Long-press surfaces Reply/Delete in floating menu ✓ Tasks 1 + 2 + 5.
  - Inline MessageActions removed ✓ Task 5 (file deleted).
  - Subtitle deferred and called out — header reserves vertical space ✓ Task 3 note.
- **Placeholder scan** — every step ships full code or a complete edit; no TBDs; expected outputs concrete; commit messages exact.
- **Type consistency:**
  - `useLongPress` returns `UseLongPressHandlers` and is consumed by spread in `ChatBubble.tsx` ✓.
  - `ChatBubbleProps` lost `onReply`/`onDelete`, gained `onRequestActions: (message, rect) => void` ✓ matched in `ChatRoomScreen.tsx`.
  - `MessageActionsMenu` props (`open, anchorRect, isOwn, onReply, onDelete, onClose`) match call site in `ChatRoomScreen.tsx` ✓.
  - `ChatRoomHeader` props (`title, avatarUrl, onBack, searchOpen, onToggleSearch`) match call site ✓.
  - `ChatRoomSearchBar` props (`open, value, placeholder, onChange`) match call site ✓.
- **Out of scope respected** — no reactions UI, no `SearchModal`, no server changes, no `packages/game-core/**` or `packages/web/src/game/**` touched.
- **No emoji** — UI strings (`Ответить`, `Удалить`, `Соединение пропало` from PR 5 untouched), comments, commit messages contain none. Lucide icons only.
- **Memory invariants honoured:** `CLAUDE.md` ≤ 200 (Task 8); deploys via GitHub Actions (no infra changes).
