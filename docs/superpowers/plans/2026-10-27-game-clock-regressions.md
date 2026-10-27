# Gameplay clock and shot recovery regressions (2026-10-27)

## Production evidence (read-only)

Production was running 348fedbf during the reported games. Express accepted all 134 shots;
both periods lasted the configured 180 seconds. Marathon rejected 13 requests with
`previous duel shot result is still showing`. The reported Salt Lake City attempt
accepted all 90 shots, with server request durations at most 524 ms. These logs do not
capture device-side button guards or response delivery times.

## Reproduced causes and changes

1. `retainDuelClock` clamped a negative anchor delta when a deferred shot acknowledgement
   arrived after a newer poll. This counted elapsed time twice, pushing the estimated
   server clock forward. A regression reproduced 7000 ms instead of 5000 ms in all six
   duel formats. Projecting both samples at the same anchor fixes this without permitting
   the estimated clock to rewind. A rendered Express regression preserves the active rink
   when such an acknowledgement arrives just before the deadline.
2. Participant DTO serialization sampled `Date.now()` separately from `server_now` and
   scene clocks. Slow serialization made the reported period clock run ahead. All
   participant clocks and deadlines now use the response's single timestamp. The API
   regression reproduced 2074 ms elapsed against a 57 ms authoritative snapshot.
3. A bonus refresh could replace the attempt object while a shot was pending. The shot
   response then became obsolete without releasing `inFlight`. Background reads now
   preserve pending shot ownership in every bonus format; request reconciliation still
   reads the server directly and keeps its existing timeout. Both refresh entrypoints
   reproduced the lost acknowledgement before the fix.
4. Bonus screens converted server deadlines to device wall time, while PlayView compared
   them with server time. They now pass server deadlines unchanged. Tests cover device
   clock offsets of both plus and minus five minutes.

The first two causes can lead to early shots rejected by the server, followed by the
existing authoritative scene rebase (visible as a jump). Rejection recovery is retained;
we fix the incorrect time inputs rather than remove reconciliation or weaken validation.
No deterministic simulation, balance, authentication, schema, or stored player results change.

## Verification

- Observed RED then GREEN for all four causes.
- Full web suite: 407 files / 3567 tests passed (including daily, training, bonus,
  tournament, duel screens and shared PlayView/loop tests).
- Scored duel API and clock tests: 33 passed, using local test Postgres/Redis.
- Typecheck, lint and full workspace build passed.
- Extended ordinary duel / Rhythm / scene-clock suite: 229 passed, one fight socket
  acknowledgement test timed out in the combined run. The same test passed alone
  (9634 ms). This remains a test-stability caveat, not an unqualified all-green run.

These are local fixes and checks, not a deployment or physical-device acceptance.
Server latency spikes and the exact guards seen on the reporting devices are not proven
resolved by these tests. After deployment, repeat the reported games on those devices
and inspect new shot-rejection logs before claiming all symptoms eliminated.
