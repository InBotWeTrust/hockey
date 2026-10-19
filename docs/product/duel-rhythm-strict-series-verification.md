# Strict Rhythm duel series

Base: origin/dev 696a1cae7da7840603aefbaf6a4e83e98af3ff71.

New Rhythm duels snapshot `rhythmVersion: 3`. Any non-goal ends the series; exceeding two board-to-board traversals also ends it. The next goal starts at one, pending a second timely consecutive goal. Credited points remain. Server score, series tie-breaking and the shot notice use the same versioned projection.

Snapshots with Rhythm versions 1/2 retain their original rules, including matches already created, settled history and rewards. No data migration or dev/production mutation is included. Core version 115 preserves prior shot-physics compatibility because puck simulation is unchanged. Bonus Rhythm retains its existing `breakOnMiss` rule.

The notice now accepts the actual travel projected from the existing deterministic movement sampler. For new duel rules it hides when the third traversal starts without waiting for another shot or poll. The existing gameplay loop, rebound and result-pause timing are unchanged.

Verification:
- RED observed: six goals / miss / goal incorrectly yielded score 7 and series 7; goal subtitle retained that series; notice stayed visible beyond two traversals.
- GREEN: 19 shared-core/version tests, 8 duel API integration tests using actual authoritative shot routes, 8 notice/score/result tests, 102 bonus/clock regression tests.
- Repository typecheck and lint, web production build: PASS.
- Internal browser: actual notice component rendered through six goals -> miss (hidden) -> goal (new series) -> third traversal (hidden). This component preview does not claim a complete real-duel browser run.
- Neighboring server suites: 29 passed, two post-deadline API checks failed (Sniper and Marathon expected 409, got 200). Both exact failures reproduce on a separate clean archive of the current dev with its own built core. That baseline also failed a timely-final-Marathon fixture (expected 200, got 409). These pre-existing deadline issues remain outside this patch.

No release has been performed for this change.
