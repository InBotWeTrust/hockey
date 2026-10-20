# Fight realtime verification — 2026-10-09

Base: dev `24b3b06904c173d2356df97e12eff926b15d5cae`. User authorized this task only on dev; production is excluded.

## Functional checks
- Ordinary fight integration: 32 passed (dedicated synthetic PostgreSQL and Redis).
- Targeted server including complete bonus-shot suite: 113 passed, 9 opt-in load cases skipped; additional deadline/sequence room regression: 7 passed.
- Core fight/version: 65 passed. Client fight/control/socket/store: 87 passed. Remaining web isolated groups and DailyScreen cases passed.
- Final repository typecheck/lint and server build passed. Full application build passed before final server-only test-isolation option.
- Full suites have baseline failures independently reproduced on exact dev base: server 21, core 4, web 7. They are not reported as green. Two transient bonus fixture failures cleared on full bonus-shot rerun; newly introduced RED regressions cleared after fixes.
- Local rendered QA: runtime hit removed one HP; technical interruption uses the same light result modal as a draw, with “Драка прервана” / “Вызов возвращён”, no rewards.
- Real paired local sockets: p95 committed-command delivery 77.40 ms legacy, 17.20 ms runtime (12 commands/mode). Not an internet/device capacity measurement.

## Room stress
90 seconds/run, first 30 warmup; continuously replace finished rooms. Five percent duplicate delivery models reconnect replay. This measures CPU/queue only, not 100 actual sockets or PostgreSQL/Redis/fanout capacity. Some other local checks ran concurrently.

| Rooms | Run | Inputs | Unexpected errors | Replacements | Queue p99 ms | CPU seconds | RSS MiB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 11560 | 0 | 20 | 25.69 | 9.19 | 180.9 |
| 10 | 2 | 11580 | 0 | 20 | 12.34 | 8.01 | 183.5 |
| 10 | 3 | 11580 | 0 | 20 | 17.03 | 8.04 | 196.0 |
| 50 | 1 | 57100 | 0 | 100 | 54.19 | 38.04 | 211.2 |
| 50 | 2 | 57300 | 0 | 100 | 53.63 | 37.73 | 253.6 |
| 50 | 3 | 57800 | 0 | 100 | 46.84 | 36.91 | 283.6 |
| 100 | 1 | 110800 | 0 | 200 | 79.91 | 63.77 | 416.9 |
| 100 | 2 | 111000 | 0 | 200 | 79.99 | 63.05 | 348.0 |
| 100 | 3 | 111000 | 0 | 200 | 88.02 | 62.21 | 389.8 |

Initial 100-room runs exposed a harness sequence gap after expected late_action admission rejection. The real client resynchronizes on rejection; the harness now does too. A deterministic room test confirms the rejected number remains available in the next phase. Final three 100-room runs passed.

## Release and remaining acceptance
- Migration 195 is additive and defaults the new-runtime flag off. Enable `duels.fights.runtime.enabled` only in dev after matching deployment verification. Both clients must refresh to protocol v3; old fights remain on legacy rules.
- Rollback: disable flag for new fights, allow active rooms to finish before code downgrade.
- Verify exact Actions SHA, migration, running server/web/worker images and health separately after merge.
- Still requires human two-phone acceptance on dev. No production release, VPS capacity claim, complete per-contact acknowledgement protocol or end-to-end load benchmark is claimed.
