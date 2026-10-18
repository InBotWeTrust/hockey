# Bonus Rhythm feedback corrections

## Rules

New bonus attempts use strict consecutive goals (`breakOnMiss: true`): any non-goal ends the current series. Starting the third board-to-board traversal also ends it; a shot at exactly two traversals is timely. Credited points remain after expiry. Duel defaults and saved bonus attempt snapshots retain their prior semantics.

Puck speed is copied from the configured first daily period (default 1.25) instead of the Classic duel snapshot (0.85 on dev when inspected). Movement speeds are unchanged. Rule changes create a distinct existing record-rule version; historical records are not rewritten.

The HUD reads the actual shooter movement clock. The notice disappears when the two-traversal window expires; no polling request or further shot is required. Its stripe is yellow below the level's minimum scoring series and green at/above it. Preview record summaries show only centisecond time; ranking details stay available.

## Verification

- Observed RED: incorrect puck speed; missing expiry clock callback; missing notice tone classes; absent preview formatter; strict series continuing after a miss.
- GREEN: 18 game-core/version tests, 176 web tests, 2 real PostgreSQL integration tests.
- Repository typecheck and lint passed. Web build passed.
- Before adding strict misses, real local API browser measurements covered miss, save, post and goal: all entity position deltas zero during result; result duration 998.5–1000.8 ms; rebound remains animated. Requests used puck speed 1.25 and all recorded outcomes matched.
- Browser notice trace: yellow first goal, green series two and three, hidden after miss, and hidden after two traversals without another shot. The strict miss change was then verified by core, UI and real server shot tests; the local API was restarted and a fresh attempt opened for human acceptance.
- Mobile 375×812 gameplay render checked in the internal browser.

Known verification gap: the pre-existing final-shot integration fixture again failed to find a suitable deterministic goal inside its narrow search interval. This exact fixture failure was observed before these changes; it is not reported as passing. The two targeted server tests run separately pass. No dev or production deployment is part of this change.
