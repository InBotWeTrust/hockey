# Rhythm verification — local only

Base: `origin/dev` at `ad067e65fbf4aac81c655a9bcc5043a678cc62f6`.
Branch: `feature/rhythm-duels`. No push or deployment authorized/performed.

## Automated checks

Checks were started through local controls in the Codex internal browser.

- Typecheck: PASS, all workspace packages.
- Lint: PASS.
- Workspace build: PASS (existing bundle-size and Browserslist-age warnings).
- Web targeted regressions: 110/110 PASS, 7 files.
- Core Rhythm/version tests: 11/11 PASS.
- Rhythm real-route integration: 7/7 PASS in an isolated PostgreSQL database.
- Monthly closure/rewards: 27 PASS, including Rhythm and one-time payouts; rating settings 3 PASS, admission 1 PASS.
- Full core: 534 PASS, 4 FAIL. The same four failures were reproduced at the exact base commit: two stale open-window observation fixtures, two training scene bank-version fixtures. No training changes included.
- Existing scored-duel suite: two deadline-reconciliation failures also reproduced at the base commit. A later run additionally had an intermittent Sniper final-shot boundary failure; its cause is not established. The full server suite is not claimed green.

## Observed RED → GREEN

- Server rejected a rewound Rhythm scene clock after adding the failing integration case; continuous period time and confirmed pauses now derive movement time.
- Delayed flight contact callback previously allowed extra scene movement; shared PlayView regression reproduced it, then passed with the nominal contact cap. Puck rendering remains active.
- Shared stumble hold was missing from the Rhythm sampler; regression now verifies the existing 650 ms hold.
- Compact history omitted Rhythm score/series; component regression failed before the fix and passed afterward.

## Real local API and mobile browser

Internal browser, 375×812; separate `rhythm_live` database and Redis namespace, synthetic local users. Production/dev accounts and databases were not modified. Local fixture calls real Fastify routes and deterministic shot resolution; it is not a fake response generator.

Eight consecutive throws in each of Express, Mix, Classic, Sniper, Marathon and Rhythm. Observed goals, misses, saves and posts across the runs. Flight player delta zero within floating-point noise; result entity delta zero within floating-point noise; result display approximately 1 second. Miss/save/post puck rebounds continue while scene entities are fixed. Rhythm traversal consumption during result: zero. Read-only database check found no client/server shot mismatch rows.

Additional Rhythm run with shot acknowledgements delayed 2200 ms: eight results, modal 996–1001 ms, entity movement zero, traversal consumption zero, period countdown rollback zero. No repeated modal observed. The period continued during result displays.

The real 150-second period completed: the traversal bar disappeared, gameplay stopped, and the final dialog opened automatically once both participants finished. Two late real goals remained in period statistics (2:0), while the qualified final score and series stayed 0:0.

## Remaining acceptance boundaries

No deployed-runtime, physical-device or CI result is claimed. Physical background suspension/network reconnection and arbitrary out-of-order network delivery have not been exhaustively exercised in the browser. Deterministic sampling order and request retries are covered by automated checks. Baseline test failures above remain outside this task.

## Follow-up: confirmed pairs and HUD simplification

- Observed RED: four new core regressions failed with the old algorithm (pending late first goal, exact boundary pair, isolated-goal expiry, confirmed-score preservation).
- GREEN: 16 core/version tests, 111 targeted web tests, 7 real-route Rhythm integration tests.
- Real local API, internal browser: eight consecutive throws. First goal modal had only `ГОЛ`; the next timely goal showed `ГОЛ` with `Серия 2`; authoritative score became 2:0. Misses did not reset the pending pair. Entity displacement during all eight result modals was zero; durations 997–1001 ms.
- Mobile 375×812: no traversal indicators or caption; condition status is inside the existing scoreboard container below its opponent row, rather than over the player.
- Snapshot scoring version 2 preserves version-one match interpretation. Existing hockey shot-version compatibility remains explicit; movement/flight code was not changed by this follow-up.

Follow-up typecheck, lint and full workspace build: PASS. No push or deployment performed.

Caption clarification: RED observed (empty details instead of `Серия началась`); then 111 targeted client tests PASS. A real local first goal displayed `ГОЛ` / `Серия началась` with the scoreboard remaining 0:0. The scoring algorithm was unchanged.
