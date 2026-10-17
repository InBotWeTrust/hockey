# Rhythm duels implementation

Approved conversational specification: one 150000 ms period; uninterrupted period clock; at most two actual board-to-board distances between goals, measured at shot initiation. Initial window starts with play. Timely goals score and extend a series; misses preserve the window; expired windows break the series without penalties. A late goal scores zero and starts another window. Ties compare all series sorted descending. Classic period-one speed snapshot, normal inventory/fatigue, no fights. Existing shot lifecycle and UI retained. A thin two-segment HUD shows remaining traversals and current series; state notices stay on ice. Goal subtext explains qualification. Real goals stay separate from score. Sixth monthly rating, first-place 30 stars/30 XP with independent admin settings. Shared monthly cap130, per-format26; other limits unchanged. Extend matchmaking/invites/profile/history/spectators/admin; additive migrations; no tournaments/achievements or deployment.

## Task 1: Shared deterministic scoring and movement
Add server-verifiable actual movement sampling scoped to Rhythm using existing condition and scene-motion hook; pure scoring/replay and lexicographic series comparison. Add failing boundary tests then implement. Preserve existing shot outcome mechanics and old-version compatibility.

## Task 2: Server integration
Add rhythm types, immutable snapshot, schema/template/reward migration; authoritative shot movement, projections, winner, persistence, monthly rewards, admission and spectator support. Reuse current transactions, reservations and shot idempotency.

## Task 3: Client integration
Extend types, selections/labels/ratings/admin/history/result; use same shared movement in existing PlayView; two segments and result explanation. No new shot loop or renderer freeze flags.

## Task 4: Verification
Only internal browser for checks: expose local automatic checks and real API in an isolated test environment. Verify RED then GREEN, boundary/goal/miss/retry/stale/focus/period completion and six-format shot lifecycle. One independent whole-branch review, fix important findings, keep local commits without deployment.

## Approved follow-up: confirmed pairs and simpler HUD

The user's local-play feedback supersedes the initial scoring/display specification for new matches. A first goal, regardless of initial travel, starts a pending series without points. A second goal initiated within two traversals credits both goals (score/series 2); further timely goals add one. Expiry discards an isolated pending goal while retaining previously confirmed series. Misses preserve the window. New snapshots use `rhythmVersion: 2`; explicit version-one snapshots retain their scoring.

Remove the two-segment progress bar and its caption entirely. Rhythm condition notices return below the scoreboard using the existing placement. The first or isolated goal has no modal subtitle; confirmed goals show only `Серия N`. Other formats' UI and shot lifecycle stay unchanged.

Follow-up caption clarification: the first goal of each new series shows `ГОЛ` with `Серия началась`; a confirmed second goal shows `Серия 2`. Unconfirmed single goals still contribute zero points.

Result display follow-up: replace the combined series line with two rows labeled `Вы` and `Соперник`, without a separate series heading. Group repeated lengths descending as `6 ×3`; use a smaller multiplier and omit `×1`. Scoring is unchanged.
