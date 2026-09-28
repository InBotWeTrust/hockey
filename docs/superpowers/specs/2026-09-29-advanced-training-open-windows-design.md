# Advanced training: seeing open shot windows

## Intent and boundaries

Replace only the advanced training course. Its purpose is to teach a player to
notice an open shot window, anticipate it, decide whether to shoot or wait, and
gradually maintain those decisions at a three-minute pace. Beginner training,
ordinary match rules, shot physics, and scoring categories are outside this
change. A category may be displayed in match statistics but is never the
required answer to a lesson.

The current advanced course on dev is not a behavioral or motion reference. It
asks for exact category-and-side repetitions and uses a custom episode sampler
that pulls the shooter, goal, and goalie toward fixed coordinates, leaving them
almost stationary near the shot. The replacement must run all three entities
through ordinary deterministic first-period daily-game motion at the first-period
speed preset. It must not teleport, blend toward a target, slow the scene for a
shot, or substitute an exercise-only trajectory. Pausing at an explicitly marked
demonstration frame or between attempts is allowed; all active skating runs at
normal first-period speed.

This is a course for transferable decisions, not a tutorial on how to trigger
the current classification system. The user should leave willing to shoot away
from the boards, yet understand that easy and risky shots coexist, excess risk
is unhelpful, and sometimes skipping one traversal is sensible. No fixed ratio
of easy to risky shots is imposed. The suggested 3–4 easy / 1–2 risky pattern
is an observation to test against match data, not a rule for progression.

## Course structure

Four stages have three small steps each. Each step has a demonstration,
practice, and a short check. Practice attempts are unlimited; a failed check
returns the player to practice with specific feedback. In-step feedback is
formative. A single goal or miss never determines mastery. The final stage is
not introduced until the player can make reasonable decisions without a timer.

| Stage | Step 1 | Step 2 | Step 3 |
| --- | --- | --- | --- |
| Notice | Identify the open path in a paused frame | Recognize the path during movement | Choose a shot window in varied scenes without a cue |
| Anticipate | Read shooter, goal, and goalie directions | Shoot as the path is opening | Distinguish early, timely, and late decisions at normal speed |
| Decide | Separate reasonable risk from a blocked shot | Skip a poor traversal without waiting only for perfection | Choose through a mixed sequence of easy and risky opportunities |
| Keep pace | Maintain quality through a short series | Increase pace without a surge in blocked shots or misses | Transfer the skill to repeated three-minute runs |

The order is intentional: recognizing an existing window precedes predicting
one; choosing whether to use it precedes any time pressure. Every scene used
for a check differs from the exact demonstration trajectory, so memorizing one
seed or one tap timestamp is insufficient.

## Demonstration, practice, check

Demonstrations use selected real-simulation seeds, beginning several traversals
before an opportunity. The scene runs continuously, stops at a teachable frame,
and points out the relevant spatial relationship in plain Russian. It then
resumes through the shot and outcome. Early demonstrations may stop before and
at an open window. Later demonstrations stop less often and explain only after
the run. No countdown or imperative “Бросай” is shown during a player's
independent decision.

Practice uses a permanently available shot action. A shot opens the normal
result presentation, followed by a short explanation of the decision and an
explicit next-attempt action. Restarting begins at a natural earlier point in
the deterministic trajectory, never by repositioning moving figures. On later
steps, feedback moves from every shot to the end of a short series so it does
not repeatedly interrupt the skill of maintaining pace. A player may repeat
practice and view demonstrations without losing progress.

Checks run unseen variants at normal first-period speed with no mid-scene
timing cue. Early checks are short, with no time limit. Checks assess the
decision required by that step, rather than demanding a named category, side,
or goal every time. A good decision followed by a miss is recognized as a good
decision with a missed execution; an accidental goal does not erase a pattern
of poor decisions. The final check consists of multiple full three-minute
runs and reports decision quality and goal throughput separately. It does not
claim that one run establishes a stable skill level.

The pace stage uses continuous skating through each series and all three
minutes of each final run. A shot advances the ordinary shot index and game
state; it does not reset to another pre-authored one-shot episode. Its timer
counts active game time, not pauses for a result or a coaching explanation.

## Window and feedback model

Use the same deterministic simulation and shot resolver as the daily game.
For a selected seed and time span, sample candidate tap times and group
contiguous successful times into open-window intervals. Stage 1 teaching and
check scenes must provide at least one interval of 200 ms or more; stage 2
scenes must provide at least one interval of 160 ms or more. Later stages mix
broad and narrow intervals without filtering them to a single named category.
These lower bounds are scene-selection rules, not altered simulation speeds or
guaranteed human reaction times. Retain the geometry
and motion at the shot and puck-arrival times to explain why an interval
opens or closes. The scene bank is generated and validated against the pinned
game-core version; changing that version requires validating or regenerating
the bank. The bank must contain broad teaching windows for early steps and
varied, realistic windows for later steps. A bank entry that cannot reproduce
its documented opportunity at the first-period preset is rejected, rather than
"fixed" by moving entities artificially.

Feedback separates opportunity choice, timing, and shot result. A choice is
relevant when a shot is inside a sampled successful interval or within 100 ms
of one of its edges. Timing is exact when the tap is inside the interval; a
near-edge shot outside it is labelled early or late and can miss despite a
reasonable choice of opportunity. A shot farther away is a blocked-path or
unrelated attempt, explained using its actual geometry. Result labels remain
goal, save, and miss. Stage 1 checks whether the player noticed a relevant
opportunity; stage 2 checks whether the shot landed inside the interval;
stages 3 and 4 also judge a bounded decision to shoot or skip. Thus a miss
can show correct recognition with imperfect timing, while one goal alone
does not establish a reliable decision pattern. Explanations name visible
causes: the goalie still covered the path, the path opened as the goal moved,
or the opening had closed. They do not show milliseconds, internal coordinates,
or category names as the main lesson. Window width and spatial clearance can
explain relative risk, but a narrow successful window is not automatically an
error. A skip is judged only in a bounded episode or series; free waiting
without a defined observation span is not scored as an error.

Progression is intentionally not a hard goal-count ladder. For the first
three stages, the check presents five unseen decision opportunities and
advances when at least four decisions match the lesson's window/skip criteria.
The player can retry without a daily attempt cap. For the pace stage, the
first two checks use short series and require at least four sound decisions
out of five; the final check records two complete three-minute runs and
completes on participation, displaying goal rate and decision quality without
an unvalidated population cutoff. These thresholds are course-completion
rules, not claims about the player's competitive ranking. Real-player testing
may change them in a separately reviewed balance change.

## Movement, state, and compatibility

All active advanced-course motion and shot outcomes come from first-period
daily-game simulation, using `getDailyPeriodSpeedPreset(1)` as the source of
truth rather than copied literals. The course can select seeds and start
times, but cannot change entity positions or frequency curves to manufacture
a result. The client renders the same sampled state that the server validates.
The server remains authoritative for attempt identity, shot order, timing,
result, and one-time course rewards. Retries and network duplicates are
idempotent; reconnect restores a consistent run or starts a new attempt at
an explicit boundary, never half-way through a different trajectory.

The old category-based course is replaced in the advanced-training surface,
not silently repurposed under the same progress semantics. A separately
versioned course state and completion record keeps old history interpretable.
Existing completed old exercises remain historical records; they do not imply
completion of the new decision course. Active old runs receive a clear restart
message and are not evaluated under new rules. Each of the four new stages
grants its existing-style reward once (one star and one experience point);
substeps and retries grant none. Old rewards are not revoked. Replays, request
duplicates, and concurrent requests cannot grant a stage reward twice.
Beginner exercises are unaffected.

## Delivery and evidence

Implementation begins with a regression test reproducing the near-stationary
episode movement. Tests must then prove that shooter, goal, and goalie match
daily first-period samples over full traversals, with no pre-shot convergence,
that selected windows reproduce across client/server seeds, and that good
decisions are evaluated separately from outcomes. Cover unseen-check scenes,
skips, duplicates, reconnection, old-run compatibility, and one-time rewards.

Before dev release, run relevant game-core, server, and web checks, inspect
the diff, and visually play all four stages in the in-app browser at a mobile
size. Confirm actual movement speed against the first daily period and verify
that the course teaches mixed easy/risky opportunities. Release only to dev
through the repository workflow, verify deployed commit provenance, and test
the deployed course there. Production data and runtime remain untouched.
