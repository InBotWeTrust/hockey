# Task 4 implementation report

## Lifecycle trace

The standard amateur-duel route `POST /duel/amateur/matches/:matchId/ready`
previously built a profile/default loadout, moved each participant to `ready`,
then `activateReadyMatch` reserved the whole loadout and stored its combined
effects while activating the match. `POST .../period/start` consumes
period-resource items through `consumeInventoryForPeriod`; `POST .../shot`
uses `consumeInventoryForShot` for shot, distance, and energy resources.

Tournament playoff attempts reuse the same `amateur_duel_match` with
`source = 'tournament'`, so the old `/ready` path coupled attendance,
profile-derived equipment, reservation, and attempt activation. That was the
divergence: closing the UI explanation could be treated as the only path to
that coupled operation, and there was no series-local confirmation boundary.

## Implemented boundary

- Tournament `/ready` records readiness only and preserves Task 2's attempt
  mirror/activation and Task 3 notification path.
- `POST .../tournament-loadout` is idempotent and only available to an active
  tournament participant before a period. It uses the existing amateur loadout
  builder/reservation/consumption services, never writes `user_equipment`.
- A first game falls back to profile selection; later games search the latest
  confirmed snapshot in the same playoff series. A carried item that can no
  longer reserve is omitted instead of retaining an effect.
- Tournament period start requires confirmation and accepts no inline loadout;
  this prevents a retry from reserving or consuming twice.

The browser keeps one visible progression: `Готов -> selected loadout -> Начать
-> Бросок`. For a tournament, one `Начать` click confirms the boundary loadout
and then starts the period. Store-level in-flight guards make a double tap issue
at most one confirmation and one start. Reload uses the server loadout version;
an unconfirmed next-period/next-game preview is also authoritative and cannot be
overwritten by profile inventory defaults.

## RED/GREEN evidence

- Readiness split RED: `keeps tournament readiness separate from local loadout
  confirmation` expected `200` and received `404` for the missing endpoint.
  GREEN after adding `POST .../tournament-loadout`.
- Period boundary RED: `versions tournament loadout at each period boundary
  without releasing consumed charges` expected the A stick/skates/nutrition
  defaults but received only the A stick, because the old path reserved the
  entire match. GREEN after reserving one boundary at a time.
- Web flow RED: the first version expected no start call after clicking
  `Начать`, but the clarified contract is one visible action that confirms and
  starts. The corrected test then proved double taps produce exactly one
  readiness, one confirmation, and one start request.
- Inter-game carryover RED: the next series game returned an empty loadout.
  GREEN after the DTO preview began resolving the latest confirmed selection in
  the same series and dropping unavailable items.
- Dynamic resource mutation RED: after temporarily weakening the existing
  `shot_index` guard from `!==` to `>`, the retry returned `200` instead of the
  required `409`. The guard was restored and the test returned GREEN. This is a
  mutation proof of the shared idempotency guard; no permanent production
  change was needed for dynamic consumption.
- Web preview RED: an accepted, unconfirmed series carryover was overwritten by
  profile inventory and did not show `Турнирная клюшка`. GREEN after accepted
  tournament state began using the server loadout for both confirmed and
  preview boundaries.

## Inventory accounting proof

`debits dynamic tournament resources once when the same shot is retried` uses
real resource units and a 2000 ms shot:

- stick `shot`: `3 = 2 available + 0 reserved + 1 consumed`;
- skates `distance`: `10 = 8 available + 0 reserved + 2 consumed`;
- nutrition `energy_ms`: `10000 = 8000 available + 0 reserved + 2000 consumed`.

The retry returns `409`, keeps one `shot_session`, leaves the three inventory
rows unchanged, and preserves both `inventory_report` and
`consumed_inventory_charges = 2003`.

The boundary test separately proves period-reserved accounting across two
complete A/B loadouts: `9 initial = 4 available + 2 reserved + 3 consumed`.
Repeated confirmation keeps version `5`; terminal cleanup returns only the two
pending B period reservations and leaves the three-item consumed report
unchanged.

## Acceptance matrix (a-g)

- **a — standard/tournament trace:** PASS. Standard readiness builds the
  profile/default snapshot and `activateReadyMatch` reserves all period costs;
  period start calls `consumeInventoryForPeriod`, shot calls
  `consumeInventoryForShot`, and terminal settlement calls the general release
  helper. Tournament readiness stores attendance only; boundary confirmation
  calls the same builder with `reservationPeriods: 1`, applies per-item/per-
  instance deltas, and terminal cleanup releases only the pending boundary.
- **b — information modal:** PASS. `Понятно` is the only close action; checking
  `Не показывать снова` does not call readiness.
- **c — visible states/reload/double taps:** PASS. The tested sequence is
  `Готов -> loadout -> Начать -> Бросок`; confirmed and unconfirmed series-local
  selections survive reload, and double taps do not duplicate writes.
- **d — defaults and carryover:** PASS. The first game uses profile equipment;
  later periods and games inherit the last tournament-local selection, exhausted
  items disappear, and `user_equipment` is unchanged.
- **e — deterministic effects and debit once:** PASS. The stored server shot is
  reproduced directly through `resolvePerspectiveCourtShot`; stick, distance
  skates, and energy nutrition debit once with the conservation checks above.
- **f — separated implementation:** PASS. Readiness, confirmation, and period
  start are separate idempotent server actions backed by migration `092`; the
  UI intentionally composes confirmation + start behind one `Начать` action.
- **g — focused verification:** PASS with the commands below.

## Prerequisite regression corrections

The full tournament file exposed one committed Task 3 test setup mismatch: the
direct T-30 reconciler omitted `systemUserId` while expecting paired delivery.
Production intentionally no-ops without a system sender, so the test now passes
the existing `OFFICIAL_ID`; no Task 1-3 production code changed. The migration
ledger expectations were also stale for already committed `090`/`091`; they now
include those files and new `092`.

## Fresh verification

- `pnpm --filter @hockey/game-core build` — PASS.
- `pnpm --filter @hockey/server exec vitest run test/tournament/fixtureAttempts.integration.test.ts --poolOptions.forks.singleFork` — PASS, 42/42, final run clean with no warning.
- focused ordinary inventory regressions in `test/duel/amateur.test.ts` — PASS, 4/4.
- `pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts --poolOptions.forks.singleFork` — PASS, 6/6.
- `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx` — PASS, 108/108.
- `pnpm --filter @hockey/server typecheck` — PASS.
- `pnpm --filter @hockey/web typecheck` — PASS.
- `git diff --check` — PASS.

No GLM review, push, deployment, production action, or manual dev acceptance was
performed. A previous broad web run outside the final focused gate had the two
known unrelated failures in `TournamentOperations.test.tsx` and
`glassMaterial.test.ts` (918/920 passed); Task 4 does not alter those files.

## Review fix round 1/5 — legacy lifecycle compatibility

Migration `092` added boundary state but did not identify which already-open
tournament matches had reserved inventory through the previous full-match
lifecycle. Applying the new confirmation gate to every tournament would block
those legacy attempts, could reserve charges on top of their existing reserve,
and could leave the old reserve frozen at settlement or cancellation.

Newly created tournament matches now carry the explicit rules-snapshot marker
`tournamentLoadoutLifecycleVersion: 1`. Existing matches have no marker and are
left untouched: there is no backfill and no mutation of active attempts.
Marked matches use period-boundary confirmation/reservation; unmarked legacy
matches retain their original ready/start/terminal inventory lifecycle.

The legacy integration fixture models a two-period pre-`092` reserve. After the
first period starts, its accounting is `3 initial = 1 available + 1 reserved +
1 consumed`. Terminal cancellation releases the one remaining charge and
closes the participant ledger as `3 initial = 2 available + 0 reserved + 1
actually consumed`, with `reserved_inventory_charges =
consumed_inventory_charges = 2` under the legacy full-match ledger convention.
The original loadout and effects snapshots remain unchanged, and the new
confirmation endpoint returns `409` for that unmarked match.

Readiness retry is idempotent for active tournament matches: before and after a
repeated `POST .../ready`, the integration test compares `accepted_at`,
participant `ready_at`/`updated_at`, attempt `home_ready_at`, and the inventory
reservation-event count as exact DB-row equality. The response is the current
active match (`200`) and the retry does not publish notices or perform writes.

Pending-boundary cleanup now clears `tournament_loadout_period` and
`tournament_loadout_confirmed_at` even when its reservation delta is zero. The
regression uses a zero-cost selected stick and proves both marker fields are
null after terminal cleanup while inventory remains `3 available, 0 reserved`.

### Round 1 RED/GREEN evidence

- Legacy server RED: `preserves a pre-092 active tournament full-match reserve
  through start and terminal cleanup` expected the new confirmation endpoint to
  reject an unmarked match with `409`, but received `200`. GREEN after gating
  confirmation, period start, activation, preview, and terminal cleanup by the
  explicit lifecycle marker.
- Readiness retry RED: `returns the current active tournament state when
  readiness is retried after activation` expected `200` and received `409`.
  GREEN with an active-tournament read-only retry path and exact before/after DB
  equality.
- Zero-reserve cleanup RED: `clears a confirmed zero-reserve tournament
  boundary during terminal cleanup` retained period marker `1` and a non-null
  confirmation timestamp. GREEN after removing the zero-delta early return.
- Legacy web RED: the reload-safe flow made one extra `/tournament-loadout`
  request (`3` instead of `2`) for an unmarked active tournament. GREEN after
  the client keyed the split lifecycle from the same rules marker and used the
  legacy direct `period/start` request with its selected loadout.

### Fresh round 1 verification

- `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx
  -t "keeps tournament ready, loadout confirmation"` — PASS, 1/1.
- `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx` —
  PASS, 108/108.
- `pnpm --filter @hockey/game-core build` — PASS.
- `pnpm --filter @hockey/server typecheck` — PASS.
- `pnpm --filter @hockey/server exec vitest run
  test/tournament/fixtureAttempts.integration.test.ts
  --poolOptions.forks.singleFork` — PASS, 45/45.
- `pnpm --filter @hockey/web typecheck` — PASS.
- `git diff --check` — PASS.

No GLM review, subagent, push, deployment, production action, or manual dev
acceptance was performed in review fix round 1.
