# Two recorded marksmanship runs in the dev constructor

## Purpose and scope

The dev-only marksmanship constructor currently scans three synthetic seeds for hypothetical goal windows. Add a separate replay mode for two actual three-minute Express attempts: Egor Gumenyuk versus Vladislav Kesso on 18 September 2026 (78 goals from 83 shots, match `f919bc3b-97fb-4527-8c3c-a4ca2fe7d6d2`) and Dmitry Arkaim versus Sanya X on 19 September 2026 (79 goals from 90 shots, match `5df33314-a34a-46a0-83b6-ae7f7fe52d2d`). Replay only Egor's and Dmitry's individual attempts, not their opponents' runs or a synchronized match.

The audience is every dev player who can open the existing constructor. Production must not expose the constructor or either data set. No production data writes or cross-environment runtime connection are allowed.

## Fidelity contract

Each saved shot has an authoritative result, `shot_index`, scene `tapTime`, player `shooterTapTime`, effective shot input, shot seed, and server receipt timestamp. The replay must show the exact saved shot situation and recorded result. The current game-core calculation matched all 173 stored results (83/83 and 90/90) when supplied with the saved input, goalie, phase offsets and stick effects. Lock this result comparison into an import-time verification test; do not infer compatibility merely from the version number (stored version 58, current version 63).

The server did not record every rendered frame, exact client tap wall-clock timestamp, or modal-open/close events. Playback between shots is a reconstruction. Use the period's 0–180 s wall timeline and server receipt times to place shot events; use saved scene/player clocks at each event to anchor entity positions. Between events, advance or hold the two clocks according to the game's known shot-flight and result-pause behavior, correcting at each saved shot rather than accumulating error. Do not claim the entire animation is a frame-perfect recording. Label the mode `Реконструкция игры`; explain in a short note that shot moments and outcomes are recorded, intervening motion is approximate.

## Data boundary

Export only the two selected participants' minimal replay records from production using read-only SQL. Store a reviewed, deterministic dev-only fixture, not a live production URL or credentials. Include display label, period wall start, match/shot seed or derived phase offsets, rules needed for rendering, effective goalie/stick parameters, each shot's two clock values, receipt offset, result and awarded points if reliably derivable. Exclude user IDs, contact/profile fields, inventory identifiers and the opponents' shot records. Keep the fixture reachable only through the constructor's existing dev-only build flag; add a guard test that production builds do not import it.

Validate fixture schema and ordering (unique increasing shot indices, finite nonnegative times, within 180 s, known results). At import, compare current game-core outcomes to every stored server result. A mismatch must fail the import/test, not silently substitute a computed result in the UI. The runtime UI always displays the recorded result. If any derived technique or points cannot be reproduced from saved data, omit that derived field rather than mislabel it as historical fact.

## UI and interaction

Keep the existing page header, rink, hitbox toggle and visual language. Add tabs `Учебная схема`, `Егор · 78`, `Дмитрий · 79`; the synthetic starts and hypothetical goal-window list remain only in the first tab. Each recorded tab has Play/Pause, the existing adjustable step input (default 50 ms), left/right arrows that move the 0–180 s slider by that step, and a full-width slider. Seeking, switching tabs, or choosing a goal pauses playback; replay can resume from the selected point. Playback stops at 3:00; reset returns to the beginning of the selected run.

During playback the rink shows the saved movement and current shot animation. At each shot show puck flight and a shortened but legible `ГОЛ`/`СЭЙВ`/`МИМО` result overlay. Do not let the overlay block seeking or create nested timers. The ghost positions for goal and goalie use the shot's effective inputs and crossing times; the hitbox toggle covers current and ghost outlines. When a shot is selected, show its number, recorded result, scene/player time and existing spatial characteristics. Do not show a prospective `ГОЛ` merely because the current free-running position would score; only recorded shots receive a historical result.

Below the rink, list only actual goals for the selected run in shot order (78 or 79 cards), with compact result/number/time details and a jump action. Jumping seeks to immediately before that shot's tap and scrolls to the rink. No synthetic goal-window list appears in recorded tabs. Preserve mobile scrolling and large touch targets.

## Reliability and verification

Pure replay timeline functions must handle 0 and 180 s, repeated seeks, sparse or closely spaced shots, and clamped step input. Playback uses one cancellable animation loop; unmount, tab change and seek cancel stale callbacks. Loading failure presents a non-crashing message with a route back to the synthetic tab. The fixture is bundled for dev, so no network request is required during playback.

Tests cover fixture validation and all 173 results, wall-to-scene/player clock mapping at saved shots, play/pause/end/seek/reset, step arrows, goal-list jumps, result overlay, tab isolation, and production feature exclusion. Run game-core build before web checks, then relevant web tests, typecheck, lint and build. Browser-check the rendered page at desktop and mobile sizes. A local test or dev deploy alone does not prove the historical continuous animation is exact; acceptance focuses on shot anchors, recorded outcomes and transparent approximation between them.
