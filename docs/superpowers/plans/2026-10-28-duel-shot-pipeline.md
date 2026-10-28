# Duel shot pipeline recovery

## Confirmed mechanisms

- All ordinary duel requests acquire the same exclusive monthly-rating lifecycle advisory lock, before player and match locks. Heavy Rhythm work can therefore stall unrelated matches. Month closure needs exclusion; concurrent matches do not.
- PlayView keeps the shot button disabled until its submission promise resolves, even after flight and result presentation finish. A delayed acknowledgement creates a visible pause.
- Pending optimistic shots must survive polling and older acknowledgements. Responses must not change another shot's presentation, another period, or another match.

## Implementation and checks

1. RED: prove two gameplay transactions can share the rating gate, while month closure excludes them. Use a distinct shared participation gate and keep exclusive month closure; preserve player/match lock ordering. Run duel settlement/monthly/fight concurrency regressions.
2. RED: bounded (two outstanding shots) duel pipeline. Show the next locally simulated shot after presentation, send submissions in order, preserve optimistic counters/history, and keep acknowledgement ownership. Failures reconcile before later shots; cancel invalid queued work on period/match changes. Keep a clear bounded synchronization state on prolonged failure, without offline gameplay or unbounded queues.
3. GREEN: delayed/error/out-of-order response tests, all duel formats, tournament lifecycle, clocks, duplicate rewards and route-exit cleanup. Run relevant server/web suites, typecheck, lint and builds. Browser-check a local simulated delayed connection. Report local validation separately from deployment and physical-device acceptance.

No authentication/account changes, deterministic scoring changes, or production mutations are part of this fix.

## Local verification (2026-10-28)

- Observed RED for shared rating participation, second-shot availability, all-format opt-in, local Marathon pause ownership, and waiting for queued shots before period expiry. Corresponding cases pass with the fixes.
- Entire server duel regression: 546 passed, 9 configured skips. Final gate-specific run: 2 passed, including exclusive month closure.
- Entire web test command: 3703 passed across 412 files. Queue/store/component cases cover delayed acknowledgements, rejection, cancellation, all six formats, result ownership and scored clocks.
- Workspace lint passed. Server/core/mobile typechecks and builds passed; final web typecheck and build passed after correcting an empty-array generic inference in a new test.
- No new deployed-runtime or physical two-device acceptance is claimed. Local rendered browser acceptance remains outstanding.
- Account investigation remains read-only and separate. Supplied VK page matches the old identity fingerprint in the diagnostic snapshot; fresh SSH verification was unavailable on this turn.
