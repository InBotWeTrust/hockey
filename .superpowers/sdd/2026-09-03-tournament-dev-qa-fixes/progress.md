# SDD ledger — plan: docs/superpowers/plans/2026-09-03-tournament-dev-qa-fixes.md

## Pre-flight

| Tasks | Shared interface/file | Finding |
|---|---|---|
| 1 / 2 | playoffScheduling, fixtureAttempts, rule snapshots | Task 1 defines compatible timing fields; Task 2 consumes them for transitions. Ordered correctly. |
| 1 / 5 | service schedule DTO | Task 1 removes future fixture slots; Task 5 must expose actual timestamps only for completed history. |
| 2 / 3 | attempt lifecycle and active-game list | Task 3 must derive visibility from Task 2 states, not create a client clock source of truth. |
| 2 / 4 | readiness and active deadline | Task 4 separates UI/API actions; Task 2 remains authoritative for attempt transitions. |
| 2 / 5 | next-game state DTO | Task 2 produces break/availability; Task 5 removes nextGameChoice consumers. |
| 3 / 5 | public schedule queries | Both are participant scoped; Task 3 handles actionable main-screen state, Task 5 handles selected-day history. |
| 4 / 5 | DailyScreen and attempt DTO | Task 4 owns gameplay controls; Task 5 owns schedule and modal composition. Avoid duplicate state. |
| 1 | tests vs migration | Consistent: forward-only schema and legacy parsing are both explicitly tested. |
| 2 | tests vs implementation | Consistent: every transition and failure outcome has a covering integration case. |
| 3 | tests vs implementation | Consistent: notification audience, timing, dedupe, badge, and visibility share server state. |
| 4 | tests vs implementation | Consistent: standard duel is the behavioral reference and inventory effects are verified deterministically. |
| 5 | tests vs implementation | Consistent: lazy API behavior and responsive UI are both observable. |
| 6 | verification vs release | Consistent: no dev merge until local and independent review gates pass. |

Ruling: The earlier requested end-of-day countdown is superseded by the approved sequential model. After a user's assigned games for a date are complete, the main-screen tournament item disappears and returns at T-30 for the next date.

Ruling: `gameDurationMinutes` remains the compatibility key to avoid destructive snapshot migration, but it is labeled and calculated as the post-readiness completion window.

Ruling: Existing settled and active attempts are immutable. Pending/unstarted attempts adopt the new lifecycle even in existing tournaments.

Baseline: commit `e1c88b8`; 9 server tests, 42 web tests, repository typecheck, lint, and diff check passed before new implementation.

Task 1: fix round 1/5 (5 addressed, 0 open; commits b495e9e..73db8ef).
Task 1: complete (commits e1c88b8..73db8ef, review clean).
Task 2: fix round 1/5 (2 addressed, 1 open; commits db97484..d3025af).
Task 2: fix round 2/5 (ordinary lifecycle addressed; admin-force timestamp open; commit 4574844).
Task 2: fix round 3/5 (admin-force timestamp addressed; commit 35e9524).
Task 2: complete (commits 73db8ef..5326f3b, final review clean; 45 focused server checks and 47 focused web checks passed across the review cycle).
