# Bonus Rhythm implementation plan

Goal: ten local bonus games using the existing bonus shot lifecycle and temporary amateur artwork. No deployment.

Approved rules: one continuous 180000ms period; Classic period-one speeds; no inventory, fights or inventory conditions. Each goal opens two actual player traversals. A miss only hides the notice and does not end an open series. Minimum qualifying series: 2,2,3,3,4,4,5,5,6,7; targets: 20,24,28,32,36,40,44,48,52,56. Reaching the threshold credits the whole series. Finish on the goal reaching/exceeding the target. Deadline uses shot start; final timely shot resolves normally.

Records: elapsed time to hundredths, longest qualifying series descending, exact real-goal accuracy descending, shot count ascending. Existing first-clear and record rewards/access/sequence/idempotency. Separate real goals and credited score; stable level ids allow later artwork replacement.

- [x] Shared threshold projection and tests (RED/GREEN); retain duel defaults.
- [x] Additive catalog/schema; qualification, server authoritative score and DTO; preserve existing bonus timing and physical resolver. Test boundaries, missed shots, duplicates, timeout, final shot and reward idempotency.
- [x] Record ordering/storage and display; preserve old record ordering.
- [x] Catalog/play/result UI, existing notice under menu, no traversal bar or modal subtitle. Existing physics and result pause.
- [x] Targeted regressions, types/lint/build, real isolated local API and internal mobile browser; report gaps separately. No shared database mutations.

Implementation decision: with inventory disabled the existing authoritative shooter movement clock is exact. Convert its integrated movement to board-to-board traversals; never use wall time as movement. Period time includes flight and modal pauses.

Review ruling: Rhythm settlement has a bounded 12s grace after the siren for requests/reconnect racing a final timely shot. Scene/input stop at 180s; late-started shots remain illegal. Reads keep the attempt pending until grace expires; successful final shots settle immediately. No existing format changes. Rejected provisional UI notices are rolled back.

## Verification
- Base: fresh origin/dev 2f6fbb85e3dde54d8c12d1f1a277b665249f34ba; unrelated primary checkout preserved.
- RED: threshold seven incorrectly credited six goals; qualification rejected Rhythm; record equality ignored centiseconds. GREEN after shared/server implementation.
- RED: reconcile before final delayed shot prematurely failed the game. GREEN after bounded settlement grace. RED: rejected provisional goal notice persisted. GREEN after rollback.
- Core Rhythm/version 17 PASS; existing web suites 277 PASS, expanded play suite 86 PASS, record-modal 12 PASS. Existing server qualification/shots/records plus Rhythm: 88 PASS, then added final-shot/race test PASS.
- Typecheck, lint and full build PASS; final web build/lint repeated after UI reset protection.
- Internal browser, real isolated local API: 30 shots, zero client/server outcome mismatches, 30 result modals, entity position delta zero, rebounds visible on misses. Modal duration approximately 997-1018ms; period continues. Mobile 375x812 checked; failure result shows credited score, target, best series and real goals/shots/accuracy.
- Dedicated databases bonus_rhythm_test and bonus_rhythm_live, Redis db4/db5, synthetic local users only. No dev/prod writes or deployment.
- Remaining product acceptance: human balance runs at levels 1-10, especially targets52/56; final city artwork arrives from the separate session. Successful completion/records and siren race validated via real server integration; no claim of full human mobile completion at all levels.
