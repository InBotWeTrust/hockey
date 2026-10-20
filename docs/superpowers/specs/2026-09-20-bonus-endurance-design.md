# Bonus Endurance And Catalog Progress Design

**Date:** 2026-09-20
**Status:** Approved conversational design, pending written review
**Target:** Dev only; production release is out of scope

## Goal

Add a fourth bonus-game track, «Выносливость», where the player survives a continuous three-to-four-minute run by starting at least one scoring shot inside each short goal window. In the same release, make daily-attempt progress and card completion state visually consistent with the training catalogs.

## Product Scope

- Add the `endurance` skill beside `speed`, `accuracy`, and `marksmanship`.
- Seed seven sequential endurance games on the existing amateur court with the existing amateur goalkeeper art.
- Give endurance 100 new attempts per user-local day on dev. Resuming an active attempt does not consume another attempt.
- Preserve the existing catalog access rule: games 1–2 are visible to beginners; games 3–7 require full amateur access.
- Reward the first completion of each endurance game with 0 coins, 1 star, and 1 experience. Replays give no reward.
- Do not add locations, arena ownership, new art, sound, records, leaderboards, or production economy tuning.

## Endurance Rules

Each game has one period, no break, no shot quota, and no inventory.

| Game | Total duration | Goal window |
| --- | ---: | ---: |
| 1 | 03:00 | 7.0 seconds |
| 2 | 03:10 | 6.5 seconds |
| 3 | 03:20 | 6.0 seconds |
| 4 | 03:30 | 5.5 seconds |
| 5 | 03:40 | 5.0 seconds |
| 6 | 03:50 | 4.0 seconds |
| 7 | 04:00 | 3.0 seconds |

The total timer uses uninterrupted server wall time from period start. Flight time, result animation, backgrounding, reloads, and connection loss do not pause it.

The first goal window starts when the period becomes playable. A shot is eligible for the current window when its authoritative shot-start timestamp is at or before the window deadline. A goal from an eligible shot resets the window even if the server response arrives after the old deadline. A save or miss never resets it.

After a confirmed goal, the next window starts when the deterministic shot flight and mandatory result pause have ended and the player can shoot again. The server derives this readiness timestamp from the authoritative shot start, configured puck flight time, and the shared one-second result pause. The client may display the full next-window value during the forced goal animation, but cannot choose or extend the deadline.

The attempt succeeds when the total deadline is earlier than or equal to the current goal-window deadline. It fails when the goal-window deadline is earlier than the total deadline and expires first. This ordering makes an exact tie a success. Reconciliation compares absolute timestamps rather than request arrival order.

## Authoritative State And Contracts

Extend `BonusSkillCode` and its SQL constraints with `endurance`. Add this qualification variant to server, web, and admin contracts:

```ts
type EnduranceQualificationRules = {
  type: 'survive_goal_windows';
  activeTimeMs: number;
  goalWindowMs: number;
};
```

Validation requires:

- exactly one period;
- `activeTimeMs` equal to the period duration;
- `goalWindowMs` from 1,000 through 60,000 milliseconds;
- `shotsLimit: null`;
- `breakDurationMs: 0`;
- `useInventory: false`.

The legacy non-null `target_goals` field remains `1` for endurance definitions and snapshots but has no qualifying meaning. This avoids a broad schema rewrite in the dev iteration.

Add nullable `goal_window_started_at` and `goal_window_ends_at` timestamps to `bonus_game_attempt`. They are populated only while an endurance period is active and cleared when the attempt closes. Expose them as `goal_window_started_at` and `goal_window_ends_at` in the attempt HTTP DTO. The immutable rules snapshot carries `activeTimeMs` and `goalWindowMs`, so admin edits affect only new attempts.

Add `goal_window_timeout` to the period-log closed reasons. Endurance completion continues to use the existing first-clear completion, reward, arena-unlock, and economy-event transaction.

The server must settle these cases atomically and idempotently:

- a duplicate accepted shot returns its stored result without another goal-window reset;
- concurrent retries cannot grant two completions or rewards;
- a goal whose shot began before the window deadline is accepted after the deadline;
- a shot begun after the window deadline is not stored;
- a save or miss begun before the deadline does not defer failure;
- reconciliation after reload or reconnect produces the same winner and timestamps as uninterrupted play.

No shot-resolution formula changes are required, so `GAME_CORE_VERSION` remains unchanged unless implementation discovers an actual game-core contract change.

## Catalog And Attempt Progress

The catalog hierarchy is:

1. Back button and «Бонусные игры» title.
2. Skill chips: «Скорость», «Точность», «Меткость», «Выносливость».
3. Daily-attempt progress for the selected skill.
4. Bonus-game cards.

Replace the current text-only attempt row with a full-width progress section using the training progress-bar visual language. The bar fill is `remaining / dailyLimit`: 2/2 is full, 1/2 is half, and 0/2 is empty. Under the bar, show `{remaining} из {dailyLimit} попыток` on the left and `До обновления HH:MM:SS` on the right.

The progress section updates immediately when the selected chip changes, after a new attempt is reserved, and after the reset countdown reaches zero and the catalog refetch succeeds. Continuing an active attempt does not change the fill. Marksmanship and endurance show their dev allowance, for example `100 из 100 попыток`.

Expose the bar as an accessible progressbar with minimum 0, current value `remaining`, maximum `dailyLimit`, and a selected-skill-specific accessible name. Keep the text row live but do not repeatedly announce every one-second countdown tick. Reserve the block height during catalog loading to avoid layout jumps.

## Bonus Card Status Design

Every featured and compact bonus-game card has a status pill at the card's top-right:

| Catalog state | Copy | Tone |
| --- | --- | --- |
| `completed` | «Пройдена» | green |
| `available`, `in_progress`, or any resumable active attempt | «Не пройдена» | yellow |
| `level_locked`, `sequence_locked`, `purchase_required`, or `archived` without an active attempt | «Закрыта» | gray |

Exhausting the daily attempt allowance does not change progression status: an otherwise available unfinished game remains yellow while the attempt progress block and disabled action explain the temporary restriction.

For completed games, remove the existing card-corner completion marker and render the same circular check badge used by training exercises at the bottom-right of the artwork. The badge partially overlaps the artwork border and appears on both featured and compact cards. Non-completed cards have no check badge. Locked artwork keeps its current grayscale treatment.

The card chevron remains governed by actionability: show it for a resumable attempt or a playable game with a remaining attempt; hide it for locked, exhausted, and non-actionable cards. The status pill is informational and does not become a separate control.

## Play Screen

The endurance play HUD makes the goal-window timer primary:

- large label `ДО ГОЛА` with tenths displayed at all times, such as `7,0` through `0,0`;
- secondary `ОСТАЛОСЬ MM:SS` total timer;
- current game number and goal count;
- a warning color and restrained pulse as the goal deadline approaches, disabled under reduced motion.

The client derives both countdowns from server timestamps and the response's `server_now`, then advances them against a monotonic local clock. It requests reconciliation when either deadline is reached, when connectivity returns, and when the document becomes visible. It never declares the terminal result from local time alone.

Failure copy is «Не успел забить» and includes survived time and goals. Success includes the completed duration, goals, and the existing first-clear reward presentation.

## Administration

The bonus-game admin supports `endurance` definitions and exposes two editable fields:

- total active duration (`activeTimeMs`), synchronized with the single period duration;
- goal window (`goalWindowMs`).

The editor hides irrelevant goal, point, streak, shot-quota, break, and inventory controls for endurance or renders them read-only at their required values. Server validation remains authoritative. Editing an active definition increments its revision and does not mutate existing attempt snapshots.

## Verification And Acceptance

Use regression-first development: every new rule starts with an observed failing focused test, followed by the smallest implementation and a passing rerun.

Server coverage must prove qualification validation, migration data, daily allowances, access sequencing, window initialization, goal reset, non-goal behavior, exact-deadline boundaries, total/window precedence, duplicate and concurrent requests, reload reconciliation, and single reward settlement.

Web coverage must prove the fourth chip, endurance copy, the two synchronized timers, tenths, warning state, terminal screens, progress-bar semantics for 2/2, 1/2, 0/2, and 100/100, chip switching, reset refetch, card status mapping, artwork check placement, and unchanged chevron behavior.

Admin coverage must prove creation, editing, serialization, and rejection of incompatible endurance settings.

After focused suites, run relevant package tests, repository typecheck, lint, and build. Merge through a PR targeting `dev`, verify the exact deployed SHA, then perform browser acceptance on supported small-phone widths:

- complete endurance game 1 in a real session;
- fail by allowing the goal window to expire;
- reload or background an active attempt and confirm the server-authoritative result;
- switch all four chips and verify their allowance progress;
- inspect featured and compact cards in completed, unfinished, and locked states.

Production deployment and production acceptance remain separately authorized work.
