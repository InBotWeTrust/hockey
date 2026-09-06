# Tournament Achievements Design

**Date:** 2026-09-06

**Status:** Approved in conversation; awaiting written-spec review

**Target branch:** `dev` via an isolated feature branch

## Objective

Turn the existing tournament achievement cards from catalogue-only placeholders into working, server-authoritative achievements. Add two regular-season placement achievements, award all ten achievements for future tournament activity, and provide a safe, repeatable backfill for achievements already earned in recorded tournaments.

The feature must not change tournament results, ordinary duel achievement behaviour, user balances, or deployment procedures.

## User-facing outcome

The Tournament filter on the Achievements screen contains ten active achievements:

1. `regular-season-champion` — **Победитель регулярки**
2. `regular-season-medalist` — **Призёр регулярки**
3. `playoff-semifinal` — **Турнирный характер**
4. `playoff-final` — **Финальный лёд**
5. `tournament-cup` — **Кубок над головой**
6. `dark-horse` — **Тёмная лошадка**
7. `death-bracket` — **Сетка смерти**
8. `series-comeback` — **Мощный камбэк**
9. `no-shake` — **Без дрожи**
10. `tournament-streak` — **Турнирная серия**

They use the existing achievement lifecycle: `locked -> completed_unclaimed -> claimed`. Historical awards stop at `completed_unclaimed`; users claim rewards through the existing UI and endpoint.

## Rewards

Tournament achievement rewards are additional to configured tournament stage rewards. Stars and experience are numerically equal.

| Achievement          | Coins | Stars | Experience |
| -------------------- | ----: | ----: | ---------: |
| Призёр регулярки     |    50 |   100 |        100 |
| Турнирный характер   |    75 |   150 |        150 |
| Без дрожи            |    75 |   150 |        150 |
| Тёмная лошадка       |   100 |   200 |        200 |
| Победитель регулярки |   125 |   250 |        250 |
| Финальный лёд        |   125 |   250 |        250 |
| Мощный камбэк        |   150 |   300 |        300 |
| Кубок над головой    |   200 |   400 |        400 |
| Сетка смерти         |   250 |   500 |        500 |
| Турнирная серия      |   300 |   700 |        700 |

The regular-season winner does not also receive `regular-season-medalist`.

## Achievement rules

### Regular-season placements

`regular-season-champion` completes for the participant with final regular-season `rank = 1` after the regular stage has finished.

`regular-season-medalist` completes for final regular-season `rank = 2` or `rank = 3`. Rank 1 is explicitly excluded.

Both rules apply to every supported regular-season source: `head_to_head`, `daily_aggregate`, and `classic`. Cancelled tournaments and unfinished regular stages do not qualify. A tournament may still be in progress when these achievements complete if its regular stage has officially finished.

### Reaching playoff rounds

`playoff-semifinal` completes when a participant is assigned to a championship semifinal series. Direct seeding and byes qualify. A two-player playoff has no semifinal and cannot award this achievement.

`playoff-final` completes when a participant is assigned to the championship final series. Direct seeding and byes qualify.

An official bracket assignment is sufficient for these reach-based achievements; the player does not need to complete the first game of the round.

### Tournament champion

`tournament-cup` completes for the official first-place tournament finisher. A technical final result or an explicit administrator decision still qualifies because this achievement represents the official championship outcome.

### More-experienced opponent

For `dark-horse` and `death-bracket`, opponent experience is compared using the immutable `amateur_duel_participant.experience_snapshot` values from the first actual duel game in the playoff series.

If the first-game snapshots are missing, invalid, or cannot be paired unambiguously, the series does not qualify. The evaluator reports the skipped legacy case in its dry-run diagnostics; it must not substitute current user experience.

### Dark horse

`dark-horse` completes when a player actually wins a playoff series against an opponent whose first-game experience snapshot is higher.

A series decided by technical victory, bye, or administrator-selected winner does not qualify. The winner must have reached `wins_required` through recorded played fixtures.

### Death bracket

`death-bracket` completes after three consecutive qualifying playoff-series wins against more-experienced opponents.

- The streak is global across tournaments and hockey seasons.
- Repeated opponents are allowed; the unit is a won series, not a unique user.
- Championship and third-place playoff series both participate.
- A lost series resets the streak.
- A won series against an opponent who was not more experienced resets the streak.
- A technical, bye, cancelled, or otherwise non-played series cannot advance the streak and resets it when it represents the player's next resolved playoff series.
- Chronological order is the canonical series completion time, with stable series-id ordering as a deterministic tie-breaker.

A player necessarily loses a semifinal before entering a third-place series, so that loss resets any previous streak. A third-place win may begin a new streak.

### Series comeback

`series-comeback` applies only to a series with `wins_required >= 2`.

The eventual winner must have trailed in series wins after at least one actually played fixture and then officially win the series. Technical results do not establish the trailing state. Every win counted toward the eventual winner's `wins_required` total must be backed by a played fixture; a series containing a technical or administrator-assigned win for the eventual winner does not qualify.

### No shake

`no-shake` completes when a player records at least 90% accuracy in one fully played playoff fixture.

Accuracy is `total goals / total shots` for that player across all actual duel segments belonging to the fixture, including regulation, overtime, and shootout segments. The fixture must be settled through gameplay and contain at least one recorded shot. Technical, bye, double-forfeit, cancelled, and administrator-only results do not qualify.

### Tournament streak

`tournament-streak` completes when a player records three official tournament championships within one hockey season.

A hockey season starts on September 1 and ends on August 31. The season is derived from the tournament start date. Completion time is the official completion time of the third championship. Technical or administrator-confirmed championships count because `tournament-cup` and this rule represent official final placement.

## Architecture

### Reconciliation instead of transient event trust

Add a tournament achievement reconciliation service under the server tournament/achievement boundary. It reads canonical persisted tournament data and produces completion candidates:

```ts
interface TournamentAchievementCandidate {
  userId: string;
  achievementId: TournamentAchievementId;
  achievedAt: Date;
  context: Record<string, unknown>;
}
```

The service recalculates facts from the database. It does not trust client claims or require an in-memory event to have been observed. Repeating reconciliation produces the same candidates.

Insert candidates into `user_achievements` with `ON CONFLICT (user_id, achievement_id) DO NOTHING`. Extend the achievement completion service with a candidate-based path that accepts `achievedAt`; preserve the existing API for non-tournament achievements.

Only active catalogue entries may complete. The catalogue migration activates the eight existing entries before live reconciliation or backfill is applied.

### Reconciliation triggers

Invoke reconciliation after the transaction has made the canonical tournament state visible at these boundaries:

| Persisted transition                                | Rules reconciled                                 |
| --------------------------------------------------- | ------------------------------------------------ |
| Regular stage finalised and standings frozen        | Regular-season champion and medalist             |
| Championship bracket or later round materialised    | Semifinal and final reach                        |
| Playoff fixture settled                             | No shake                                         |
| Playoff series resolved or administratively decided | Dark horse, death bracket, comeback, round reach |
| Tournament champion becomes official                | Cup and three championships in one season        |

Prefer a single post-transition reconciliation entry point over separate ad-hoc grants. Failures must follow the existing transaction/error contract of the calling path; achievements must not be granted from partially persisted tournament state.

Tournament-source duels continue using `evaluateAchievements: false` for ordinary duel achievements. Tournament reconciliation is a separate explicit path and must not enable ordinary duel rewards, stakes, or rating settlement.

### Completion context

Each completion stores enough non-sensitive provenance to explain and audit the result:

- `source`: `tournament_live` or `tournament_backfill`;
- `tournament_id`;
- applicable `fixture_id`, `series_id`, round number/stage, final rank, season key, or streak-series ids;
- rule version.

Do not store names, Telegram identifiers, access data, or mutable current experience in completion context.

### Achievement timestamps

Use the timestamp of the canonical qualifying event:

- regular placements: regular-stage completion/final standing timestamp;
- semifinal/final reach: qualifying series creation/materialisation timestamp;
- no shake: fixture `settled_at`;
- dark horse, death bracket, comeback: completed series timestamp;
- cup and tournament streak: championship finalisation timestamp.

When a legacy row lacks a trustworthy event timestamp, the evaluator must use a documented stable fallback from the same tournament record and report the fallback count in dry-run diagnostics. It must never silently use the backfill execution time as if it were the achievement date.

## Catalogue migration

Add the next forward-only SQL migration. It must:

1. insert `regular-season-champion` and `regular-season-medalist` idempotently;
2. update the eight existing tournament catalogue rows to `availability = 'active'` and `future_tag = null`;
3. set the approved rewards for all ten rows;
4. retain existing user completions and claims;
5. update hard-coded migration-ledger tests affected by the new migration number.

The migration does not grant user balances and does not perform the historical backfill.

## Historical backfill

Add an explicit server CLI that uses the same reconciliation rules as live operation.

### Modes

`dry-run`:

- reads all non-cancelled tournaments;
- includes completed facts from tournaments still in progress;
- calculates candidates without writing;
- reports candidate counts by achievement, distinct affected-user count, already-completed count, insertable count, timestamp-fallback count, and skipped ambiguous-experience count;
- emits no names or other personal data.

`apply`:

- obtains a dedicated PostgreSQL advisory lock to prevent concurrent backfills;
- recalculates candidates instead of trusting a previous dry-run artifact;
- inserts in bounded batches;
- uses the historical event timestamp and `source = 'tournament_backfill'`;
- commits safely and reports attempted, inserted, pre-existing, and skipped counts;
- performs a readback count before success.

Running `apply` repeatedly must insert zero duplicates after the first successful run. The command must not claim achievement rewards or update currency, stars, or experience balances.

### Environment procedure

Backfill execution is separate for local, dev, and production databases.

For each remote environment:

1. deploy the exact code and migration through the authorised GitHub Actions workflow;
2. verify runtime SHA, migration presence, health, and schema;
3. run `dry-run` and review counts;
4. obtain explicit approval for that environment's `apply`;
5. run `apply` once;
6. rerun `dry-run`/readback and verify zero remaining insertable candidates.

No direct database mutation or VPS-built artifact is allowed outside the established deployment/release path.

## Artwork

Create two new 256x256 WebP files in `packages/web/public/achievements/`, matching the existing monochrome cinematic tournament set:

- `regular-season-champion.webp`: a hockey player holding a small cup in one hand, with a subtle standings/table motif;
- `regular-season-medalist.webp`: a hockey player wearing or holding a medal against a tournament-arena background.

The images must remain legible when the locked-card UI applies grayscale and reduced opacity. The champion image must not duplicate the large overhead-cup composition of `tournament-cup.webp`.

## UI behaviour

No new screen or interaction is required. The existing Tournament filter, completion counter, claim action, reward modal, and badge behaviour remain the source of truth.

After the catalogue migration:

- the Tournament filter total becomes ten;
- incomplete entries show the normal active locked state, not `Скоро`;
- completed historical entries show as claimable;
- claimed entries show as received;
- reward chips use the configured values.

## Testing

### Pure/domain tests

Cover every rule and boundary:

- ranks 1, 2, 3, 4 and unfinished/cancelled regular stages;
- playoff sizes 2, 4, 8, and 16;
- direct seeds and byes for round reach;
- technical and administrator outcomes for reach, championship, dark horse, comeback, and no shake;
- valid, missing, and ambiguous first-game experience snapshots;
- repeated opponents;
- cross-tournament death-bracket continuation;
- reset on loss, non-stronger win, and non-played resolved series;
- third-place loss/reset/win ordering;
- comeback only when `wins_required >= 2` and the eventual winner actually trailed;
- 90%, just below 90%, multiple segments, zero shots, overtime, and shootout accuracy;
- season boundaries at August 31/September 1 and third win across two different seasons.

### Integration tests

With PostgreSQL and Redis test services:

- each canonical lifecycle boundary invokes reconciliation;
- transaction rollback cannot leave a completion from partial state;
- all ten achievements reach `completed_unclaimed` with expected context and timestamps;
- repeated reconciliation is idempotent;
- claims credit the approved reward exactly once;
- ordinary tournament duels still do not receive ordinary duel achievements.

### Backfill tests

- `dry-run` performs no writes;
- `apply` inserts expected historical completions;
- second `apply` inserts zero rows;
- ongoing tournaments contribute only already-finalised facts;
- cancelled tournaments are ignored;
- pre-existing claimed/completed rows are preserved;
- fallback and skipped diagnostics are accurate;
- advisory locking prevents concurrent application.

### Migration and web tests

- catalogue/migration contract asserts ten active tournament entries and exact rewards;
- migration-ledger expectations include the new migration;
- achievement screen renders ten tournament cards without `Скоро`;
- both new image assets exist, decode, and have 256x256 dimensions.

### Verification commands

At minimum:

```bash
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm lint
pnpm --filter @hockey/server test
pnpm --filter @hockey/web test
pnpm build
git diff --check
```

Server integration evidence is valid only when the required test PostgreSQL and Redis services are present; skipped integration tests are reported as skipped, not passed.

## Rollback and compatibility

- The schema/catalogue migration is forward-only.
- Disabling an achievement can be done by a later migration or admin availability change without deleting completions.
- Incorrect historical grants are not automatically deleted or clawed back; any compensation requires an audited forward correction after reviewing affected rows.
- Because backfill does not auto-claim, an incorrect unclaimed completion can be corrected before it changes balances, but this is not a substitute for dry-run review.
- Existing claimed achievements and ordinary achievement logic remain untouched.

## Non-goals

- No push, deploy, merge, or remote database execution in the local implementation task.
- No redesign of the Achievements screen.
- No changes to tournament standings, scheduling, playoff outcomes, stage rewards, ratings, or inventory settlement.
- No ordinary duel achievements for tournament-source duels.
- No recurring seasonal reset job; `tournament-streak` is a one-time achievement evaluated from historical championship facts.
