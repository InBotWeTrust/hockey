# Grigory break games – proposed local implementation

Status: approved by the user for local implementation. Shared break rules come from section 8.1 of the novice brief. Section 8.2 provides hypotheses rather than finalized controls. No deployment is included. Existing unrelated changes must be preserved.

## Experience

Daily games only, both beginner yard and amateur Central stadium. Reuse the existing shovel caretaker textures and PlayView rink. Tapping Grigory starts the selected task directly on the ice, with a compact instruction, progress and a text exit action. No new route, mandatory modal, currency, experience, inventory consumption or extra shots. One-time hint follows dismissal of period results; persist acknowledgement on first interaction.

Proposed controls below are implementation defaults, not prior user decisions. Target 20–40 seconds of active interaction; no loss or hard timeout. Idle never advances progress. Invalid actions preserve progress.

| Task | Proposed playable rule |
| --- | --- |
| Поддай ходу! | Five lanes, four valid vertical swipes per lane. Direction alternates with the caretaker. Minimum travel 32 CSS px; each accepted swipe advances one quarter of a lane, animation blends between positions. Wrong direction does nothing. |
| Чистая дорожка | Three broad snow lanes. Drag the caretaker along the highlighted route; only previously uncleared segments under a valid nearby pointer count. Leaving the lane pauses cleaning. Lifting the finger preserves progress within the attempt. Reject pointer jumps across the route. |
| Сугробы | Six piles. Tap a pile and hold to clear it; four seconds of valid hold per pile. Releasing retains partial progress in the current attempt. Hidden tab/pointer cancellation stops holding. |
| Ловкий разворот | Five turns. Each turn requires a new tap during a broad marked edge window (initial tuning: 900 ms in a 5-second pass). Missed windows repeat without losing completed turns; no input means no progress. |
| Снег за борт! | Five portions. Drag from the snow pile toward the marked side zone; release when the visible power indicator is within its wide target range. Invalid throws leave that portion retryable. Initial tuning: 40–140 CSS px and a ±30-degree direction tolerance. |

Use Pointer Events for mouse/touch, prevent map/game shot gestures only while the task is active. Keep exit reachable at 320×568; overlays use existing typography and controls. Instructions show before input becomes active. Reduced motion shortens nonessential effects without changing scoring.

## Selection and interruption

Server owns a per-user five-item deck; first selection is Поддай ходу!, then shuffle remaining unseen kinds without replacement. Consume a kind when its break assignment is created, so an abandoned attempt still counts as a tried kind. One persisted assignment per day_pool and completed period; reopening the same break never changes its kind. Each restart resets attempt progress. The next cycle begins only after all five assignments have been used.

A start request returns the existing active attempt for retries with the same request ID; an explicit restart supersedes the older attempt. Concurrent tabs share the assignment and only the current attempt may mutate it. Returning after closing the page starts a fresh attempt. Failed network requests are retryable and cannot themselves award acceleration.

## Authority and completion

Persist break identity, original readiness, assignment, attempt generation, progress, acknowledgement and completion receipt. Server receives bounded sequenced input batches; validates legal action, geometry, minimum timing and deduplicates sequence numbers. Pointer/hold durations are capped by server-observed elapsed time. Client cannot submit an arbitrary completed flag or open the next period. This is input/rate validation, not proof of human interaction.

On valid completion, lock the user/day pool consistently with daily routes. Record completion once. Effective readiness is min(original readiness, max(server completion time, previous period end + 3 minutes)). Keep original break timing for audit; daily reconcile/state/start use effective readiness. No extra reward transaction.

If normal readiness passes during a task, keep its local scene and controls mounted until finish/exit; show that the period is available, never auto-start it. Starting the next period in another tab invalidates stale acceleration, without awarding anything. Day rollover closes the old attempt and synchronizes the new daily state. A completed task cannot accelerate another period. Queue/push eligibility must use the effective break state and never notify after play resumed.

## Integration points

- Web: game/PlayView.tsx, game/renderer/IceCar.ts, screens/DailyScreen.tsx, dailyStore and daily API DTOs; separate task controller/overlay modules.
- Server: duel/daily routes/reconcile and state DTO; separate caretaker service/routes and forward-only migration; novice funnel allowlist/events.
- Reuse caretaker art. Do not change shot physics or deterministic game-core behavior for a UI mini-game.

## Implementation order and tests

1. Shared server lifecycle, deck, effective readiness, idempotency and migrations; tests first for timing boundaries, two tabs, retries, stale period/day, ownership and rollback.
2. Shared rink interaction and Поддай ходу!; local playable review before tuning the remaining variants.
3. Remaining four variants using the same lifecycle. Unit tests for legal/invalid inputs, pointer cancellation, idle behavior and preserved in-attempt progress.
4. Daily integration: expired break during task, explicit exit, reload, unavailable network, scene/modal transitions, novice/amateur and non-daily exclusion.
5. Local acceptance in both themes and narrow screens; no dev push. Document real-device acceptance gaps separately.

## Superseding local prototype: «Лёд в заносе» (2026-10-31)

The five-game design above was rejected during user review. The active daily-rink interaction now opens one physics game: directional drag, acceleration, limited turning, sideways inertia, soft board rebounds, and six seeded snow patches. Only the swept front scraper edge clears snow. At 85% the server confirms completion, remaining snow fades, and the ordinary rink returns. There is no loss, reward, resource cost, or automatic period start. Natural break expiry does not interrupt play. Exiting abandons partial progress; a new attempt resets the field.

Shared deterministic simulation lives in game-core/caretaker/drift.ts (protocol version 1, core version 118; previous hockey shots remain compatible). The server replays ordered control batches, rejects foreign/superseded attempts and faster-than-wall-clock input, and uses the existing three-minute lower bound for break acceleration. Migration 254 extends the existing caretaker attempt storage. No migration or deployment has been applied to dev or production.

Local grigory-preview.html now renders this single game with a simulated transport. It does not validate authenticated runtime or physical-device touch behavior. Target playtime 20–40 seconds remains subject to user playtesting and tuning; an unoptimized deterministic traversal currently takes approximately one minute. Legacy five-game source remains for comparison but is no longer opened by the daily-rink hook.
