# Duel Opponent Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show only eligible ordinary-duel opponents before selection and explain unavailable formats in both profile entry points.

**Architecture:** Reuse the server's pairwise challenge-availability calculation for the candidate endpoint and profile buttons. Keep the server's challenge POST authoritative. React Query refreshes availability when format or opponent changes; a shared UI helper supplies consistent Russian reasons and reward-style toast presentation.

**Tech Stack:** Fastify, PostgreSQL, React, TanStack Query, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-duel-opponent-availability-design.md`

## Global Constraints

- Only ordinary duels; tournament behavior is unchanged.
- Preserve existing uncommitted changes and do not deploy or mutate production.
- User-facing text is Russian; internal identifiers remain English.
- Integration tests must not use the local game database.
- Test RED before implementing each behavior; verify GREEN afterward.

## Review Focus

- A selected format changes while an opponent is selected: clear an invalid opponent or move to a valid format without permitting a stale challenge.
- Candidate filtering happens before the requested result limit, so ineligible recent users do not hide eligible users.
- Current user's global limit or two open duels makes every candidate unavailable, including search.
- Availability changes between screen load and POST: server rejects the invite and UI refreshes availability with readable copy.
- Profile availability loading/error cannot incorrectly show a ready-to-send challenge.

---

### Task 1: Pairwise server availability and candidate filtering

**Files:** `packages/server/src/duel/amateur/routes.ts`, `packages/server/src/duel/amateur/admission.ts`, `packages/server/test/duel/amateur.test.ts`, focused admission tests.

**Interfaces:** `/duel/amateur/opponents?q=&limit=&kinds=express,classic` returns `{ users: AmateurOpponent[] }`; each user retains `format_limits` and `format_locks`. `/duel/amateur/challenge/availability` returns `{ available: boolean, formats: ... }`.

- [ ] Add focused endpoint tests for per-format pair availability, chosen-format filtering, result-limit backfill and all-formats-blocked cases. Run and observe RED.
- [ ] Extract or reuse the pairwise capacity/lock/open-slot calculation and apply it to both endpoints without changing POST enforcement.
- [ ] Run focused server tests and typecheck; inspect query count and avoid per-candidate N+1 checks.

### Task 2: Candidate lists and selected format

**Files:** `packages/web/src/api/amateurDuel.ts`, `packages/web/src/screens/DailyScreen.tsx`, `packages/web/src/screens/DailyScreen.test.tsx`.

**Interfaces:** `searchAmateurOpponents(q, limit, kinds)` forwards selected kinds. UI uses only server-eligible users for quick choice and search.

- [ ] Add UI/API tests for filtering selected format and invalidating a selected opponent after format change. Run and observe RED.
- [ ] Key queries by selected format, forward `kinds`, clear invalid selection, and prevent stale sends while requests refresh.
- [ ] Run focused web tests and typecheck.

### Task 3: Profile entry points and reward-style toast

**Files:** `packages/web/src/chat/components/UserProfileSheet.tsx`, `packages/web/src/chat/screens/UserProfileScreen.tsx`, shared availability/toast helper under `packages/web/src/chat/components/`, and profile tests.

**Interfaces:** Both profiles query the existing challenge-availability endpoint. When no format is available, their challenge button remains pressable but visually blocked; pressing it shows a `role=status` notification styled with `achievement-reward-toast` and a concrete reason.

- [ ] Add tests for both profile variants: self/opponent limit, open-duel/outgoing block, loading/error, and toast on blocked press. Run and observe RED.
- [ ] Implement shared reason/blocked-action behavior, reuse reward-toast styling, and retain keyboard access.
- [ ] Run profile tests and typecheck.

### Task 4: Format modal and final verification

**Files:** `packages/web/src/chat/components/DuelChallengeModal.tsx`, `packages/web/src/chat/components/DuelChallengeModal.test.tsx`, relevant CSS and server/web tests.

**Interfaces:** First available format auto-selects after availability loads. Blocked formats show visible reason and cannot be selected. A 409 refreshes availability and shows readable feedback.

- [ ] Add tests for initial auto-selection, all-blocked, and availability changes after a 409. Run and observe RED.
- [ ] Implement selection reconciliation and readable blocked states.
- [ ] Run focused suites, `pnpm typecheck`, relevant lint/build checks; browser-check quick choice, search, both profiles, modal and toast at narrow width.
- [ ] Review diff against the spec, preserve unrelated edits, and report local verification separately from browser or deployed acceptance.
