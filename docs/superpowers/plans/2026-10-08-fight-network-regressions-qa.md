# Fight network regression QA — 2026-10-08

Base: origin/dev 4eb9fe99477a06e87aaa70005b8ccaee5abe481d.

## Confirmed regressions and fixes

- A delayed equal-revision snapshot reused an acknowledged command sequence. RED then GREEN socket-hook test; sequence is monotonic within a fight phase.
- Rejected held input continued renewing, causing repeated invalid commands. RED then GREEN; renewal stops until authoritative resynchronization.
- WebSocket ACK waited for inventory/score DTO assembly inside the gameplay transaction. Real localhost WebSocket RED then GREEN with deliberately blocked DTO; ACK follows admission commit, independently of snapshot assembly.
- Confirmed contacts arriving after 1500ms lost their effects. RED then GREEN; new contacts animate once, initial reconnect history remains suppressed.
- An opponent update during shot animation invalidated an already confirmed goal by object identity. RED then GREEN; match/period/shot progression now guards deferred application.

New v2 clients receive compact committed fight rows without inventory/score queries or gameplay locks. Notifications coalesce per socket. v1 clients retain full snapshots. Compact revisions cannot overwrite hockey shot progress or be rolled back by older full fight data. Command rejection diagnostics contain match ID and reason only.

## Verification

- Web: 89 focused fight/control/store tests passed.
- Server: 10 focused tests passed, with the network ACK test subsequently expanded to both v1/v2 and both passing.
- Dedicated synthetic PostgreSQL/Redis: 25 ordinary fight integration tests passed. Final two-client v2 test separately passed after protocol negotiation and end-to-end transition updates.
- Two real local sockets: accepted attack, defender HP 5→4 delivered via compact update, idempotent retry, invalid duplicate rejection, subsequent valid command, server-side fight resolution, winner resume, accepted hockey shot and matching state score.
- Full repository typecheck and lint passed. Web and server production builds passed.
- Browser local QA: identical SVG arrows and visible HP loss after attack. This standalone bot scene is not multiplayer acceptance.

One initial integration failure exposed a test fixture entering equipped-skates stumble timing. The offer/shot test now starts before both equipped and fallback stumble windows instead of changing only fallback timing.

## Limits

No deployment or real player match performed for these fixes. The previous dev match demonstrated multi-second request handling; actual dev latency improvement still requires post-deployment measurement. The cancelled-fight feedback-loop hypothesis was disproved by a passing regression test and required no production change. Equal-HP overtime (one life each) remains the approved rule.
