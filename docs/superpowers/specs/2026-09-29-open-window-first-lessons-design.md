# Open-window training: first three lessons

## Purpose and scope

Replace the first three **advanced** exercises with a prototype that teaches a player to notice an open path from the puck to the goal before asking them to shoot. The player should be able to explain the visual cue in their own words and recognize it in a real match segment. Beginner exercises, ordinary game scoring, and the remaining advanced course are outside this prototype. This document describes a design for review, not a release decision.

The existing advanced course treats a game-core goal interval as the answer and asks the player to reproduce it. That is insufficient evidence that the opening is perceptible to a human. The prototype must validate the rendered scene and teach a visible reason for the decision. Goals and named shot categories do not determine success in these lessons.

## Learning sequence

Moving scenes use the first-period daily-game speed. The first two lessons may stop the scene to explain or ask for an untimed visual judgment; the third runs at normal speed. There is no countdown, automatic shot, hidden tap correction, or requirement to hit an exact frame in the first two lessons.

1. **Show the opening.** Play one authored, visually obvious scene from a closed path to an open path. Pause at a clearly open moment. Highlight the puck-to-goal path, show a shot continuation, then explain: “Вратарь сместился, и появился путь к воротам. Вот такой момент мы будем искать. Не обязательно попасть — важно его заметить.” The player observes; there is no scored input.
2. **Find it yourself.** Show several authored scenes that stop at different, unannounced positions: some with a visible path and some with the path closed. At each stop the player chooses “Можно бросить” or “Лучше подождать” without a timer. Then show the path and a short continuation, explaining the choice. This checks recognition without confusing it with reaction speed.
3. **Recognize it in a match.** Play manually curated segments reconstructed from recorded games at first-period speed, without hints while the segment runs. The player marks a perceived opening or lets the segment end. A replay highlights the visible path and explains the answer. This is a formative check, not a millisecond-accuracy exam. Recorded shots and labels may supply candidate segments, but every segment must be reviewed on the actual mobile rink before it is included. It cannot be accepted solely because an engine interval or recorded goal says “open.”

The first three lessons end before the player is asked to shoot. The later course design introduces throwing, deciding to skip, and maintaining pace; it is not implemented by this prototype.

## Scene selection and decision contract

Each scene has a fixed versioned source, playback start/end, a reviewed decision frame or open interval, and a short explanation tied to what is visible. The engine's deterministic shot and geometry calculations can nominate candidates, but are not the sole acceptance criterion. At normal mobile size, a reviewer must see the claimed puck-to-goal path without diagnostic overlays. Do not impose a 700 ms goal interval: the current first-period scenes have observed goal windows under 400 ms. Reject scenes whose rendered motion looks like entities barely moving in place or whose answer cannot be explained from the frame.

The decision API records the scene ID/version and the selected open/closed answer for lesson 2, or the actual mark time/completed no-tap scene for lesson 3. Server-side evaluation uses that same versioned scene. Lesson 2 compares the answer against the reviewed paused frame, without timing. Lesson 3 compares a mark against the reviewed opening and reports whether it was early, within it, or late; this diagnostic does not gate progression. A no-tap closed segment is a good skip. Do not silently move a mark into the interval. No shot result or goal category is inferred from these observation-only inputs.

For a recorded match segment, preserve its original motion and source attribution in the content bank; do not imply that a reconstructed shot was made by the learner. The segment must be self-contained and must not display another player's personal data beyond the game recording already approved for the constructor.

## Feedback and progression

Feedback describes the choice separately from any later puck outcome:

- Good open answer or mark: “Да, путь к воротам был открыт. Ты заметил шанс.”
- Early: “Пока рано: вратарь ещё закрывал путь. Посмотри, куда он движется.”
- Late: “Просвет уже закрылся. В следующий раз отмечай его чуть раньше.”
- Good closed answer or skip: “Правильно подождал: свободного пути не было.”
- Missed opening: “Здесь путь ненадолго открылся. Посмотри повтор и попробуй ещё раз.”

The explanation uses one visible reason and one next action, not millisecond values or shot-category names. Practice permits replay without punishment. To leave lesson 2, the player must correctly identify at least one open and one closed paused frame. Lesson 3 is a formative check: recognition and skipping are shown separately, but completion follows viewing all curated segments rather than a numerical accuracy threshold. This avoids turning an unvalidated set of clips into an arbitrary exam.

## Architecture and failure behavior

Keep the content bank and deterministic scene evaluation in game-core, authoritative progress in the server, and rendering/input/replay in web. Reuse the existing advanced-training route and mobile rink where practical, but do not preserve a goal-only scene contract if it forces incorrect teaching. A recorded-game segment may use the existing constructor replay fixture/timeline as a source; the lesson should store a small curated segment reference rather than download full match history during play.

If a scene or version cannot be loaded or reproduced, show a recoverable error and do not award progress. If a tap submission fails, retain the player's choice and offer retry; do not change the time of the decision. Reload/reconnect starts a scene cleanly and does not count an unseen segment as skipped. Legacy in-progress advanced runs must not be interpreted under the new lesson rules; completed records remain preserved. The prototype is dev-only until separate product acceptance.

## Validation

Automated checks cover deterministic motion and client/server agreement, open/closed scene classification, boundary taps, no-tap completion, retries/duplicates, reload, and version mismatch. They must also show no change to ordinary game outcomes or beginner exercises.

Rendered acceptance is required on a phone-sized viewport: lesson 2's open/closed answer is understandable without a timer; lesson 3's motion is first-period speed without overlays or obstructed controls; every replay explains the actual frame. Run an unprompted usability session with at least one experienced player who did not understand the old course. After lesson 3, ask: “По чему ты понял, что здесь стоило бросить?” If the player relies on a countdown, an overlay, or memorized scene timing rather than describing the path, the prototype has not met its learning goal.

Report automated checks, rendered acceptance, dev deployment SHA, and user feedback separately. Do not treat an exact-SHA deployment as proof that the lesson works.
