# Open-window training: first three lessons

## Purpose and scope

Replace the first three **advanced** exercises with a prototype that teaches a player to notice an open path from the puck to the goal before asking them to shoot. The player should be able to explain the visual cue in their own words and recognize it in a real match segment. Beginner exercises, ordinary game scoring, and the remaining advanced course are outside this prototype. This document describes a design for review, not a release decision.

The existing advanced course treats a game-core goal interval as the answer and asks the player to reproduce it. That is insufficient evidence that the opening is perceptible to a human. The prototype must validate the rendered scene and teach a visible reason for the decision. Goals and named shot categories do not determine success in these lessons.

## Learning sequence

All decisions occur at the same motion speed as the first period of a daily game. The scene may pause for explanation only before the player's first independent decision or after an answer. There is no countdown, automatic shot, hidden tap correction, or requirement to hit an exact frame.

1. **Show the opening.** Play one authored, visually obvious scene from a closed path to an open path. Pause at a clearly open moment. Highlight the puck-to-goal path, show a shot continuation, then explain: “Вратарь сместился, и появился путь к воротам. Вот такой момент мы будем искать. Не обязательно попасть — важно его заметить.” The player observes; there is no scored input.
2. **Find it yourself.** Play three short authored scenes with an opening at different times and one scene with no usable opening. The player has “Вижу шанс” and can let the scene end without pressing. A press records the actual scene time. After each scene, replay the decisive part with the path visible and explain whether it was open, still closed, or already closed. A correct non-press on the closed scene is a good decision; an unpressed open scene is a missed opportunity, not a failed shot.
3. **Recognize it in a match.** Play manually curated segments reconstructed from recorded games, without hints while the segment runs. The player again marks an opening or lets the segment end. A replay highlights the visible path and explains the answer. Recorded shots and labels may supply candidate segments, but every segment must be reviewed on the actual mobile rink before it is included. It cannot be accepted solely because an engine interval or recorded goal says “open.”

The first three lessons end before the player is asked to shoot. The later course design introduces throwing, deciding to skip, and maintaining pace; it is not implemented by this prototype.

## Scene selection and decision contract

Each scene has a fixed versioned source, playback start/end, a human-reviewed open interval or an explicit closed classification, and a short explanation tied to what is visible. The engine's deterministic shot and geometry calculations can nominate and verify candidate moments, but are not the sole acceptance criterion. At normal mobile size, a reviewer must see a meaningful puck-to-goal path without diagnostic overlays. A selected opening must remain usable for at least 700 ms of real playback time at the first-period speed; this is a content-selection minimum, not a modification to ordinary shot rules. Reject scenes whose rendered motion looks like entities barely moving in place.

The decision API records the scene ID/version and actual tap time, or a completed no-tap scene. Server-side evaluation uses that same versioned scene. An open-window press is correct within a documented, human-playable response interval around the visible opening; the interval is chosen from rendered evidence and measured in real elapsed time. A closed-scene non-press is correct. Taps outside an opening receive “too early,” “too late,” or “closed path” feedback. Do not silently move a tap into the interval. No shot result, goal category, or reward is inferred from these observation-only inputs.

For a recorded match segment, preserve its original motion and source attribution in the content bank; do not imply that a reconstructed shot was made by the learner. The segment must be self-contained and must not display another player's personal data beyond the game recording already approved for the constructor.

## Feedback and progression

Feedback describes the choice separately from any later puck outcome:

- Good press: “Да, путь к воротам был открыт. Ты заметил шанс.”
- Early: “Пока рано: вратарь ещё закрывал путь. Посмотри, куда он движется.”
- Late: “Просвет уже закрылся. В следующий раз отмечай его чуть раньше.”
- Good skip: “Правильно подождал: свободного пути не было.”
- Missed opening: “Здесь путь ненадолго открылся. Посмотри повтор и попробуй ещё раз.”

The explanation uses one visible reason and one next action, not millisecond values or shot-category names. Practice permits replay without punishment. To leave lesson 2, the player must demonstrate both an opening press and a correct closed-scene skip. Lesson 3 is a formative check: successful recognition and skipping are shown separately; no fixed numerical pass threshold is set for the prototype. This avoids turning an unvalidated set of clips into an arbitrary exam.

## Architecture and failure behavior

Keep the content bank and deterministic scene evaluation in game-core, authoritative progress in the server, and rendering/input/replay in web. Reuse the existing advanced-training route and mobile rink where practical, but do not preserve a goal-only scene contract if it forces incorrect teaching. A recorded-game segment may use the existing constructor replay fixture/timeline as a source; the lesson should store a small curated segment reference rather than download full match history during play.

If a scene or version cannot be loaded or reproduced, show a recoverable error and do not award progress. If a tap submission fails, retain the player's choice and offer retry; do not change the time of the decision. Reload/reconnect starts a scene cleanly and does not count an unseen segment as skipped. Legacy in-progress advanced runs must not be interpreted under the new lesson rules; completed records remain preserved. The prototype is dev-only until separate product acceptance.

## Validation

Automated checks cover deterministic motion and client/server agreement, open/closed scene classification, boundary taps, no-tap completion, retries/duplicates, reload, and version mismatch. They must also show no change to ordinary game outcomes or beginner exercises.

Rendered acceptance is required on a phone-sized viewport at the first-period speed: the opening is visible without overlays, the player has enough time to respond, closed scenes are genuinely closed, controls do not obscure the rink, and every replay explains the actual frame. Run an unprompted usability session with at least one experienced player who did not understand the old course. After lesson 3, ask: “По чему ты понял, что здесь стоило бросить?” If the player relies on a countdown, an overlay, or memorized scene timing rather than describing the path, the prototype has not met its learning goal.

Report automated checks, rendered acceptance, dev deployment SHA, and user feedback separately. Do not treat an exact-SHA deployment as proof that the lesson works.
