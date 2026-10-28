# Achievement and previous-record audit — 28 October 2026

Baseline: production `78c5021`. Production investigation used read-only database
connections. No player authentication, game results, balances or claims were changed.

## Catalogue coverage

Production contains 52 active achievements, one future achievement and 14 hidden
entries. The 40 enabled ladders contain 268 stages. Hidden entries remain hidden;
the future professional-level achievement remains unavailable.

| Area | Active achievements | Checks |
| --- | --- | --- |
| Career and fans | career-goals, career-experience, career-streak, first-goal, amateur-ticket, fans-support | Source eligibility, counters and fan peak, thresholds, next-stage carry, claim transactions |
| Daily | first-daily-game, ideal-day, daily-sniper-streak, ice-hand, third-period-decides, dry-finish, keeping-fit, sniper-week, sniper-month | Period-spanning sequences, quota, independent compound results, stage opening boundaries, calendar days versus completed games |
| Training | first-training, training-monster, rhythm-control, no-warmup-needed, finish-machine, stable-student | Saved quota, incomplete sessions, beginning/end/longest sequences, consecutive local dates, stage reset |
| Duels | blowout, classic-speed, clean-win, cold-start, dangerous-guest, dangerous-host, express-sniper, final-push, hunter-streak, mix-sniper, nervous-finish, no-error-classic, no-error-express, no-error-mix, no-panic, revenge, thin-edge, training-before-battle, underdog | Completed versus technical matches, participant-specific performance, win-only conditions, roles, independent attempts, duplicate deliveries, internal series |
| Monthly duel rating | monthly-top-1, monthly-top-3 | Confirmed placement source, first place versus second/third, historical count and duplicate events |
| Tournaments | dark-horse, death-bracket, no-shake, playoff-final, playoff-semifinal, regular-season-champion, regular-season-medalist, series-comeback, tournament-cup | Assigned rounds, played series, experience snapshots, comeback sequence, each individual fixture result, cumulative appearances and rewards |
| Purchases | wallet | Paid payment only, existing payment/stat completion paths |

`allStages.test.ts` exercises every enabled ladder through its actual stage and
claim services: below-threshold rejection, exact-threshold completion, configured
reward balances, next-stage opening and repeated-claim rejection. Domain tests
exercise the actual daily/training/duel/tournament/rating event evaluators.

## Confirmed defects and fixes

1. Daily shot event keys omitted period number. Repeated indices in periods 2/3
   prevented both daily goal streak and no-panic recovery observations.
2. Daily sequences reused shots made before the current stage opened. Later
   stages now count only their new shots, preserving separation between days.
3. Shared best-result merging always maximised numeric fields, including miss
   counts and duration ceilings. Maximum-limited metrics now retain the minimum.
4. Compound targets could combine unrelated games. Completion now requires one
   full observation to satisfy all qualifiers; incremental counters still accumulate.
5. Claiming a series level cleared its displayed progress but retained the internal
   win/training count. Claiming resets that count while preserving replay markers.
6. Existing saved win/training counts could already include prior levels. New
   observations rebuild their current series from actual matches/training days
   within the stage boundary, rather than trusting the stale count.
7. Training series counted sessions across missing calendar days. Actual local
   dates and completed quotas now determine the consecutive-day series.
8. An incomplete training could grant first-training and prepare a training-before-
   duel bonus. Both require the saved training quota to be completed.
9. A daily game closed by timeout with a single goal could grant perfect-game
   accuracy and first-daily-game. Full-game achievements require every period's
   quota; completed-game windows also exclude incomplete games.
10. Daily multi-game windows reused days from before the next stage opened, and
    sniper-week/month incorrectly required consecutive calendar dates. These count
    new completed games; keeping-fit separately counts consecutive qualifying days
    and reports partial progress toward seven days.
11. Personal duel-performance achievements were evaluated only for the winner.
    Both participants are evaluated for conditions that do not require a win.
12. Replaying an older settled duel could increment win counters again. Evaluation
    is atomic, locked by match and recorded once; concurrent deliveries are tested.
13. Tournament performance collection kept only one result per player/achievement
    in the entire tournament. Individual no-shake fixtures and comeback series now
    retain their identities for later stages.
14. A draw between a loss and the later win did not clear the revenge marker.
    A non-winning settlement now ends that immediate-rematch opportunity.

Each confirmed defect has an observed failing regression before its fix. Additional
boundary tests cover concurrent replay, historical series isolation and repair reruns.

## Previously saved daily series

Migration `243_repair_daily_achievement_series.sql` recalculates only incomplete,
unclaimed daily-sniper-streak/no-panic stages from saved daily shots after opening.
It does not cross day pools, open further stages, pay rewards, remove existing
claims or change shots. It is safe to rerun and has positive/negative regression tests.

A SELECT-only preview of this migration against production found:

- daily-sniper-streak: 15 stage progress updates, including 11 newly claimable levels;
- no-panic: six stage progress updates, including two newly claimable levels;
- the reported player Саня Х is included in the recovered daily-sniper-streak levels.

The production migration has **not** been applied by this task.

Migration `244_repair_pending_training_series.sql` separately rebuilds the best
and current consecutive training-day counts for incomplete later stable-student
stages from their saved quotas and shots. It preserves replay markers, claimed
stages and balances. A SELECT-only production preview checked eight pending stages:
six have incorrect displayed progress (five exceed even the total number of new
sessions; the sixth is affected by calendar gaps). None becomes newly claimable.
This migration also remains unapplied on production.

## Previous bonus records

All 50 active bonus leaderboards were checked across speed, accuracy, marksmanship,
endurance and rhythm. All 69 missing player/location entries were in accuracy;
saved records belonged to earlier rules. Lost Star has a saved previous record in
each of the ten active accuracy locations. Other active formats had no missing
record entries among completed player/location pairs.

The records API returns the requesting player's previous record metrics and dates
separately from current standings. It preserves current-rule ranking and exposes no
other player's previous records. The location preview shows the saved previous
result and explains the changed conditions; the records modal displays the history.
Both current and previous records may coexist. No game replay or automatic record
reward is needed to see the previous result.

## Reward integrity

Production read-only checks found no claimed stage without completion and no active
unclaimed stage pointing at a disabled definition. Eight repeated historical
user/achievement/stage ledger pairs were all explained by recorded September stage
reconciliations between their award dates. They are not evidence of a current double
claim. Existing claims and balances were not rewritten during this audit.

## Verification

- Focused server run: 21 files, 165 tests passed, including all 40 ladder checks;
  the separate training-history repair regression also passed.
- Focused UI/CSS run: 108 tests passed.
- All-package typecheck, lint and production build passed.
- Workspace core/mobile/web: 587/4/3591 tests passed. Initial server run had setup
  hook timeouts in amateur and tournament service tests and included the revenge
  regression before its final fix. The affected scenarios passed in isolation;
  the final full server rerun used a 60-second hook timeout: 2587 passed, 51 skipped.
  Its only failed suites were `memoryPersistence`, `conflictPhrase` and
  `roomInvitationView`, whose database-name guards reject the temporary DB's name.
  All 21 tests in those suites passed on `hockey_test`; the additional training
  repair test passed there as well. Combined final server verification: 2609 passed,
  51 configured skips; no achievement tests skipped. This is combined run evidence,
  not a claim that the original workspace invocation exited green.
- Browser checks used the actual records component with synthetic API responses
  at widths 390 and 320 in dark/light themes; both previous results and explanatory
  copy remain readable. This is a local component check, not a signed-in production
  acceptance test. Temporary harness files/server/browser were removed afterward.
- This task has not deployed the changes or verified authenticated gameplay on a
  physical phone.
