# Admin Attention And Broadcasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an empty chat readable, surface unread admin feedback and official messages everywhere they matter, and let an admin send one personal message to every eligible player from the official account.

**Architecture:** Add a lightweight `/admin/attention` summary consumed by the bottom navigation and admin screen. Keep feedback and official-dialog read state as the existing sources of truth. Add an audited, idempotent broadcast endpoint backed by per-broadcast recipient rows, then expose it as a dedicated communications tab.

**Tech Stack:** Fastify, PostgreSQL raw migrations, React 18, TanStack Query, Vitest, Testing Library.

**Spec:** User-approved requirements in the current task.

## Global Constraints

- UI copy is Russian; code and database identifiers are English.
- Broadcast recipients are unblocked ordinary players only: `role = 'player'`, `account_kind = 'player'`, excluding the official account.
- Existing modal, icon-button, and text-button design invariants remain intact.
- No production deployment; local verification first.

---

### Task 1: Readable empty chat state

**Files:**
- Modify: `packages/web/src/chat/screens/ChatRoomScreen.tsx`
- Modify: `packages/web/src/app/design-system.css`
- Test: `packages/web/src/chat/test/ChatRoomScreen.test.tsx`

**Interfaces:**
- Produces: `.chat-room__empty-state`, a readable status element over every arena background.

- [ ] Write a failing rendered test asserting the empty copy uses the dedicated status surface.
- [ ] Run the focused chat-room test and confirm failure because the class is absent.
- [ ] Replace the inline muted empty-state styling with the dedicated class and accessible status role.
- [ ] Run the focused test and confirm it passes.

### Task 2: Global admin attention summary and indicators

**Files:**
- Modify: `packages/server/src/admin/routes.ts`
- Test: `packages/server/test/admin/communications.integration.test.ts`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/components/BottomNav.tsx`
- Test: `packages/web/src/components/BottomNav.test.tsx`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Test: `packages/web/src/admin/AdminScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Produces: `GET /admin/attention -> { feedbackUnreadCount, officialDialogsUnreadCount, totalCount }`.
- Produces: `fetchAdminAttention()` and query key `['admin', 'attention']`.

- [ ] Write a failing server integration test for the combined unread counts and admin-only access.
- [ ] Run it and confirm the endpoint is missing.
- [ ] Implement the summary query from existing feedback and official-dialog read state.
- [ ] Write failing web tests for the bottom-nav badge, drawer dots, and communications-dialog dot.
- [ ] Run them and confirm the indicators are absent.
- [ ] Add the shared polling query, accessible dots, and invalidation after feedback/dialog reads.
- [ ] Run all focused server and web tests.

### Task 3: Idempotent personal broadcast from the official profile

**Files:**
- Create: `packages/server/db/migrations/117_admin_direct_broadcasts.sql`
- Modify: `packages/server/src/admin/routes.ts`
- Test: `packages/server/test/admin/communications.integration.test.ts`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Test: `packages/web/src/admin/AdminScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Produces: `GET /admin/communications/broadcast-audience -> { recipientCount }`.
- Produces: `POST /admin/communications/broadcasts` with `{ requestId, content }` and result counts.

- [ ] Write failing migration and route tests covering recipient eligibility, delivery, audit rows, and repeated `requestId` without duplicate messages.
- [ ] Run focused server tests and confirm failure.
- [ ] Add forward-only broadcast tables and implement audience and dispatch routes using existing DM/message/realtime/push services.
- [ ] Write a failing admin UI test for recipient preview, confirmation, send result, and double-submit protection.
- [ ] Run it and confirm the tab and controls are absent.
- [ ] Add the «Рассылка» communications tab and standard confirmation modal.
- [ ] Run focused web tests.

### Task 4: Verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: all behavior from Tasks 1–3.

- [ ] Build `@hockey/game-core` before server tests.
- [ ] Run focused server and web suites, then full typecheck, lint, tests, and builds.
- [ ] Review the final diff for unrelated changes and verify the rendered flow locally.
