# Bonus Games and Home Arenas Design

## Summary

This specification adds a linear series of ten bonus games for amateur and professional players. Each game has its own rink artwork, themed goalkeeper, deterministic rules, first-clear reward, and unlockable home arena.

The feature reuses the existing shared shot engine and `shot_session` table. It does not introduce a second shot-resolution implementation. The server remains authoritative for progression, purchases, timers, shot results, rewards, and arena ownership.

The work also adds home-arena selection in the profile locker room and applies the selected arena to current amateur duels when the player is the home participant. Automatic matchmaking receives an admin-configurable venue policy.

## Goals

- Add ten ordered bonus games with distinct locations and themed goalkeepers.
- Allow each game to be free or require a one-time star payment.
- Require completion of the previous active game before the next game can be opened.
- Award coins, experience, stars, and the location's arena on the first clear only.
- Allow unlimited reward-free replays after a game has been opened.
- Run bonus shots through the existing deterministic client/server simulation.
- Keep inventory and equipment effects entirely out of bonus games.
- Preserve an active attempt when the player leaves the screen; active period time continues on the server.
- Let players select a home arena from the default arena and arenas earned through bonus games.
- Apply an explicit, snapshotted venue to current amateur duels.
- Make gameplay, access, rewards, media, and matchmaking venue policy manageable through the admin UI.
- Create all required launch artwork: ten arenas, twenty goalkeeper sprites, and one section card image.

## Non-Goals

- No inventory, consumables, equipment bonuses, or loadout selection in bonus games.
- No reward for replaying an already completed bonus game.
- No offline bonus-game gameplay.
- No tournament implementation in this scope. The home-arena resolver must be reusable by future tournament scheduling.
- No new real-money payment flow. Paid bonus games use the existing star balance only.
- No player-owned arena marketplace, trading, or general cosmetic inventory.
- No change to shot hitboxes based on visible goalkeeper clothing or pose.
- No new goalkeeper movement algorithm in this scope. Launch options are the currently implemented `linear`, `sine`, and `dash` patterns.

## Access and Placement

The main Sections screen contains a `Бонусные игры` card between `Любители` and `Профессионалы`. It uses a new generated section image.

The card is visible to all authenticated players. Beginners see it locked with an explanation that the amateur level is required. The server uses the same competition-access rule as the amateur section; client-side hiding or route manipulation must never bypass it. Amateur and professional players can enter.

The initial ordered series is:

1. Пляж
2. Горнолыжный курорт
3. Киберпанк-двор
4. Заброшенный аквапарк
5. Пиратская бухта
6. Северный полюс
7. Пустыня
8. Вулканический лёд
9. Замок
10. Космос

The source location renders currently live under:

`/Users/egorgumenyuk/.codex/generated_images/019e6a7f-267b-78f1-b4d2-e79e4e751cb0`

Selected renders are copied into the repository, normalized for the game viewport, and assigned stable asset paths. Production must not depend on this local Codex directory.

## Progression and Unlock Rules

The active catalog is ordered by `sort_order`.

- The first active game has no previous-game prerequisite.
- Every later active game requires a completion row for the nearest active game with a lower order.
- Draft and archived games are excluded from the active chain.
- A completed game remains completed if the catalog is reordered.
- An archived game cannot start a new attempt, but an attempt that was active before archival can finish from its snapshot.
- Arena ownership earned from an archived game remains valid.

Free games become playable as soon as their previous-game prerequisite is satisfied. Paid games additionally require a one-time star unlock. Once purchased, all attempts for that game are free.

The server derives each card's state:

- `level_locked`
- `sequence_locked`
- `purchase_required`
- `available`
- `in_progress`
- `completed`
- `archived` for an active snapshotted attempt whose definition has since been archived

The client renders the server state and does not reproduce progression rules locally.

## Initial Launch Balance

All values are editable in admin. These are launch defaults, not hard-coded engine constants.

| # | Location | Access | Format | First-clear target | First-clear reward: coins / experience / stars |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | Пляж | Free | 1 × 30 shots | 18 goals | 100 / 50 / 1 |
| 2 | Горнолыжный курорт | 1 star | 1 × 30 shots | 20 goals | 150 / 75 / 1 |
| 3 | Киберпанк-двор | Free | 1 × 30 shots | 21 goals | 200 / 100 / 1 |
| 4 | Заброшенный аквапарк | 2 stars | 2 × 25 shots | 36 goals | 300 / 150 / 2 |
| 5 | Пиратская бухта | Free | 2 × 25 shots | 38 goals | 400 / 200 / 2 |
| 6 | Северный полюс | 3 stars | 2 × 25 shots | 40 goals | 500 / 250 / 3 |
| 7 | Пустыня | Free | 2 × 30 shots | 47 goals | 650 / 325 / 3 |
| 8 | Вулканический лёд | 5 stars | 2 × 30 shots | 49 goals | 800 / 400 / 4 |
| 9 | Замок | Free | 2 × 30 shots | 52 goals | 1,000 / 500 / 5 |
| 10 | Космос | 8 stars | 3 × 30 shots | 80 goals | 1,500 / 750 / 8 |

The complete series costs 19 stars and awards 30 stars. A zero-balance player can earn the first star on the beach and continue through the default chain without an external purchase, provided they clear each game.

The default period duration is four minutes and the default intermission is thirty seconds. The launch speed presets are:

| # | Pattern | Goal frequency by period | Goalkeeper frequency by period | Shooter frequency by period | Puck speed by period |
| ---: | --- | --- | --- | --- | --- |
| 1 | `linear` | 0.45 | 0.50 | 0.65 | 1.20 |
| 2 | `sine` | 0.45 | 0.55 | 0.68 | 1.20 |
| 3 | `dash` | 0.48 | 0.60 | 0.70 | 1.22 |
| 4 | `sine` | 0.50 / 0.52 | 0.60 / 0.65 | 0.70 / 0.72 | 1.24 / 1.26 |
| 5 | `dash` | 0.52 / 0.54 | 0.65 / 0.70 | 0.72 / 0.74 | 1.26 / 1.28 |
| 6 | `sine` | 0.54 / 0.56 | 0.70 / 0.75 | 0.74 / 0.76 | 1.28 / 1.30 |
| 7 | `linear` | 0.56 / 0.58 | 0.75 / 0.80 | 0.76 / 0.78 | 1.30 / 1.32 |
| 8 | `dash` | 0.58 / 0.60 | 0.80 / 0.85 | 0.78 / 0.80 | 1.32 / 1.34 |
| 9 | `sine` | 0.60 / 0.62 | 0.85 / 0.90 | 0.80 / 0.82 | 1.34 / 1.36 |
| 10 | `dash` | 0.62 / 0.65 / 0.68 | 0.90 / 0.95 / 1.00 | 0.82 / 0.85 / 0.88 | 1.36 / 1.40 / 1.45 |

Frequencies are cycles per second and puck speed uses the existing `puckSpeedPerMs` unit. Each value corresponds to its period from left to right. The bonus goalkeeper adapter uses `amplitude=1.0`, `goalAmplitude=220`, and zero for the legacy HP/reward fields, which are unused by bonus mode.

Admin can independently edit, per period:

- goal frequency;
- goalkeeper frequency;
- shooter frequency;
- puck speed;
- goalkeeper movement pattern;
- duration;
- shot limit.

The seeded speed values must remain within the existing validated ranges. A full dev playthrough is required before release; balance changes found during that pass are made through the seeded definitions or admin and recorded in the implementation handoff.

## Gameplay Flow

### Game List

Each game card shows:

- order and title;
- location preview;
- lock or completion state;
- price when purchase is required;
- target, periods, and shot limits;
- first-clear reward;
- arena reward;
- `Продолжить` when this game owns the current active attempt.

Locked cards explain the exact prerequisite. The UI never offers payment before the previous game is completed.

### Purchase

For a paid available game, the player confirms the one-time star price in a standard modal. A successful purchase immediately changes the game to `available`. Insufficient balance leaves both balance and access unchanged.

### Attempt Lifecycle

Only one bonus-game attempt may be active per user across the entire series.

1. Starting an available game creates an attempt and snapshots its rules, rewards, arena reward, media URLs, definition revision, and `GAME_CORE_VERSION`.
2. Starting the same game while its attempt is active returns that attempt for resume.
3. Starting another game while an attempt is active returns a conflict containing the active attempt ID.
4. A period begins only after an explicit start action.
5. Once a period starts, its server timer continues if the app is backgrounded or closed.
6. When a period reaches its shot limit or timeout, it closes. If periods remain, the attempt enters intermission and then waits for the player to start the next period.
7. Reaching the overall goal target completes the attempt immediately, even if shots or periods remain.
8. Exhausting the final period without reaching the target marks the attempt failed.
9. Failed and abandoned attempts can be restarted without another payment.
10. A completed game can be replayed without a reward.

Leaving the game screen does not abandon the attempt. The bonus-game list and game screen offer resume.

Every manual `Завершить попытку` action opens the standard `.modal-backdrop` / `.modal-card` confirmation dialog. The first tap cannot abandon the attempt. The destructive confirmation explicitly states that current progress will be lost while the game's paid unlock remains.

## Deterministic Simulation

Bonus games reuse `@hockey/game-core` and the hybrid client/server flow:

- the client resolves immediately for animation;
- the server resolves the same shot from the same seed and explicit inputs;
- the server result is authoritative;
- a mismatch is logged and returned as a conflict;
- the client reloads authoritative attempt state before another shot.

`shot_session.mode` gains `bonus`, and each bonus shot references `bonus_game_attempt_id`. The mode constraint must require the attempt reference and a period number.

A bonus attempt has its own server-derived seed. Shot seeds use the existing stable session/period/shot derivation contract. No `Math.random()`, wall-clock access, or timer is introduced into game-core.

Bonus gameplay always uses neutral stick effects and no duel-condition effects. User equipment is neither read nor snapshotted for a bonus attempt.

The visible `ready` and `save` sprites do not participate in collision calculation. The existing constant goalkeeper hitbox remains authoritative.

## Persistence Model

### `arena_theme`

Stores reusable cosmetic arenas independently from inventory.

Required fields:

- `id` UUID;
- stable unique `slug`;
- `title`;
- `artwork_url` for the game background;
- `thumbnail_url` for selectors and cards;
- `status`: `active` or `archived`;
- `is_selectable` safety switch;
- `created_at`, `updated_at`, `archived_at`.

The standard arena is represented by a stable system theme. It is available to every player and does not need a `user_arena_unlock` row. Active themes participate in the random-neutral pool. An archived earned theme may remain available to its owners while `is_selectable=true`, but it is excluded from new neutral venue selection.

### `bonus_game`

Stores the mutable admin definition:

- `id` UUID and stable unique `slug`;
- `title`, `description`;
- `sort_order`;
- `status`: `draft`, `active`, or `archived`;
- `access_type`: `free` or `paid`;
- `unlock_price_stars`;
- `target_goals`;
- `total_periods`;
- `break_duration_ms`;
- `period_rules` JSON array;
- `reward_coins`, `reward_stars`, `reward_experience`;
- `arena_theme_id`;
- `goalkeeper_ready_url`, `goalkeeper_save_url`;
- monotonically increasing `revision`;
- author and timestamps.

Each period rule contains:

- `periodNumber`;
- `durationMs`;
- `shotsLimit`;
- `goalFrequency`;
- `goalieFrequency`;
- `shooterFrequency`;
- `puckSpeedPerMs`;
- `goaliePattern`: `linear`, `sine`, or `dash`;
- `goalieAmplitude`, seeded as `1.0`;
- `goalAmplitude`, seeded as `220`.

The adapter supplies a stable per-game ID and name plus zero values for legacy `hp`, `baseReward`, and `firstClearBonus`. The existing `speed` field is also set to zero because current movement implementations use frequency and amplitude; it is not exposed as a misleading admin control.

Zod validation is authoritative at the service boundary. Database checks enforce non-negative prices and rewards, valid statuses, valid period count, JSON array shape, unique active ordering, and valid media references.

### `bonus_game_attempt`

Stores one playthrough:

- `id`, `user_id`, `bonus_game_id`;
- `status`: `active`, `completed`, `failed`, or `abandoned`;
- `state`: `idle`, `period_active`, `break_active`, or `closed`;
- `current_period`;
- `period_started_at`, `break_started_at`, `closed_at`;
- aggregate shots and goals;
- server seed and `game_core_version`;
- `definition_revision`;
- `rules_snapshot` JSON;
- `reward_snapshot` JSON;
- `arena_theme_id_snapshot`;
- goalkeeper and arena media snapshot;
- timestamps.

A partial unique index permits at most one `status='active'` attempt per user.

### `bonus_game_period_log`

Archives closed periods with attempt, period number, start/end, shots, goals, duration, and close reason `quota`, `timeout`, `target_reached`, or `attempt_abandoned`.

### `user_bonus_game_unlock`

Records a durable paid unlock:

- `user_id`, `bonus_game_id` unique pair;
- paid price snapshot;
- `unlocked_at`;
- reference to the economy event.

Free access is derived from the catalog and progression; it does not require a row.

### `user_bonus_game_completion`

Records first completion:

- `user_id`, `bonus_game_id` unique pair;
- first successful attempt ID;
- reward snapshot;
- `completed_at`.

The unique pair is the idempotency boundary for first-clear rewards.

### `user_arena_unlock`

Records cosmetic ownership outside inventory:

- `user_id`, `arena_theme_id` unique pair;
- source type `bonus_game`;
- source bonus game and completion references;
- `unlocked_at`.

### User Home Arena

`users.home_arena_theme_id` is nullable. `NULL` resolves to the standard arena. Selecting a bonus arena requires an ownership row. An archived arena already owned by a player remains selectable unless an administrator explicitly disables selection for safety or asset reasons.

### Economy Audit

`bonus_game_economy_event` records:

- user, game, and optional attempt;
- kind `unlock_purchase` or `first_clear_reward`;
- coin, star, and experience deltas;
- balances after the mutation;
- price or reward snapshot;
- timestamp.

Unique keys prevent more than one paid unlock and one first-clear reward per user/game. Coin rewards also append the existing `currency_ledger` with a new `bonus_game_reward` reason.

## Atomic Economy Operations

### Paid Unlock

The unlock transaction:

1. Locks the user balance row.
2. Reloads level access, game status, active ordering, previous completion, existing unlock, and current price.
3. Returns the existing unlock without a second debit if already purchased.
4. Rejects insufficient stars without writing anything.
5. Atomically decrements `users.xp`, inserts `user_bonus_game_unlock`, and inserts the economy event.

Database uniqueness is the final defense against concurrent double taps.

### First-Clear Reward

Shot acceptance, target completion, completion insertion, reward grant, arena unlock, and attempt closure occur in one transaction.

The transaction attempts to insert `user_bonus_game_completion`. Only the transaction that creates that row grants rewards. A replay or retry of the response receives the completed state with zero newly granted reward.

Balance locks use a consistent order across unlock and reward services to avoid deadlocks. Existing coin account and user star/experience columns remain the source of truth.

## API

All player routes require authentication.

### Catalog and Attempt Routes

- `GET /bonus-games`
  - returns ordered cards, server-derived access state, current active attempt summary, reward, price, and media;
- `GET /bonus-games/attempts/current`
  - returns the active attempt or `null` after lazy reconciliation;
- `POST /bonus-games/:gameId/unlock`
  - performs an idempotent one-time star purchase;
- `POST /bonus-games/:gameId/attempts`
  - creates or resumes an attempt;
- `GET /bonus-games/attempts/:attemptId`
  - returns authoritative state after lazy reconciliation;
- `POST /bonus-games/attempts/:attemptId/period/start`
  - starts the next period;
- `POST /bonus-games/attempts/:attemptId/shot`
  - accepts `claimed_shot_index`, deterministic shot input, and `claimed_result`;
- `POST /bonus-games/attempts/:attemptId/abandon`
  - abandons the active attempt; UI confirmation is required before calling it.

### Arena Routes

- `GET /me/home-arenas`
  - returns the standard arena, earned arenas, and current selection;
- `PATCH /me/home-arena`
  - accepts a nullable arena theme ID and validates ownership.

Stable application error codes include:

- `bonus_level_locked`;
- `bonus_previous_game_required`;
- `bonus_purchase_required`;
- `bonus_insufficient_stars`;
- `bonus_game_inactive`;
- `bonus_attempt_already_active`;
- `bonus_attempt_not_active`;
- `bonus_period_not_ready`;
- `bonus_shot_index_mismatch`;
- `bonus_shot_result_mismatch`;
- `arena_not_owned`;
- `arena_not_selectable`.

The web client maps codes to Russian product copy and never displays internal exception text.

## Lazy State Reconciliation

Bonus attempts follow the proven daily-game approach: state is reconciled on every state-changing or state-reading request rather than by cron.

- An expired active period is closed at its computed timeout.
- An elapsed intermission moves the attempt to `idle`, ready for the next explicit period start.
- The final expired period fails the attempt if the target was not reached.
- Reconciliation is idempotent through unique period logs and row locks.
- Waiting between periods has no additional expiry in this version.

## Admin Experience

The admin panel gets a `Бонусные игры` section following the existing duel-template CRUD patterns.

For each game an admin can edit:

- title and description;
- order;
- draft, active, or archived status;
- free/paid access and star price;
- total periods and intermission;
- overall target goals;
- period duration and shot limit;
- shooter, goalkeeper, goal, and puck speeds per period;
- goalkeeper pattern per period;
- coin, experience, and star rewards;
- arena background and thumbnail;
- ready and save goalkeeper sprites.

Media uses the existing media-object upload flow. A game cannot be activated without complete valid media, at least one valid period, a target that does not exceed the total possible shots, and a valid arena theme.

Order changes for active games are submitted atomically. The server validates unique contiguous order and shows an admin warning that changing order changes future progression prerequisites. Archiving a middle game reconnects the active chain to the nearest lower active game. Deletion is soft archival only.

Active attempts are never mutated by an admin edit. Saving gameplay, reward, price, or media changes increments `revision`; only future attempts use it.

The amateur duel-template editor gets `Площадка при автоматическом подборе` with:

- `neutral_default` — use the standard arena;
- `random_participant_home` — randomly choose one participant as home and snapshot that player's selected arena;
- `random_unselected` — choose an active arena not currently selected by either participant.

Each duel template controls its own policy.

## Home Arena Selection UI

The profile locker-room photo card becomes a real hotspot while retaining its visual placement. It displays a small preview of the effective home arena.

Tapping it opens a standard frosted modal containing:

- `По умолчанию`;
- every arena earned through bonus-game completion;
- a selected marker;
- arena thumbnails and titles;
- a wide text-only CTA for saving.

The modal follows the project's modal and button invariants. The hotspot is an accessible button with an explicit Russian label. Arena selection updates only after the server confirms ownership.

## Duel Venue Resolution

Every amateur duel stores an explicit venue snapshot so later profile or admin changes cannot alter an existing match.

Add to `amateur_duel_match`:

- `home_user_id`, nullable for a neutral match;
- `arena_theme_id`, pointing to the selected venue definition where available;
- `arena_snapshot` JSON containing stable title and media URLs;
- `venue_policy` snapshot.

Resolution rules:

### Direct Challenge

The challenger is the home participant. The server resolves and snapshots the challenger's selected arena when creating the match.

### Automatic Matchmaking: `neutral_default`

There is no home participant. The standard arena is snapshotted.

### Automatic Matchmaking: `random_participant_home`

The server randomly selects one participant as `home_user_id` and snapshots that player's selected arena. This selection affects visuals only.

### Automatic Matchmaking: `random_unselected`

There is no home participant. The server resolves both players' effective selected arenas, then selects from active arena themes excluding both. The selected theme does not need to be owned by either player because it is a temporary neutral venue. If the candidate set is empty, the standard arena is used.

Both participants receive the same arena snapshot and render the same venue. Venue choice has no effect on rules, rewards, rating, or hitboxes.

Future tournament scheduling can call the same resolver with an explicitly scheduled home user. Tournament work itself is out of scope.

## Artwork Requirements

The deliverable contains 31 visual assets:

- 10 normalized arena backgrounds;
- 10 transparent `ready` goalkeeper sprites;
- 10 transparent `save` goalkeeper sprites;
- 1 Bonus Games section-card image.

Goalkeeper themes include, at minimum:

- beach clothing and beach colors for Пляж;
- winter/ski clothing for Горнолыжный курорт;
- cyberpunk equipment for Киберпанк-двор;
- abandoned-water-park styling for Заброшенный аквапарк;
- pirate clothing for Пиратская бухта;
- northern down jacket for Северный полюс;
- desert clothing for Пустыня;
- heat/volcanic protective styling for Вулканический лёд;
- knight armor for Замок;
- spacesuit styling for Космос.

For each location, ready and save variants must use:

- the same character identity and costume;
- the same transparent canvas size;
- the same anchor and foot/body alignment;
- clear silhouette at mobile size;
- no baked puck in the ready sprite;
- a save pose that reads as a block without changing the collision geometry.

Arena artwork is normalized to the 572×700 logical rink. It may decorate boards, ice, surroundings, and lighting, but must preserve the readable goal opening, player lane, puck, aiming relationship, score HUD, and touch interaction.

Assets are visually reviewed as a set before integration, converted to appropriate web formats, and stored under stable repository paths. Generated source files may be retained outside the runtime bundle, but the application must use optimized repository copies.

## Failure Handling

- Insufficient stars returns a safe conflict and performs no write.
- Duplicate unlock and reward requests return the already committed state without duplicate balance changes.
- A failed network response after a shot puts the client into reconciliation mode. The next shot is disabled until authoritative state is fetched.
- A shot-index conflict reloads the attempt rather than guessing whether the previous shot succeeded.
- A result mismatch logs `shot_mismatch` with bonus attempt context, rolls back client visuals, and reloads state.
- An archived definition blocks new attempts but does not block its already active attempt.
- A missing or unsafe media reference prevents admin activation; active snapshots continue using retained media.
- Arena selection rejects unowned or disabled themes and preserves the previous selection.
- Random-neutral venue selection falls back to the standard arena when no eligible theme exists.

## Testing Strategy

### Game Core

- Verify bonus mode uses the existing deterministic seed and shot-resolution contract.
- Verify all launch period presets validate against game-core ranges.
- Verify neutral inventory effects produce identical client/server results.
- Keep version tests synchronized if any exported deterministic contract changes.

### Server Integration

- Beginner denied; amateur and professional accepted.
- First active game access and every previous-completion gate.
- Free access and paid unlock.
- Insufficient-star rollback.
- Concurrent purchase requests debit once.
- One active attempt across games.
- Resume, manual abandon, failure, replay, and archived-definition continuation.
- Period quota, timeout, intermission, final failure, and immediate target completion.
- Claimed index and claimed result mismatch behavior.
- Rules, reward, and media snapshot stability after admin edits.
- First-clear reward exactly once under concurrent or retried completion.
- Coin, star, experience, completion, arena unlock, and ledgers committed atomically.
- No inventory lookup, reservation, consumption, or effect in bonus mode.
- Home-arena ownership checks and default selection.
- Direct-challenge home venue.
- All three automatic-matchmaking venue policies and fallback.
- Venue snapshot stability after either player changes their home arena.

### Web Tests

- Sections-card placement and level-locked copy.
- Every catalog card state.
- Purchase confirmation and insufficient-balance response.
- Active attempt resume and conflicting-attempt navigation.
- Period, break, success, failure, and first-clear reward states.
- Mandatory abandon confirmation.
- Network reconciliation disables the next shot.
- Locker-room hotspot and standard arena modal.
- Earned-only arena options and save behavior.
- Admin validation for game definitions and venue policy.

### Rendered QA

On the deployed dev runtime:

- inspect all 31 assets on representative narrow and wide mobile viewports;
- verify ready/save sprite alignment and transitions for every location;
- verify rink geometry and HUD readability for every arena;
- complete the ten-game chain with a synthetic amateur player;
- record initial and final coin, star, and experience balances;
- verify paid unlocks, failed attempts, resume, first-clear-only rewards, and arena ownership;
- choose each earned arena from the locker room;
- verify direct-challenge home venue and all matchmaking venue policies with synthetic users.

## Migration and Release

Database work is forward-only and additive:

1. Create arena, bonus-game, attempt, progression, period-log, and economy tables.
2. Add `bonus_game_attempt_id` and `mode='bonus'` support to `shot_session` constraints and indexes.
3. Add nullable home-arena selection to users.
4. Add duel venue policy to templates and venue snapshot fields to matches.
5. Extend currency-ledger reasons for bonus rewards.
6. Seed the standard arena and ten ordered bonus-game definitions with launch values and repository asset paths.

The ten seed records become active only when their complete asset set ships in the same commit. No manual production database edits are part of the release.

Release sequence:

1. Implement and run focused unit/integration tests.
2. Run repository typecheck, lint, builds, and relevant full test suites.
3. Deploy the integrated commit to dev through GitHub Actions.
4. Perform the rendered and economic QA described above against the exact dev runtime SHA.
5. Adjust launch balance through versioned seed data or recorded admin values and repeat affected QA.
6. Merge dev to main only after dev acceptance.
7. Watch production image build, migrations, container recreation, and health smoke test.
8. Run a separate production smoke check without mutating real user balances.

## Acceptance Criteria

- The Bonus Games card is correctly placed and access-protected.
- All ten locations appear in the approved order with the approved initial balance.
- Paid games debit once and only after the previous active game is completed.
- A bonus attempt can be left and resumed while its active period timer continues server-side.
- Every accepted shot is server-validated through the shared deterministic engine.
- Inventory has no effect and no consumption in bonus games.
- First completion grants the configured balances and arena exactly once.
- Every game has working ready/save goalkeeper art and normalized arena art.
- The locker-room photo card opens the home-arena selector and permits only default or earned themes.
- Direct challenges use the initiator's snapshotted home arena.
- Automatic matchmaking follows the selected per-template venue policy, including neutral fallback.
- Existing active attempts and duels are insulated from later admin or profile changes by snapshots.
- Admin can manage all agreed rules, prices, rewards, order, status, media, and automatic-matchmaking venue policy.
- Tests and rendered dev QA pass before production release.
