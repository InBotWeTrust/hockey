# Cyberpunk Yard effects design

Status: proposed implementation details for review. No gameplay code changed.
Branch: `feature/cyberpunk-yard-effects`.
Base: `origin/dev`, `9b1dd5c494eb08fb06e838ed69fe654ac062e59b`.

## Intent and boundaries

Keep the tap-to-shoot game and give the yard three readable difficulties: player fatigue, magnetic strips, and power outages. Use the existing arena, preview and goalkeeper. Do not change rink geometry.

The current challenge is **18 accuracy points in 150 seconds**, with unlimited shots. Preserve that objective, qualification, IDs, rewards, progress, base speeds. Change the goalkeeper pattern to linear with amplitude 1 for full board-to-board travel, leaving the existing sprite-safe board margins. Preserve the configured frequency until rendered acceptance establishes whether it needs adjustment. The earlier suggested story about a required number of goals must instead describe accuracy points. The objective is not 18 goals.

Local implementation and acceptance first. No push, merge, deployment or dev/prod data writes in this task until separately authorized. Production Challenges remain closed through both the tab and direct launch guards. Existing attempts keep their immutable snapshots and original behavior.

## Proposed rules

### Player condition

Reuse `BonusChallengeFatigueRules`, integrated movement clocks and existing player poses, rather than introducing another fatigue engine.

- Cycle: first slowdown at 12 s, heavy fatigue at 24 s, rest at 36 s.
- Rest lasts 4 s; recovery lasts 6 s; the cycle repeats.
- Fatigue multipliers: 0.85 and 0.65, applied to the existing base player multiplier 1.10.
- Three seeded 800 ms stumbles per cycle, on moving portions; postpone through an accepted shot or rest. Stumble movement uses 30% of the current speed and blocks shooting.
- The notice shows actual reduction relative to ordinary bonus speed. Before actual slowing, display a neutral yard notice rather than negative fatigue percentages.

### Magnetic strips and panel

- Six strip zones inside the playable ice, positioned in shared normalized rink coordinates. Use those same coordinates for rendering and flight intersections.
- Twenty seeded events in 7.5 s windows, choosing random zones. One strip at a time. Each event warns for 1 s and is active for 3 s; at least 3 s of inactive time between events. Each strip spans 50% of rink width, with edges converging toward the far center.
- Warning: subdued violet pulse. Active: brighter narrow strip, travelling light and small sparks. Markings and puck stay visible.
- Inside an active strip the puck travels at 10% of its ordinary configured speed. It does not change horizontal direction, stop permanently or disappear.
- Flight is integrated across strip boundaries and activation/deactivation times, so a strip switching during a flight affects only that portion. Goalkeeper/goal collision time follows the actual arrival time.
- An accessible panel button is available while a strip is active. Three accepted taps shut down the current event until its scheduled end. Next event begins normally.
- The panel shows remaining taps. Taps do not shoot and remain available during player rest/stumbles. Disable them during shot flight/result reconciliation to avoid conflicting histories.
- Accepted taps are at least 180 ms apart. Server validates ownership, period, event identity, scene history and wall-clock freshness. Request UUID makes identical retries idempotent; altered payload with the same UUID is rejected.
- Render confirmed progress plus local pending feedback. An error restores confirmed progress with a short Russian message. A late response cannot resurrect an expired event or overwrite a newer attempt.

### Power outages

- Ten independently seeded outages spread over the match. Two brief lamp flickers warn for 1 s, then darkness lasts 5 s.
- Outages and strips may overlap, as explicitly requested in the latest design feedback. This is visibility only: it never changes motion, score, collision or shooting availability.
- Dark overlay is clipped to the ice scene. Player, goalkeeper, goal, puck and scoreboard dim to 16% brightness. The breaker and controls remain readable.
- Avoid full-screen white flashes. Reduced-motion mode uses a steady warning and dimming.

### One notice

Content-sized notice, capped at menu width. Priority: rest, stumble, active magnetic strip, emergency light, fatigue, ordinary yard state. Restore the currently relevant state after an effect ends; do not queue obsolete messages.

- Rest: red, «Передышка · бросок недоступен».
- Stumble: orange, «Игрок споткнулся».
- Magnet: violet, «Магнитная полоса тормозит шайбу».
- Outage: amber, «Сбой питания · аварийный свет».
- Fatigue: yellow or red by severity, actual slowdown percentage.

## Shared implementation contract

Add versioned `challengeEnvironment.cyberpunk` with immutable attempt seed. All schedules, accepted panel events and puck flight integration live in game-core; the client and server consume the same functions. Bump core version and retain compatibility with core 75 attempts. Enable new behavior only for the cyberpunk slug and the new snapshot field/version.

Reuse perspective collision resolution and existing rebound/haptic paths. The magnetic flight resolver supplies arrival times and sampled positions; it does not implement a separate goal/save/miss system. Cache schedules and samplers by attempt/period/history, not by changing DTO object identity.

Persist panel events in a dedicated append-only table with attempt/period/event references. Expose confirmed event history in the attempt DTO. A catalog migration updates only future cyberpunk snapshots and truthful preview copy; it does not rewrite attempts.

Preview story draft: «Во дворе перегревается электросеть. Свет моргает, а подо льдом включаются магнитные полосы. Набери 18 очков меткости за 2 минуты 30 секунд, пока площадка не погасла.» Final cinematic remains deferred.

## Acceptance checklist

- [ ] RED then GREEN: cyberpunk goalkeeper moves continuously between both sprite-safe board limits; no stationary dash intervals. Client and server use the same linear config. Existing attempt snapshots retain their dash config.
- [ ] RED then GREEN: seeded schedule, gaps, end-of-period boundaries and strip switching mid-flight.
- [ ] RED then GREEN: three panel taps, duplicate UUID, changed retry payload, rapid taps and wrong ownership.
- [ ] RED then GREEN: shared client/server collision result with delayed puck arrival and accepted shot pauses.
- [ ] RED then GREEN: rest/stumble shot block, panel during rest, no player teleport at effect boundaries.
- [ ] RED then GREEN: late panel replies, failure rollback, repeated start/tap and return to tab.
- [ ] Old snapshots and other modes retain existing paths; production launch stays forbidden.
- [ ] Local package tests/typechecks/builds and diff review; report baseline failures separately.
- [ ] Local browser actual attempt: preview, start, three panel taps, blocked/accepted shots, outage visibility, rebound, rest and tab return.
- [ ] Dev deployment authorized on 2026-10-03; real dev acceptance is separate.

Local tuning approved: 20 strip events per 150 seconds across six zones, 1-second warning and 3-second activity; ten light outages. Entity brightness 16%; goalkeeper speed reduced by 10%.

Follow-up tuning: independently seeded strip and outage schedules can overlap; random strip zones; outages include 1-second warning and 5-second darkness. Strip visuals use tapered polygons with stronger active edges. Local synthetic fixture checked; authenticated browser acceptance and deployment remain pending.

Breaker prop: generated transparent cabinet sprite replaces the text button. It enters from a deterministically chosen left/right edge at 46%, 53%, or 60% of rink height, between entity travel lanes. Warning starts entry; active strip permits three taps; strip disappearance starts 280 ms exit. Reduced-motion disables transitions.
