# Story Series One Design

## Goal

Turn the completed beginner onboarding into the first replayable story series in the profile’s **Сюжет** section while preserving the onboarding as a mandatory, non-dismissible first-run experience.

## Product contract

- Series 1 is titled **Путь со двора**.
- Its description is **Последняя шайба и случайная встреча.**
- Its artwork uses the cinematic beginner-onboarding imagery and must read clearly as the night courtyard story rather than a generic arena card.
- Series 1 is locked until `beginner_onboarding_completed` becomes true.
- After beginner onboarding completion, Series 1 is visibly unlocked and can be replayed from the beginning.
- Series 2–10 remain locked and keep their current placeholder treatment.

## Two launch modes

The cinematic sequence has one shared presentation and two explicit modes:

1. **Required onboarding**
   - Launched by `OnboardingGate` when the server requires the beginner chain.
   - Has no close control and cannot be skipped.
   - Completes the authoritative onboarding run through the existing server lifecycle.
   - The tutorial shot does not increment the player’s ordinary shot or goal statistics.

2. **Story replay**
   - Launched from unlocked Series 1 in `/profile/story`.
   - Starts at the first cinematic screen every time.
   - Shows a close button in the top-right corner on every screen, including the interactive shot.
   - Closing returns to `/profile/story` and does not save partial progress.
   - Does not create, view, or complete an onboarding run.
   - Its tutorial shot is local/replay-only and never changes player statistics, onboarding completion, inventory, achievements, or other server state.
   - Finishing the final screen returns to `/profile/story`.

## Story presentation

- Port the approved cinematic prototype’s images, copy, typewriter timing, punctuation pauses, fixed text layout, dialogue colors, buttons, headlight image transition, and real training-shot presentation into the web client.
- The gameplay scene reuses the production training/game renderer. The player moves as in the game, the puck uses the real puck asset and speed, the goal is static and centered, and no goalie, home button, sound button, or scoreboard is shown.
- The goal/miss result selects the matching story screen but does not affect persistent statistics.
- The beginner threshold displayed in the story is sourced from the same authoritative beginner-to-amateur goal requirement used by the application. It is not hardcoded in narrative copy.
- In required mode, the final action completes onboarding and enters the main application. In replay mode, it returns to the story list.

## Close control

- The replay close action is an accessible icon button with the label **Закрыть серию**.
- It is positioned in the top-right safe area and remains above scene imagery and copy.
- It is absent from required onboarding in both markup and accessibility tree.
- Closing is immediate because replay progress is deliberately disposable.

## Story catalog and completion data

- The authenticated profile response exposes `beginnerOnboardingCompleted` as a boolean sourced from `users.beginner_onboarding_completed`.
- `ProfileStoryScreen` uses that value to render Series 1 as locked or unlocked.
- The unlocked card is a button/link with title, description, artwork, and a completed status. The locked state is non-interactive.
- Completing required onboarding invalidates or refreshes the profile query so the unlocked card is visible immediately after the player reaches the application.

## Navigation

- Add a dedicated replay route under the profile story namespace, for example `/profile/story/series-1`.
- Direct navigation to that route checks the profile completion flag. An incomplete player is returned to `/profile/story` and cannot use the replay route to bypass onboarding.
- Browser back and the close action both return to `/profile/story` without changing completion state.

## Verification

- Server/profile tests prove the completion flag is returned accurately.
- Story-screen tests cover locked and unlocked Series 1, exact title/description, artwork, and navigation.
- Cinematic-flow tests cover required mode without a close button and replay mode with a close button on narrative and shot screens.
- Replay tests prove no onboarding lifecycle or tutorial-shot API requests are made.
- Required-mode regression tests prove completion still follows the authoritative server lifecycle.
- Rendered browser acceptance covers the story card, replay launch, close action, goal and miss branches, final return, and supported mobile widths.

## Out of scope

- Series 2–10 content or unlock rules.
- Persisting replay position or replay completion history.
- Rewards for replaying the series.
- Dev deployment before local tests, review, and explicit release confirmation.
