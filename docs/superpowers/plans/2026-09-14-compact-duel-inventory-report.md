# Compact Duel Inventory Report Implementation Plan

> **Execution note:** Follow this plan with `superpowers:executing-plans` or `superpowers:subagent-driven-development`. Keep each task red-green-refactor and do not change depleted-inventory penalties.

**Goal:** Make amateur-duel shot persistence and responses bounded by periods and equipped items, while preserving exact inventory accounting, deterministic gameplay, reconciliation, and tournament behavior.

**Architecture:** Retain the existing `inventory_report` JSONB array and `InventoryPeriodReport[]` public shape, but normalize it into one cumulative entry per period and item before every read or write. Replace the successful shot endpoint's full match DTO with a compact acknowledgement, then merge that acknowledgement into the existing client state and fetch the full match only on a period or match transition.

**Tech stack:** TypeScript, Fastify, PostgreSQL JSONB, React, Zustand, Vitest, Testing Library.

---

## Task 1: Specify and test canonical report folding

**Files:**

- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/server/test/duel/amateur.test.ts`

- [ ] Add focused failing tests around the amateur-duel inventory fixtures that seed a legacy `inventory_report` containing multiple entries for the same period and item. Assert that the DTO contains one period entry, one item entry, summed `charges`, and the last valid `remainingReserved`.
- [ ] Add a failing case covering multiple periods, multiple item IDs, nullable `instanceId`, and malformed report input. Preserve period order and first-seen item order so existing UI snapshots remain stable.
- [ ] Replace the parse-only behavior of `inventoryReportFromUnknown()` with canonical folding by `(periodNumber, item.id)`: sum `charges`, copy the latest parsed `remainingReserved`, and retain the latest item's identifying metadata (`itemId`, `instanceId`, `kind`, `title`). Return `[]` for an invalid outer value, matching current defensive behavior.
- [ ] Ensure all DTO construction continues to call the normalizer so both active and settled legacy matches remain readable without rewriting them.
- [ ] Run the focused server tests and confirm the new assertions turn green:

  ```bash
  pnpm --filter @hockey/game-core build
  pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts -t "inventory report"
  ```

- [ ] Commit:

  ```bash
  git add packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts
  git commit -m "test(server): normalize duel inventory reports"
  ```

## Task 2: Make every inventory write cumulative and bounded

**Files:**

- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/server/test/duel/amateur.test.ts`

- [ ] Add failing tests that exercise repeated `consumeInventoryForShot()` updates in one period and verify report cardinality remains one period entry with no more than one entry for each equipped item.
- [ ] Add failing assertions for exact cumulative stick, skate, and nutrition charges, including fractional distance accumulation and the existing integer debit rounding. Compare user inventory balance deltas with compact report totals.
- [ ] Add a failing test for an active match seeded with a detailed legacy report: the next accepted shot must write the canonical compact array, add only the new shot's debit, and leave prior score and balances unchanged.
- [ ] Introduce a small pure upsert helper in `routes.ts` that accepts a normalized report, period number, and item deltas/latest remainder and returns a canonical report. Use it from both `consumeInventoryForShot()` and `consumeInventoryForPeriod()` instead of appending a new period object.
- [ ] Preserve current resource rules exactly: shot items increment only when `consumeShot !== false`; distance and energy use their existing cumulative targets; `roundInventoryCharge`, `Math.floor`, reservation updates, legacy aggregate synchronization, and economy events remain unchanged.
- [ ] Make the inventory consumer return the updated current-period report (or an empty period summary when no item was charged) so the shot endpoint can acknowledge the authoritative compact state without rereading a full match DTO.
- [ ] Add quota-close and timer/window-close cases to ensure the final movement/energy update merges into the existing period summary rather than adding another entry.
- [ ] Run focused tests:

  ```bash
  pnpm --filter @hockey/game-core build
  pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts -t "inventory"
  ```

- [ ] Commit:

  ```bash
  git add packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts
  git commit -m "perf(server): compact duel inventory consumption"
  ```

## Task 3: Replace the hot-path shot response with a compact acknowledgement

**Files:**

- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/server/test/duel/amateur.test.ts`
- Modify: `packages/server/test/tournament/realtime-progress.integration.test.ts`
- Modify: `packages/server/test/tournament/fixtureAttempts.integration.test.ts`

- [ ] Add failing endpoint assertions for the exact successful response contract:

  ```ts
  interface SubmitAmateurDuelShotResponse {
    match_id: string;
    server_result: 'goal' | 'save' | 'miss';
    confirmed_shot_index: number;
    participant: {
      state: ParticipantState;
      current_period: number;
      current_period_shots: number;
      current_period_goals: number;
      shots_taken: number;
      goals: number;
    };
    current_period_inventory: InventoryPeriodReport;
    settled: boolean;
  }
  ```

  Assert that `match`, opponent state, full inventory availability, and reports from other periods are absent.

- [ ] Refactor the shot transaction to retain the existing lock, validation, `shot_session` insert, stat/achievement updates, inventory debit, score update, and reconciliation order, but return the compact participant snapshot and current-period report instead of calling `buildMatchStateDto()`.
- [ ] Derive `confirmed_shot_index` from the authoritative accepted participant count, not directly from untrusted request input. Populate participant fields from the post-update/reconciled database state.
- [ ] Keep `publishDuelFixtureProgress`, newly settled regular-fixture reconciliation, and settlement notification after the transaction exactly as today.
- [ ] Add a failing 90-shot classic-duel test with stick, skates, and nutrition. Record encoded response sizes for shot 1 and shot 90 and hard-assert a small fixed upper bound plus no material growth caused by history. Assert stored cardinality is at most three periods and nine item entries.
- [ ] Extend shared-engine integration coverage so an ordinary duel, an express duel, and a tournament/playoff duel all receive the same compact response and still publish/settle their fixture correctly.
- [ ] Add or retain duplicate/concurrent submission coverage asserting one `shot_session`, one score increment, and one inventory debit. Add a lost-response scenario by accepting a shot, discarding its response, then confirming it through `GET /matches/:id` without resubmission debit.
- [ ] Run focused server and tournament tests:

  ```bash
  pnpm --filter @hockey/game-core build
  pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts
  pnpm --filter @hockey/server exec vitest run test/tournament/realtime-progress.integration.test.ts test/tournament/fixtureAttempts.integration.test.ts
  ```

- [ ] Commit:

  ```bash
  git add packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts packages/server/test/tournament/realtime-progress.integration.test.ts packages/server/test/tournament/fixtureAttempts.integration.test.ts
  git commit -m "perf(server): return compact duel shot acknowledgements"
  ```

## Task 4: Update the web API and store contract

**Files:**

- Modify: `packages/web/src/api/amateurDuel.ts`
- Modify: `packages/web/src/stores/amateurDuelStore.ts`
- Modify: `packages/web/src/stores/gameSessionStores.test.ts`
- Modify: `packages/web/src/stores/amateurDuelStore.lock.test.ts`

- [ ] Replace the web `SubmitAmateurDuelShotResponse` type with the server acknowledgement fields. Reuse `AmateurDuelParticipantState` and `AmateurDuelInventoryPeriodReport`; do not duplicate string unions.
- [ ] Add failing store tests for a normal in-period acknowledgement. Assert the optimistic match is patched with the authoritative result, participant state, period and total scores, confirmed shot count, and exactly one upserted current-period inventory report without replacing opponent data.
- [ ] Add failing tests for a server-result mismatch, ensuring the store corrects optimistic goals and returns the authoritative `serverResult` to `PlayView`.
- [ ] Add failing transition tests where `participant.state !== 'period_active'` or `settled === true`; assert the store performs one `fetchAmateurMatch()` and uses that full state for break/result UI.
- [ ] Preserve `withGameRequestReconciliation()`: uncertain errors still fetch the full match, accept it when shot count/state confirms the shot, otherwise roll back the optimistic counters. Definitive validation errors keep the current rollback path.
- [ ] Implement a pure match-patch helper inside `amateurDuelStore.ts` that updates `match.me`, duplicated top-level current-period counters, and the matching period's compact inventory summary. Ensure `isCurrent()` still protects against applying a response after navigation/match replacement.
- [ ] Keep the store's return contract consumed by `PlayView` (`serverResult`, `state`, `isCurrent`) unchanged; only its source state changes from full response DTO to locally patched or transition-refetched state.
- [ ] Run focused web tests:

  ```bash
  pnpm --filter @hockey/web test -- src/stores/gameSessionStores.test.ts src/stores/amateurDuelStore.lock.test.ts
  pnpm --filter @hockey/web typecheck
  ```

- [ ] Commit:

  ```bash
  git add packages/web/src/api/amateurDuel.ts packages/web/src/stores/amateurDuelStore.ts packages/web/src/stores/gameSessionStores.test.ts packages/web/src/stores/amateurDuelStore.lock.test.ts
  git commit -m "perf(web): apply compact duel shot acknowledgements"
  ```

## Task 5: Verify HUD consumers and gameplay transitions

**Files:**

- Modify: `packages/web/src/screens/DailyScreen.test.tsx`
- Modify only if a test exposes a contract gap: `packages/web/src/screens/DailyScreen.tsx`
- Modify only if a test exposes a contract gap: `packages/web/src/game/PlayView.tsx`
- Modify only if a test exposes a contract gap: `packages/web/src/game/PlayView.test.tsx`

- [ ] Add a DailyScreen regression test that feeds cumulative current-period stick, skate, and nutrition data after several acknowledgements and asserts the three existing duel-condition/HUD consumers show the same availability and penalty timing as before.
- [ ] Add gameplay tests for an ordinary duel and a tournament/playoff duel showing that an accepted in-period shot clears the pending-shot guard immediately from the compact acknowledgement and does not issue a full-match GET.
- [ ] Add period-close and match-settlement tests showing exactly one GET occurs after the acknowledgement and that break/result UI is rendered from the reconciled full state.
- [ ] Add a response-lost test at the UI/store boundary: simulate an uncertain request error followed by a GET whose accepted shot count confirms the shot; assert no duplicate visible shot, no stuck button, and no optimistic rollback.
- [ ] Explicitly retain existing no-inventory behavior tests. If current tests do not cover both depleted skates and depleted nutrition, add assertions that the 450–650 ms stumble and 3-second rest rules are unchanged; do not alter their implementation.
- [ ] Run focused UI tests:

  ```bash
  pnpm --filter @hockey/web test -- src/screens/DailyScreen.test.tsx src/game/PlayView.test.tsx src/stores/gameSessionStores.test.ts
  pnpm --filter @hockey/web typecheck
  ```

- [ ] Commit only if this task changes tests or implementation:

  ```bash
  git add packages/web/src/screens/DailyScreen.test.tsx packages/web/src/screens/DailyScreen.tsx packages/web/src/game/PlayView.test.tsx packages/web/src/game/PlayView.tsx
  git commit -m "test(web): cover compact duel shot flow"
  ```

## Task 6: Full regression, performance evidence, and release handoff

**Files:**

- Modify if needed: `docs/superpowers/plans/2026-09-14-compact-duel-inventory-report.md`
- Do not add generated `output/`, coverage, build, or timing artifacts to Git.

- [ ] Run formatting on touched source and test files, then inspect `git diff --check`:

  ```bash
  pnpm exec prettier --write packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts packages/server/test/tournament/realtime-progress.integration.test.ts packages/server/test/tournament/fixtureAttempts.integration.test.ts packages/web/src/api/amateurDuel.ts packages/web/src/stores/amateurDuelStore.ts packages/web/src/stores/gameSessionStores.test.ts packages/web/src/stores/amateurDuelStore.lock.test.ts packages/web/src/screens/DailyScreen.test.tsx packages/web/src/screens/DailyScreen.tsx packages/web/src/game/PlayView.test.tsx packages/web/src/game/PlayView.tsx
  git diff --check
  ```

- [ ] Run the complete repository verification in the required order:

  ```bash
  pnpm typecheck
  pnpm lint
  pnpm --filter @hockey/game-core build
  pnpm build
  pnpm test
  ```

- [ ] Review the final diff against every design acceptance criterion. Specifically confirm: no schema migration; no bulk rewrite of settled history; no changed inventory penalties; no `buildMatchStateDto()` on successful `/shot`; one summary per period/item; exact debit/report equality; compact response for ordinary, express, tournament, and playoff duels; reconciliation still serializes submissions.
- [ ] Capture the test-observed first/last response byte sizes and 90-shot elapsed timings in the handoff. Treat byte bounds and correctness as PASS/FAIL; describe timings as local evidence, not production acceptance.
- [ ] Inspect `git status --short`, ensure only intended files are tracked, and commit any final verification-driven fixes separately.
- [ ] Use `superpowers:requesting-code-review` for an independent non-GLM review. Apply only verified findings, rerun affected tests, and commit corrections separately.
- [ ] Use `superpowers:verification-before-completion` before claiming completion and record the exact branch and final SHA.
- [ ] Do not deploy from this planning/execution task unless the user separately authorizes deployment. The release handoff must require: dev deployment of the exact SHA, a full classic duel plus depleted-inventory scenario, early/late latency and response-size inspection, balance/report reconciliation, then exact-SHA production promotion and monitoring.

## Acceptance checklist

- [ ] A 90-shot classic duel stores at most three period reports and one item entry per equipped item in each period.
- [ ] The successful shot response contains only the approved acknowledgement and stays within a fixed encoded-size bound from the first through last shot.
- [ ] Inventory balance deltas equal compact report totals under fractional skate and nutrition rounding.
- [ ] Retries, concurrent requests, and lost responses cannot create a second shot or debit.
- [ ] Active detailed reports compact lazily on the next legitimate update; settled detailed reports stay readable and are not rewritten.
- [ ] Ordinary, express, tournament, and playoff duels share the optimized path.
- [ ] Period close, timer/window close, match settlement, fixture publication, and notifications still work.
- [ ] Depleted-inventory stumble/rest mechanics and all other gameplay behavior remain unchanged.
