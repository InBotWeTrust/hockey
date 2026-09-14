# Compact Duel Inventory Report Design

**Date:** 2026-09-14  
**Status:** Approved in conversation; awaiting final document review  
**Scope:** Amateur duel shot persistence and response performance. Inventory penalty mechanics are explicitly out of scope.

## Problem

An amateur duel currently appends a new element to `amateur_duel_participant.inventory_report` after almost every shot. The server then rewrites the complete JSON value and returns a full `AmateurDuelMatchState` from `POST /duel/amateur/matches/:matchId/shot`.

The report therefore grows with every shot. Production evidence from completed duels showed average shot response times of roughly 0.5–0.9 seconds, individual responses of 2–3.6 seconds, and response latency increasing during long games. The web client prevents another shot while the current submission is unresolved, so this server delay appears as an intermittently stuck shot button even when the player has ample inventory.

The detailed per-shot inventory history has no product consumer. The game and HUD need only exact cumulative consumption and the current remainder for each item in each period.

## Goals

- Keep inventory-report storage and shot-response size bounded regardless of shot count.
- Preserve exact inventory balances and existing rounding rules.
- Preserve the current deterministic shot result and inventory-condition calculations.
- Keep shot persistence, inventory consumption, score updates, and achievements atomic.
- Preserve request reconciliation after a timeout or lost response.
- Support active matches created with the legacy detailed report.
- Apply the same behavior to ordinary amateur duels and tournament/playoff duels that use the amateur duel engine.

## Non-goals

- Changing fatigue, stumble, or other no-inventory penalties.
- Changing when the shot button is blocked for gameplay reasons.
- Changing inventory prices, capacity, reservation rules, or loadout selection.
- Providing an admin audit of consumption for each individual shot.
- Rewriting historical settled matches solely to compact their reports.

## Compact report model

`inventory_report` remains a JSONB array on `amateur_duel_participant`. Its canonical representation uses the existing `InventoryPeriodReport[]` shape, but contains one cumulative report per period instead of one report per shot. Keeping the existing shape makes the stored value readable by the previous server binary during rollback.

Conceptual shape:

```ts
type CompactInventoryReport = Array<{
  periodNumber: number;
  consumed: Array<{
    id: string;
    itemId: string;
    instanceId?: string;
    kind: 'stick' | 'skates' | 'nutrition';
    title: string;
    charges: number;
    remainingReserved: number;
  }>;
}>;
```

There is at most one period object for each `periodNumber` and at most one consumed item for each item id inside it. A normal three-period duel therefore contains no more than three period objects and nine item summaries. Each accepted shot updates the existing current-period entries instead of appending new history.

`charges` is the cumulative amount charged during that period. `remainingReserved` is the resource still available to the match after the latest confirmed update. Distance consumption retains the existing decimal precision; integer-backed inventory deductions retain the existing floor/ceil rules.

## Legacy compatibility

The server reader accepts both representations of the same array shape:

- legacy arrays containing many reports for the same period;
- canonical compact arrays containing one cumulative report per period.

Legacy entries are folded by `(periodNumber, item id)` in memory. `charges` is summed, while the final valid `remainingReserved` value is retained. This conversion must not debit inventory, change scores, or emit economy events.

An active legacy match is written back in compact form the next time its report is legitimately updated. Settled historical matches are not bulk-rewritten. DTO builders normalize either representation to the compact public summary, so the web client has one format to consume.

No schema migration or format marker is required because the compact value conforms to the existing JSON shape. Deployment may compact open matches lazily on their next legitimate report update. If an eager data migration is later found necessary for operational reasons, it must be separately reviewed, idempotent, limited to open matches, and must not touch balances, results, ratings, or settled-match reports.

## Shot transaction

The existing transaction boundary remains authoritative. One transaction performs:

1. Lock and reconcile the visible match.
2. Validate participant state, period, shot index, tap freshness, and gameplay condition.
3. Resolve the deterministic shot result.
4. Insert the `shot_session` row.
5. Update lifetime statistics and achievement observations.
6. Deduct inventory with the existing integer and fractional rounding behavior.
7. Replace or insert cumulative consumption and remainder in the compact current-period summary.
8. Update participant score and period state.
9. Reconcile period or match completion.

Any failure rolls back the shot, score, inventory deduction, and compact summary together. Existing uniqueness and shot-index validation remain the idempotency boundary: a retry cannot create a second accepted shot or a second inventory deduction.

## Compact shot response

`POST /duel/amateur/matches/:matchId/shot` stops building and returning the complete match DTO on its successful hot path. It returns only the fields required to confirm and render the accepted shot:

```ts
interface SubmitAmateurDuelShotResponse {
  match_id: string;
  server_result: 'goal' | 'save' | 'miss';
  confirmed_shot_index: number;
  participant: {
    state: AmateurDuelParticipantState;
    current_period: number;
    current_period_shots: number;
    current_period_goals: number;
    shots_taken: number;
    goals: number;
  };
  current_period_inventory: AmateurDuelInventoryPeriodReport;
  settled: boolean;
}
```

The response must not include the full match, opponent history, all period reports, or all available inventory.

When a shot closes a period or settles a match, the acknowledgement contains the resulting participant state and `settled` flag. The client may then fetch the full match once to render break or result UI. Tournament fixture progress publication and settlement notifications remain server-side post-transaction effects and do not require a full DTO in the shot response.

## Web client behavior

The client keeps the existing optimistic shot animation and score increment. On a successful acknowledgement it:

- replaces the claimed result with the server result when necessary;
- confirms the shot index and score totals;
- updates the current-period compact inventory summary;
- clears the pending-shot guard;
- fetches full match state only after a period/match transition or when other state is required.

If the request times out, aborts, or returns an uncertain error, the existing reconciliation flow fetches the full match. If the server already accepted the shot, the fetched shot count confirms it. Otherwise the optimistic score is rolled back. Definitive validation errors keep their current rollback behavior.

The client still serializes submissions: it does not submit a second shot while the first shot is unresolved. This design reduces that interval rather than weakening idempotency or allowing concurrent shot submissions.

## Performance constraints

- Stored compact report cardinality is bounded by `periods × equipped items`, not shot count.
- The successful `/shot` response size is bounded and does not grow across a period.
- A 90-shot classic duel must not exhibit response-size growth between its first and last shot.
- The server must avoid constructing the full match DTO on the normal successful shot path.
- Performance tests should compare early and late shot processing with a generous CI-safe threshold. Correctness and bounded payload size are hard assertions; wall-clock latency is recorded and guarded against gross regression rather than treated as a brittle microbenchmark.

## Verification

Automated coverage must include:

- folding multiple legacy entries into one exact period/item summary;
- repeated compact updates without increasing summary cardinality;
- a complete 90-shot classic duel with stick, skates, and nutrition;
- an express duel and tournament/playoff duel through the shared engine;
- depleted stick, skates, and nutrition without changing penalty behavior;
- fractional skate consumption and nutrition rounding;
- quota close, timer close, window close, and match settlement;
- a request whose response is lost, followed by successful reconciliation;
- duplicate/concurrent submission protection with one shot and one inventory debit;
- equality between inventory balance deltas and compact report totals;
- constant successful shot-response schema and bounded encoded size;
- legacy active-match conversion without an additional debit;
- settled legacy history remaining readable.

Production verification after a dev soak must inspect early-versus-late shot latency, HTTP status distribution, response size, participant balance deltas, and the compact report for at least one full classic duel.

## Rollout

1. Implement the legacy-detail/compact-array server reader and compact writer.
2. Add the compact shot acknowledgement and update the web store atomically in the same release.
3. Deploy to dev and play a full classic duel plus an inventory-depletion scenario.
4. Verify balances, report cardinality, response sizes, reconciliation, and early/late latency.
5. Deploy the exact verified commit to production.
6. Monitor the first real long duels and compare latency with the recorded production baseline.

Rollback is application-level: the previous release can read the compact array because it uses the existing `InventoryPeriodReport[]` shape. After rollback, accepted shots may again append detail entries, so payload growth returns, but consumption calculations and balances remain valid. No reverse data migration is required.

## Acceptance criteria

- A full duel produces no per-shot growth in stored report cardinality or successful response size.
- Final balances and report totals exactly match the accepted shots and elapsed movement/energy consumption.
- No accepted shot can be charged twice after retry or reconciliation.
- The normal successful shot path does not build or return `AmateurDuelMatchState`.
- Active legacy matches continue without score or inventory changes caused by conversion.
- Historical settled matches remain readable.
- Inventory penalty mechanics behave exactly as before this change.
