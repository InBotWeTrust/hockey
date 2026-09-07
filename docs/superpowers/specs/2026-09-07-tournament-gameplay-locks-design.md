# Tournament gameplay locks and daily aggregate removal

## Goal

Prevent training-like gameplay immediately before or during a tournament game while preserving bonus games as an explicit exception. The rules must work across local-day boundaries and be enforced by the server, including concurrent clients.

This change also removes the obsolete `daily_aggregate` tournament format and all data associated with tournaments of that format.

## Terminology

- **Cooldown-producing modes:** amateur training, the normal daily game, and ordinary non-tournament amateur duels.
- **Bonus games:** bonus challenge games. They neither create nor obey the locks in this design.
- **Classic tournament game:** a regular-season tournament game whose source is `classic` and which has no fixed start time within its 24-hour availability window.
- **Scheduled tournament block:** a playoff or another tournament block with a concrete scheduled start time.
- **Last gameplay activity:** the latest server-accepted shot in any cooldown-producing mode.
- **Tournament lock:** a server-derived reason that prevents cooldown-producing gameplay.

## Core rules

### Rolling one-hour cooldown

Every server-accepted shot in a cooldown-producing mode sets the user's last gameplay activity to that shot's server timestamp. A Classic tournament game's first shot is unavailable until one full hour has elapsed since that timestamp. This rolling timestamp does not block continuation of the mode that produced it and does not generally block ordinary duel invitations.

The cooldown is rolling: every subsequent accepted shot restarts the hour. It is based on absolute timestamps and therefore survives midnight, timezone day changes, application restarts, and use of another device.

The existing mutual restriction between amateur training and the normal daily game changes from 30 minutes to one hour. Once either mode has an accepted shot, that mode may continue normally, but the other cannot start until one hour after the latest shot. Ordinary-duel activity delays a Classic tournament start but does not participate in this training-versus-daily mutual restriction.

### Starting a Classic tournament game

Opening the game, selecting inventory, or pressing a preparatory UI button does not start the tournament lock. The Classic game starts when its first shot is accepted by the server.

The server must atomically do both of the following for that first shot:

1. verify that no cooldown or other tournament lock prevents the start;
2. accept the shot and activate the Classic tournament lock.

If another client starts cooldown-producing gameplay between opening the tournament screen and submitting the first shot, the tournament shot is rejected with refreshed state. This prevents simultaneous starts from two devices.

After the first accepted shot, training, the normal daily game, and ordinary duels remain unavailable until the whole Classic game is completed. Period breaks do not release the lock. The one-hour duration is an expected game window, not an automatic unlock deadline: an unfinished Classic game remains blocking after one hour.

### Scheduled tournament blocks

A scheduled tournament block creates a lock starting one hour before its scheduled start. The lock remains active until the block is factually completed, even if play lasts longer than one hour. If the block completes early, its lock ends immediately unless another independent lock is active.

The lock is calculated from absolute timestamps and therefore also applies when the pre-game hour or the block crosses midnight.

Multiple reasons combine. Removing one reason must not unlock gameplay while a cooldown, another tournament block, or an active Classic game still applies.

### Preventing overlap with the pre-game hour

The system must not knowingly allow a new period or duel to begin if its maximum active segment can extend into the one-hour pre-game lock.

For every cooldown-producing start action, the server calculates the latest safe start from the nearest scheduled tournament block and the maximum duration of the segment being started. If the segment can cross the lock boundary, the start action is rejected before gameplay begins.

This keeps already accepted periods and duel segments intact instead of interrupting them at the boundary. The server-side shot guard remains a fallback for stale clients and concurrent requests.

## Ordinary duel availability

While a scheduled pre-game lock or an active tournament lock prevents ordinary duels, the user:

- cannot send a duel invitation;
- cannot accept an existing invitation;
- cannot enable the setting that exposes them as available for invitations;
- is not returned as available in opponent search;
- cannot start a duel period or submit duel shots.

Existing invitation messages remain visible, but their actions are disabled with a neutral explanation. The system must not overwrite the user's stored availability preference merely to hide them during a temporary lock. When the lock ends, opponent search derives availability from the saved preference again.

Creating or reading chat messages remains available.

Tournament duels are not treated as ordinary duels and remain accessible as the tournament activity that caused the lock.

## Bonus-game exception

Bonus games remain available before and during tournament locks. They do not update last gameplay activity and do not delay a Classic tournament start. This is an explicit temporary product exception even though bonus games contain shots.

## User-facing state

All affected entry points must use the same server-derived lock state and end time. The UI may display a countdown or explanation, but it must not independently decide eligibility from a cached local-day flag.

Messages distinguish the reason:

- recovery after the last training, daily, or ordinary-duel shot;
- upcoming tournament game and its start time;
- active Classic tournament game;
- active scheduled tournament block.

When a lock expires or a tournament finishes, clients refresh the relevant game states. Server enforcement remains authoritative if a client is stale.

## Removing `daily_aggregate`

`daily_aggregate` is no longer a supported tournament regular-season source.

The implementation must:

1. remove it from admin creation and editing controls;
2. remove it from accepted server configuration schemas and runtime branches;
3. remove client catalogue, schedule, standings, and label branches that exist only for this source;
4. add a forward migration that physically deletes every tournament whose regular source is `daily_aggregate` and all dependent applications, participants, schedules, games, standings, results, and other tournament-owned records;
5. leave `classic`, `head_to_head`, playoff data, ordinary daily-game data, and unrelated user data untouched.

No currency, stars, experience, or inventory reversal is required because these tournaments issued no rewards. The migration must select roots strictly by `regular_source = 'daily_aggregate'`, rely on verified dependency order or foreign-key cascades, and be safe to run more than once.

Historical specification documents remain unchanged; this specification supersedes their statements that describe `daily_aggregate` as supported.

## Server boundaries

Eligibility must be centralized in a server service that returns structured blocking reasons rather than duplicated booleans in individual routes. Its inputs are the user, current server time, last accepted activity and its source mode, active Classic state, scheduled blocks, and the action being attempted. The action and source mode are required so a mode can continue after its own shot while an incompatible mode remains blocked.

Every mutating endpoint performs the relevant check inside the same transaction or serialization boundary as its state change. Read endpoints expose the derived state for presentation, but a successful read never reserves permission for a later write.

The implementation must preserve the existing deterministic shot simulation and result calculation. The new service controls whether an action may start or proceed; it does not change shot outcomes, movement speeds, inventory effects, scores, or tournament settlement.

## Compatibility and failure handling

- A stale client receives the existing public conflict response pattern and then refreshes state.
- Existing active cooldown-producing segments at deployment are allowed to reconcile normally; new starts immediately obey the new safe-start rule.
- An active Classic game is never unlocked merely because its expected one-hour window elapsed.
- A completed tournament block cannot continue locking gameplay through stale cached state.
- If lock-state lookup fails, mutating gameplay starts fail closed; read-only screens and chat remain usable.

## Test coverage

Server tests must cover:

- one hour from the latest accepted shot in training, daily, and ordinary duels;
- a new shot restarting the hour;
- cooldown persistence across midnight and different user timezones;
- atomic acceptance and rejection of the first Classic shot under concurrent state changes;
- Classic locking through period breaks and beyond one hour until completion;
- one-hour scheduled pre-lock, early completion, overtime, and crossing midnight;
- overlapping scheduled and cooldown reasons;
- safe-start rejection when a period or duel can overlap the pre-game hour;
- invitation creation, acceptance, search visibility, availability setting, period start, and shot submission during a tournament lock;
- continuation of the source mode during its own rolling cooldown without accidentally blocking itself;
- restoration of derived duel visibility without mutating the stored preference;
- bonus games remaining unaffected;
- idempotent deletion of `daily_aggregate` data without deleting other tournament formats.

Web tests must cover consistent disabled states and explanations at each entry point, refresh after expiry or completion, and stale-client conflict recovery.

Regression tests must confirm that gameplay calculations, inventory consumption, and tournament settlement are unchanged.

## Acceptance criteria

- A user cannot use training, the normal daily game, or an ordinary duel during the hour immediately preceding a scheduled tournament block.
- A user who has made any cooldown-producing shot cannot start a Classic tournament game until one hour after the latest such shot, including across midnight.
- Once tournament play starts, cooldown-producing modes remain unavailable until the tournament game or block completes.
- No active gameplay segment is unexpectedly terminated at the pre-game boundary.
- Ordinary duel invitations and discoverability cannot bypass the lock.
- Bonus games remain available.
- `daily_aggregate` cannot be configured or executed, and its existing tournament-owned data is deleted without affecting supported formats.
