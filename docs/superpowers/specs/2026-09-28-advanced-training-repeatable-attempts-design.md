# Advanced training: repeatable, human-playable attempts

## Goal and scope

Teach the eight existing marksmanship situations on both sides through demonstration, practice, and assessment. A player must have enough real time to recognize the situation and press the shot button. Keep the existing category definitions and goal/save/miss rules; this design changes only advanced-training episode motion, timing, and presentation. It does not change ordinary games or scoring balance.

The current continuous trajectory cannot meet this goal: across the first two minutes no category/side has a 300 ms valid window; some last only 5–7 ms. Repeating that trajectory, widening the scoring category, or silently moving an assessment tap to the ideal frame would not teach a human-playable shot.

## Episode model

- Each category and side has an authored, deterministic episode. The scene starts eight complete player edge-to-edge traversals before the valid shot interval. Goal, goalie, and player positions and directions advance continuously within the episode. There is no repositioning on visible ice.
- The same episode is replayed from its initial state after each attempt, including a goal, save, miss, wrong-category goal, or an expired shot interval with no tap. A timeout without a tap is not recorded as a shot.
- The target category and side must remain valid for at least 500 ms of **real elapsed time** in assessment at its normal episode speed. Practice must also offer at least 500 ms of real opportunity at its practice playback speed. These are minimum guaranteed valid intervals, not merely the length of a visual cue. A press anywhere in the interval is evaluated at its actual press time; no auto-shot or tap-to-target queue is used in either stage.
- Exercise-only motion profiles may be authored to create these intervals. They must be resolved by the same deterministic game-core code on web and server; the renderer cannot invent a separate path. General match motion and classification thresholds remain unchanged.
- No category/side episode may ship without an automated engine check that proves a goal of that exact category and side throughout the required interval. If authoring cannot produce a valid interval, the exercise is unavailable with an explicit error; the system must not fall back to a 5 ms window or award an approximate result.

## Demonstration, practice, assessment

- Demonstration plays the authored episode up to the recommended tap position, pauses, shows positions/directions and the predicted arrival positions, then plays the puck after “Понятно”. The explanation describes the actual category at arrival. Demonstration timing and trajectory match the later practice/assessment version of that side.
- Practice starts with the same eight-traversal lead-in. The cue is “Ожидаем момент”, then 4 → 3 → 2 → 1 in real seconds before the valid interval. “Бросай” appears only while a real press will be accepted and can produce the target category. Practice may use one smooth, predeclared slowdown near the opportunity; it must not jump the scene or secretly queue an early press.
- Assessment uses normal episode playback speed. The same four-second countdown is shown, but after “1” the cue disappears. There is no “Бросай” and no “Ожидаем момент” during the shot interval. The player decides when to press. The button remains available throughout the episode.
- The exercise retains its existing success counts per side and stage unless separately changed. When the required count is reached on one side, the next coach hint explicitly announces the other side.

## One result flow for every outcome

1. A tap freezes the episode only after the puck animation resolves. Show the ordinary result modal (“Гол”, “Сэйв”, or “Мимо”), irrespective of whether the goal matched the target category. Do not show a special “wrong category” result modal.
2. Closing the result modal leaves the rink stopped at the actual outcome frame and shows the coach hint on the ice. For a wrong-category goal, paragraph one states what happened and why; paragraph two states what to wait for next time. For a correct goal, the hint acknowledges success and says whether to repeat or change sides. For a save or miss, use a short outcome-specific explanation and a concrete next action. The hint has the coach avatar and “Понятно”.
3. An expired interval without a tap shows a “Момент упущен” modal, followed by an on-ice hint. This also requires “Понятно”; there is no silent, immediate replay.
4. After “Понятно”, an opaque brief transition covers the rink, resets all episode clocks and positions, and reveals the new lead-in. The old and new positions are never visible in one frame. Respect reduced-motion preferences by using a static cover instead of an animated fade.
5. On practice completion or assessment completion, show the existing stage/completion modal after the result and coach hint; do not begin another attempt. A side transition is explained by the hint before the next episode.

## Shared contract and lifecycle

- Game-core owns the episode profile, shot outcome, category/side classification, and verified valid interval. The web client uses that profile for rendering/cues; the server evaluates the submitted actual tap against the same profile and category rules.
- A shot request identifies the run, side, stage, episode/profile version, server-recorded attempt number, shot index, and actual episode-local tap time. The server rejects stale, duplicate, wrong-side, out-of-range, or version-mismatched submissions. A no-tap expiration replays the same server-recorded attempt number; only submitting a shot advances it. Repeated episodes can reuse local scene times, so monotonicity is enforced by attempt/shot identity rather than by comparing local tap times from different attempts.
- The server remains authoritative for progress and rewards. A no-tap expiration does not increment shot count or grant progress. Reconnect restores the current run and starts a clean episode lead-in rather than resuming halfway through an invisible or expired window.
- Bump the game-core and advanced-training bank versions for a changed deterministic contract. Already active runs are not silently interpreted under new rules: on version mismatch, show a clear restart message and start a new exercise run through the normal API. Preserve completed exercise records and rewards.

## Validation and release gates

- Offline validation for all 8 categories × 2 sides: eight full lead-in traversals, smooth positions/directions, at least 500 ms real valid press interval in both stages, exact category/side at interval start, middle, and end, and no scoring outside the existing rules.
- Unit and integration tests cover client/server deterministic agreement, boundary taps, missed interval, repeated attempt identity, wrong category/side, duplicate and late responses, reconnect, stage/side transition, and version mismatch. Verify that ordinary game outcomes are unchanged.
- Rendered mobile acceptance checks both sides of at least the first and a narrow category: demo pause, countdown, real button taps at early/middle/late valid times, every result-modal → coach-hint → covered-reset path, no visible teleport, and assessment cue disappearance after “1”.
- Local tests, CI, dev deployment SHA, runtime health, and authenticated browser acceptance are reported separately. No production release is implied by this design.
