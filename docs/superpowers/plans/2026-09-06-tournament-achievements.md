# Tournament Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate all eight existing tournament achievements, add two regular-season achievements, award them from canonical tournament state, and safely backfill historical completions without crediting balances automatically.

**Architecture:** A focused achievement evaluator reads persisted tournament standings, brackets, fixtures, series, duel snapshots, and final placements and emits timestamped completion candidates. The same candidate collector powers transactional live reconciliation and an explicit dry-run/apply backfill CLI, so historical and future tournaments use one rule implementation.

**Tech Stack:** TypeScript, Fastify 4, PostgreSQL 16 through `pg`, Vitest, React 18, existing raw-SQL migration runner, WebP achievement assets.

**Spec:** `docs/superpowers/specs/2026-09-06-tournament-achievements-design.md`

## Global Constraints

- Implement exactly ten active tournament achievements and the approved rewards from the spec.
- Stars and experience are numerically equal for every tournament achievement.
- Completion is server-authoritative and derived only from canonical persisted tournament data.
- Historical completions become `completed_unclaimed`; never credit rewards or balances during backfill.
- `dark-horse` and `death-bracket` compare immutable experience snapshots from the first played duel in a series; current experience is never a fallback.
- `death-bracket` spans tournaments and seasons, permits repeated opponents, includes third-place series, and resets on every intervening non-qualifying resolved series.
- Hockey seasons run September 1 through August 31 using tournament start dates.
- Tournament-source duels continue to skip ordinary duel achievement evaluation.
- No push, merge, deploy, or remote database execution belongs to this implementation plan.
- Do not run GLM review for this task.

## File and responsibility map

- `packages/server/db/migrations/103_tournament_achievements.sql` — catalogue activation, two new catalogue rows, exact rewards.
- `packages/server/src/achievements/service.ts` — generic timestamped, idempotent completion-candidate persistence.
- `packages/server/src/achievements/tournamentRules.ts` — pure season, accuracy, experience, comeback, and streak rule helpers.
- `packages/server/src/achievements/tournamentEvaluator.ts` — canonical database reads, candidate construction, and live reconciliation.
- `packages/server/src/achievements/tournamentBackfill.ts` — all-tournament dry-run/apply orchestration and diagnostics.
- `packages/server/src/achievements/tournamentBackfillCli.ts` — environment parsing, output, and apply guard.
- `packages/server/src/tournament/service.ts` — reconciliation after regular-season finalisation/bracket materialisation.
- `packages/server/src/tournament/fixtureLifecycle.ts` — reconciliation after a playoff fixture settles.
- `packages/server/src/tournament/playoffSeriesLifecycle.ts` — reconciliation after played or forced series resolution and dependent-round materialisation.
- `packages/server/src/tournament/rewards.ts` — reconciliation after official tournament completion.
- `packages/server/package.json` — explicit `achievement:tournament-backfill` command.
- `packages/server/test/achievements/tournamentRules.test.ts` — fast pure rule tests.
- `packages/server/test/achievements/tournamentEvaluator.test.ts` — PostgreSQL integration coverage for all ten achievements.
- `packages/server/test/achievements/tournamentBackfill.test.ts` — dry-run/apply, diagnostics, lock, and idempotency coverage.
- `packages/server/test/achievements/completionCandidates.test.ts` — timestamped generic persistence regression.
- `packages/server/test/db/migration103.test.ts` — exact catalogue/migration contract.
- Existing migration-ledger tests — recognise migration 103 without weakening earlier migration checks.
- `packages/web/public/achievements/regular-season-champion.webp` — small one-handed cup artwork.
- `packages/web/public/achievements/regular-season-medalist.webp` — medal artwork.
- `packages/web/src/screens/AchievementsScreen.test.tsx` and/or asset contract test — ten active cards and asset availability.

---

### Task 1: Activate and seed the ten-entry tournament catalogue

**Files:**
- Create: `packages/server/db/migrations/103_tournament_achievements.sql`
- Modify: `packages/server/src/achievements/catalog.ts:39-46,536-629`
- Create: `packages/server/test/db/migration103.test.ts`
- Modify: `packages/server/test/db/migrations.test.ts`
- Modify any exact migration-ledger tests found by `rg "102_amateur_duel_rating_match_ledger|_migrations" packages/server/test/db`

**Interfaces:**
- Consumes: existing `achievements` columns and `ACHIEVEMENT_SEEDS` contract.
- Produces: ten active catalogue ids with exact copy, image paths, order, and rewards.

- [ ] **Step 1: Write the failing migration contract test**

Create an integration test following `packages/server/test/db/migration101.test.ts` and assert this exact projection after migrations:

```ts
expect(rows).toEqual([
  ['regular-season-champion', 'Победитель регулярки', 125, 250, 250],
  ['regular-season-medalist', 'Призёр регулярки', 50, 100, 100],
  ['playoff-semifinal', 'Турнирный характер', 75, 150, 150],
  ['playoff-final', 'Финальный лёд', 125, 250, 250],
  ['tournament-cup', 'Кубок над головой', 200, 400, 400],
  ['dark-horse', 'Тёмная лошадка', 100, 200, 200],
  ['death-bracket', 'Сетка смерти', 250, 500, 500],
  ['series-comeback', 'Мощный камбэк', 150, 300, 300],
  ['no-shake', 'Без дрожи', 75, 150, 150],
  ['tournament-streak', 'Турнирная серия', 300, 700, 700],
]);
expect(rows.every((row) => row.availability === 'active' && row.future_tag === null)).toBe(true);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm --filter @hockey/server test -- test/db/migration103.test.ts
```

Expected: FAIL because migration 103 and the two new ids do not exist.

- [ ] **Step 3: Add the forward-only migration**

Use `INSERT ... ON CONFLICT (id) DO UPDATE` for the two new records and a `VALUES` table joined into one `UPDATE` for all ten records. Set:

```sql
availability = 'active',
future_tag = null,
reward_currency = configured.reward_currency,
reward_stars = configured.reward_stars,
reward_experience = configured.reward_experience,
updated_at = now()
```

Use image paths `/achievements/regular-season-champion.webp` and `/achievements/regular-season-medalist.webp`. Requirements:

```text
Победитель регулярки: Занять 1-е место в регулярном чемпионате турнира.
Призёр регулярки: Занять 2-е или 3-е место в регулярном чемпионате турнира.
```

Do not insert into `user_achievements` in this migration.

- [ ] **Step 4: Update the TypeScript catalogue mirror**

Make all ten `ACHIEVEMENT_SEEDS` entries exactly match migration 103. Insert regular champion and medalist adjacent to the existing tournament entries and use explicit reward objects, not the zero-valued `reward('tournament')` helper.

- [ ] **Step 5: Update migration-ledger expectations and run GREEN**

Run:

```bash
pnpm --filter @hockey/server test -- test/db/migration103.test.ts test/db/migrations.test.ts
```

Expected: PASS when PostgreSQL test infrastructure is available; otherwise report skipped tests and run the static migration-contract suite as supplementary evidence.

- [ ] **Step 6: Commit the catalogue slice**

```bash
git add packages/server/db/migrations/103_tournament_achievements.sql packages/server/src/achievements/catalog.ts packages/server/test/db
git commit -m "feat: activate tournament achievement catalogue"
```

---

### Task 2: Persist timestamped completion candidates safely

**Files:**
- Modify: `packages/server/src/achievements/service.ts:85-104`
- Create: `packages/server/test/achievements/completionCandidates.test.ts`

**Interfaces:**
- Consumes: `Pool | PoolClient`, active achievement catalogue, existing unique `(user_id, achievement_id)` constraint.
- Produces:

```ts
export interface AchievementCompletionCandidate {
  userId: string;
  achievementId: string;
  achievedAt: Date;
  context: Record<string, unknown>;
}

export async function completeAchievementCandidates(
  db: Queryable,
  candidates: readonly AchievementCompletionCandidate[],
): Promise<{ attempted: number; inserted: number }>;
```

- [ ] **Step 1: Write failing persistence tests**

Test these cases against migrated PostgreSQL:

```ts
it('stores the supplied historical timestamp and context');
it('ignores future and hidden catalogue entries');
it('does not duplicate an existing completion');
it('leaves claimed_at null and does not change users or currency accounts');
```

Assert the exact stored `completed_at`, JSON context, and `{ attempted, inserted }` counts.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @hockey/server test -- test/achievements/completionCandidates.test.ts
```

Expected: FAIL because `completeAchievementCandidates` is not exported.

- [ ] **Step 3: Implement candidate persistence**

Deduplicate input by `userId + achievementId`, keeping the earliest `achievedAt`. Insert candidates in one parameterised `jsonb_to_recordset` query:

```sql
insert into user_achievements
  (user_id, achievement_id, completed_at, completion_context)
select candidate.user_id, candidate.achievement_id, candidate.achieved_at, candidate.context
from jsonb_to_recordset($1::jsonb) as candidate(
  user_id uuid,
  achievement_id text,
  achieved_at timestamptz,
  context jsonb
)
join achievements achievement on achievement.id = candidate.achievement_id
where achievement.availability = 'active'
on conflict (user_id, achievement_id) do nothing
returning achievement_id
```

Keep `completeAchievements` source-compatible by mapping its ids to candidates with one shared `now` timestamp and then calling the new function.

- [ ] **Step 4: Run GREEN and existing claim regressions**

```bash
pnpm --filter @hockey/server test -- test/achievements/completionCandidates.test.ts test/achievements/claim.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/achievements/service.ts packages/server/test/achievements/completionCandidates.test.ts
git commit -m "feat: persist timestamped achievement completions"
```

---

### Task 3: Implement pure tournament achievement rules

**Files:**
- Create: `packages/server/src/achievements/tournamentRules.ts`
- Create: `packages/server/test/achievements/tournamentRules.test.ts`

**Interfaces:**
- Produces:

```ts
export type TournamentSeriesResultKind = 'played_win' | 'technical_win' | 'loss' | 'cancelled';

export interface ResolvedPlayerSeries {
  seriesId: string;
  tournamentId: string;
  completedAt: Date;
  result: TournamentSeriesResultKind;
  playerExperience: number | null;
  opponentExperience: number | null;
}

export function hockeySeasonKey(startsAt: Date): string;
export function accuracyAtLeast(goals: number, shots: number, threshold: number): boolean;
export function isMoreExperiencedOpponent(series: ResolvedPlayerSeries): boolean;
export function reachesDeathBracket(series: readonly ResolvedPlayerSeries[]): {
  achievedAt: Date | null;
  qualifyingSeriesIds: string[];
};
export function isSeriesComeback(input: {
  winsRequired: number;
  eventualWinnerParticipantId: string;
  fixtures: readonly {
    fixtureId: string;
    settledAt: Date;
    winnerParticipantId: string | null;
    played: boolean;
  }[];
}): boolean;
```

- [ ] **Step 1: Write failing season and accuracy tests**

Cover August 31 versus September 1 in UTC instants after applying the tournament's configured local timezone before calling `hockeySeasonKey`. Test `90/100`, `9/10`, `89/100`, and `0/0`.

- [ ] **Step 2: Write failing death-bracket tests**

Construct chronological inputs covering:

```ts
expect(reachesDeathBracket([strongWinA, strongWinB, strongWinC]).achievedAt).toEqual(strongWinC.completedAt);
expect(reachesDeathBracket([strongWinA, loss, strongWinB, strongWinC]).achievedAt).toBeNull();
expect(reachesDeathBracket([strongWinA, weakerOpponentWin, strongWinB, strongWinC]).achievedAt).toBeNull();
```

The last assertion verifies that a win over a not-more-experienced opponent resets the chain, after which B and C only produce a count of two. Add repeated-opponent and third-place-series examples through the same generic series shape.

- [ ] **Step 3: Write failing comeback tests**

Cover `winsRequired = 1`, a 0-1 to 2-1 played comeback, never trailing, technical trailing result, an eventual-winner technical win, and technical deciding win.

- [ ] **Step 4: Run RED**

```bash
pnpm --filter @hockey/server test -- test/achievements/tournamentRules.test.ts
```

- [ ] **Step 5: Implement minimal pure helpers**

Sort defensively by `completedAt`, then `seriesId`. A death-bracket series increments only when `result === 'played_win'` and both snapshots exist with `opponentExperience > playerExperience`; every other resolved series resets to zero. Return the first third-win timestamp and exactly its three series ids.

For comeback, walk played fixtures in chronological order, track both sides' series wins, mark `trailed = true` only after a played fixture, reject the series if any winner-attributed win is non-played, and require the eventual winner to reach `winsRequired`.

- [ ] **Step 6: Run GREEN**

```bash
pnpm --filter @hockey/server test -- test/achievements/tournamentRules.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/achievements/tournamentRules.ts packages/server/test/achievements/tournamentRules.test.ts
git commit -m "feat: define tournament achievement rules"
```

---

### Task 4: Collect candidates from canonical tournament history

**Files:**
- Create: `packages/server/src/achievements/tournamentEvaluator.ts`
- Create: `packages/server/test/achievements/tournamentEvaluator.test.ts`

**Interfaces:**
- Consumes: `completeAchievementCandidates`, pure helpers from Task 3, tournament tables from migrations 061-102.
- Produces:

```ts
export const TOURNAMENT_ACHIEVEMENT_IDS = [
  'regular-season-champion',
  'regular-season-medalist',
  'playoff-semifinal',
  'playoff-final',
  'tournament-cup',
  'dark-horse',
  'death-bracket',
  'series-comeback',
  'no-shake',
  'tournament-streak',
] as const;

export interface TournamentAchievementDiagnostics {
  timestampFallbacks: number;
  ambiguousExperienceSeries: number;
}

export async function collectTournamentAchievementCandidates(
  db: Pool | PoolClient,
  input: { tournamentId: string; source: 'tournament_live' | 'tournament_backfill' },
): Promise<{
  candidates: AchievementCompletionCandidate[];
  diagnostics: TournamentAchievementDiagnostics;
}>;

export async function reconcileTournamentAchievements(
  db: Pool | PoolClient,
  input: { tournamentId: string; source: 'tournament_live' | 'tournament_backfill' },
): Promise<{ attempted: number; inserted: number; diagnostics: TournamentAchievementDiagnostics }>;
```

- [ ] **Step 1: Create a reusable tournament-history fixture builder**

Inside the integration test file, add helpers that seed users, tournament/revision, participants, standings, rounds, series, fixtures, fixture segments, and tournament-source `amateur_duel_match` rows with controlled experience snapshots and times. Keep the builder test-local.

- [ ] **Step 2: Write failing regular placement and round-reach tests**

Assert:

- ranks 1, 2, and 3 produce champion/medalist with no overlap;
- rank 4 does not;
- regular status with incomplete coverage does not qualify;
- a materialised four-player semifinal qualifies all assigned players;
- a two-player final produces `playoff-final` but not `playoff-semifinal`;
- a dependent final awards only after both participant ids are resolved.

- [ ] **Step 3: Write failing official champion and season tests**

Seed three completed tournaments in one local hockey season and assert `tournament-cup` for each winner's first championship plus one `tournament-streak` candidate at the third `completed_at`. Seed the third win on September 1 of the next season and assert no streak.

- [ ] **Step 4: Write failing performance-rule tests**

Assert database-derived candidates for:

- dark horse from the first played duel's two participant snapshots;
- no dark horse on forced/admin/technical resolution or missing snapshot;
- death bracket across tournaments, repeated opponent allowed, loss and ordinary win resets;
- third-place win after the preceding semifinal loss starts at one;
- comeback from chronological played fixtures only;
- no shake at exactly 90% across multiple regulation/overtime/shootout segments;
- no no-shake for zero shots, forfeit, or admin-only settlement.

- [ ] **Step 5: Run RED**

```bash
pnpm --filter @hockey/server test -- test/achievements/tournamentEvaluator.test.ts
```

- [ ] **Step 6: Implement focused canonical queries**

Build small private loaders rather than one opaque mega-query:

```ts
loadTournamentBoundary(db, tournamentId)
loadRegularPlacements(db, tournamentId)
loadAssignedPlayoffSeries(db, tournamentId)
loadFixturePerformance(db, tournamentId)
loadAffectedUserSeriesHistory(db, userIds)
loadAffectedUserChampionships(db, userIds)
```

Use `tournament.completed_at` for championships, `tournament_playoff_series.updated_at` for completed series, `tournament_fixture.settled_at` for no-shake, and series/round creation timestamps for round reach. For regular completion, use the latest canonical regular result timestamp (`fixture.settled_at` for head-to-head, `tournament_daily_result.finalized_at` for daily/classic), falling back to the playoff-start boundary timestamp and incrementing `timestampFallbacks`.

Derive local season dates with `Intl.DateTimeFormat` using the published revision timezone; invalid legacy timezones fall back to UTC and count as timestamp/config diagnostics rather than throwing away an otherwise official championship.

- [ ] **Step 7: Implement candidate deduplication and reconciliation**

Within one collection, deduplicate by `userId + achievementId` and keep the earliest achievement event. Put only ids, ranks, stage numbers, season key, fixture/series ids, and `ruleVersion: 1` into context. Pass candidates to `completeAchievementCandidates` only in `reconcileTournamentAchievements`.

- [ ] **Step 8: Run GREEN**

```bash
pnpm --filter @hockey/server test -- test/achievements/tournamentRules.test.ts test/achievements/tournamentEvaluator.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/achievements/tournamentEvaluator.ts packages/server/test/achievements/tournamentEvaluator.test.ts
git commit -m "feat: evaluate tournament achievements"
```

---

### Task 5: Connect reconciliation to live tournament lifecycle boundaries

**Files:**
- Modify: `packages/server/src/tournament/service.ts:4122-4500`
- Modify: `packages/server/src/tournament/fixtureLifecycle.ts:416-625`
- Modify: `packages/server/src/tournament/playoffSeriesLifecycle.ts:213-330,489-550`
- Modify: `packages/server/src/tournament/rewards.ts:239-305`
- Modify: `packages/server/test/tournament/service.integration.test.ts`
- Modify: `packages/server/test/tournament/fixtureAttempts.integration.test.ts`
- Modify: `packages/server/test/tournament/duel-settlement-policy.test.ts`
- Create: `packages/server/test/achievements/tournamentLifecycle.integration.test.ts`

**Interfaces:**
- Consumes: `reconcileTournamentAchievements(client, { tournamentId, source: 'tournament_live' })`.
- Produces: live completions after every qualifying canonical transition.

- [ ] **Step 1: Write failing regular/bracket lifecycle test**

Start playoffs through the public service and assert that final regular ranks and initially assigned semifinal players become completed while unresolved dependent final players do not.

- [ ] **Step 2: Write failing fixture/series lifecycle tests**

Settle a played playoff duel through the existing lifecycle and assert no-shake. Complete the series and assert round reach, dark horse, and comeback as applicable. Confirm rerunning the lifecycle does not duplicate rows.

- [ ] **Step 3: Write failing forced-decision and completion tests**

Confirm an admin-forced series winner can receive round reach and official cup after tournament completion but cannot receive dark horse or comeback from that forced result.

- [ ] **Step 4: Run RED**

```bash
pnpm --filter @hockey/server test -- test/achievements/tournamentLifecycle.integration.test.ts test/tournament/duel-settlement-policy.test.ts
```

- [ ] **Step 5: Add transactional hooks**

Call reconciliation after canonical writes and before commit/return:

- in `startTournamentPlayoffs`, after standings are final and all initial series are inserted;
- in `settleTournamentSegmentForDuel`, after the fixture/segment has settled and series advancement has persisted;
- in `advanceTournamentPlayoffSeries` and `forceTournamentPlayoffSeriesWinner`, after winner/dependent-series state is persisted;
- in `maybeGrantCompletedTournamentPlayoffRewards`, after `tournament.status = 'completed'` and `completed_at` is written.

Avoid duplicate calls where one function already owns the full boundary; prefer the deepest function that sees the completed canonical state. Duplicate reconciliation is safe but unnecessary query load is not.

- [ ] **Step 6: Preserve ordinary duel isolation**

Keep `TOURNAMENT_SETTLEMENT_POLICY.evaluateAchievements = false`. Extend the settlement-policy test to assert that tournament reconciliation is a separate import/call and that ordinary `evaluateDuelSettledAchievements` still does not run for `source = 'tournament'`.

- [ ] **Step 7: Run GREEN**

```bash
pnpm --filter @hockey/server test -- test/achievements/tournamentLifecycle.integration.test.ts test/tournament/duel-settlement-policy.test.ts test/tournament/fixtureAttempts.integration.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/tournament packages/server/test/achievements/tournamentLifecycle.integration.test.ts packages/server/test/tournament
git commit -m "feat: reconcile live tournament achievements"
```

---

### Task 6: Add dry-run/apply historical backfill

**Files:**
- Create: `packages/server/src/achievements/tournamentBackfill.ts`
- Create: `packages/server/src/achievements/tournamentBackfillCli.ts`
- Modify: `packages/server/package.json`
- Create: `packages/server/test/achievements/tournamentBackfill.test.ts`

**Interfaces:**
- Consumes: `collectTournamentAchievementCandidates`, `completeAchievementCandidates`.
- Produces:

```ts
export interface TournamentAchievementBackfillReport {
  tournamentsScanned: number;
  distinctUsers: number;
  candidatesByAchievement: Record<string, number>;
  attempted: number;
  alreadyCompleted: number;
  insertable: number;
  inserted: number;
  timestampFallbacks: number;
  ambiguousExperienceSeries: number;
}

export async function backfillTournamentAchievements(
  pool: Pool,
  options: { apply: boolean; batchSize: number },
): Promise<TournamentAchievementBackfillReport>;
```

- [ ] **Step 1: Write failing dry-run test**

Seed completed and in-progress tournaments plus one cancelled tournament. Assert candidate counts include completed facts from the first two, exclude cancelled data, expose no names, and leave `user_achievements` unchanged.

- [ ] **Step 2: Write failing apply/idempotency test**

Assert first apply inserts the expected earliest candidates as unclaimed, preserves a pre-existing claimed completion, changes no balances, and a second apply reports `inserted: 0` and `insertable: 0`.

- [ ] **Step 3: Write failing advisory-lock test**

Hold the agreed advisory lock in one PostgreSQL client and assert an apply attempt fails fast with a clear `backfill already running` error rather than waiting indefinitely. Dry-run must remain allowed without the mutation lock.

- [ ] **Step 4: Run RED**

```bash
pnpm --filter @hockey/server test -- test/achievements/tournamentBackfill.test.ts
```

- [ ] **Step 5: Implement candidate aggregation and reporting**

Load tournament ids where `status NOT IN ('cancelled')` and a published revision exists. Call the shared collector with `source: 'tournament_backfill'`, merge by `userId + achievementId` keeping the earliest date, query pre-existing rows in one set, and calculate report totals before writes.

For apply, use `pg_try_advisory_xact_lock(hashtext('tournament-achievement-backfill:v1'))`, insert batches of 250 candidates through `completeAchievementCandidates`, and read back the expected keys before commit. Never print user ids, provider ids, display names, or contexts.

- [ ] **Step 6: Add guarded CLI and package script**

Add:

```json
"achievement:tournament-backfill": "tsx src/achievements/tournamentBackfillCli.ts"
```

CLI contract:

```bash
pnpm --filter @hockey/server achievement:tournament-backfill -- --dry-run
TOURNAMENT_ACHIEVEMENT_BACKFILL=1 pnpm --filter @hockey/server achievement:tournament-backfill -- --apply
```

Require exactly one of `--dry-run` or `--apply`, require `DATABASE_URL`, accept `--batch-size <positive integer>`, and require `TOURNAMENT_ACHIEVEMENT_BACKFILL=1` for apply in every environment. Print only the JSON report plus `mode`.

- [ ] **Step 7: Run GREEN**

```bash
pnpm --filter @hockey/server test -- test/achievements/tournamentBackfill.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/achievements/tournamentBackfill.ts packages/server/src/achievements/tournamentBackfillCli.ts packages/server/test/achievements/tournamentBackfill.test.ts packages/server/package.json
git commit -m "feat: backfill tournament achievements safely"
```

---

### Task 7: Create the two achievement artworks and verify UI presentation

**Files:**
- Create: `packages/web/public/achievements/regular-season-champion.webp`
- Create: `packages/web/public/achievements/regular-season-medalist.webp`
- Modify: `packages/web/src/screens/AchievementsScreen.test.tsx`
- Modify or create: `packages/web/src/game/achievementAssets.test.ts`

**Interfaces:**
- Consumes: catalogue image paths from Task 1 and existing `AchievementCard` rendering.
- Produces: two 256x256 decodable WebP assets and a ten-card active tournament UI contract.

- [ ] **Step 1: Write failing asset contract**

Following `bonusGameAssets.test.ts`, use `sharp().metadata()` and assert both files exist, decode as WebP, and are exactly 256x256. Run:

```bash
pnpm --filter @hockey/web test -- src/game/achievementAssets.test.ts
```

Expected: FAIL because both files are absent.

- [ ] **Step 2: Inspect existing tournament art references**

Visually inspect `playoff-semifinal.webp`, `playoff-final.webp`, `tournament-cup.webp`, `dark-horse.webp`, and `tournament-streak.webp` before generation. Record a prompt that preserves monochrome cinematic lighting, realistic hockey gear, high central contrast, and no embedded text.

- [ ] **Step 3: Generate and convert champion artwork**

Use ImageGen with the approved composition: one hockey player holding a small cup in one hand, not raised overhead, subtle standings-board geometry in the arena background, square composition, monochrome cinematic style, no words/logos. Convert/crop with `sharp` to lossy 256x256 WebP and inspect the final file.

- [ ] **Step 4: Generate and convert medalist artwork**

Use ImageGen for a distinct hockey player with a visible medal against an arena/podium background, square monochrome cinematic style, no cup, words, or logos. Convert/crop to 256x256 WebP and inspect the final file.

- [ ] **Step 5: Write the failing ten-card UI test**

Mock the API with the ten tournament ids, `availability: 'active'`, and the approved rewards. Select the Tournament filter and assert:

```ts
expect(screen.getByText('0/10')).toBeInTheDocument();
expect(screen.queryByText('Скоро')).not.toBeInTheDocument();
expect(screen.getByText('Победитель регулярки')).toBeInTheDocument();
expect(screen.getByText('Призёр регулярки')).toBeInTheDocument();
```

- [ ] **Step 6: Run UI and asset GREEN**

```bash
pnpm --filter @hockey/web test -- src/game/achievementAssets.test.ts src/screens/AchievementsScreen.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add packages/web/public/achievements/regular-season-champion.webp packages/web/public/achievements/regular-season-medalist.webp packages/web/src/game/achievementAssets.test.ts packages/web/src/screens/AchievementsScreen.test.tsx
git commit -m "feat: add regular season achievement artwork"
```

---

### Task 8: Full verification and backfill rehearsal

**Files:**
- Modify only files required to fix verified failures introduced by Tasks 1-7.
- Do not alter unrelated baseline failures or user-owned files.

**Interfaces:**
- Consumes: completed implementation.
- Produces: local evidence and a dry-run/apply rehearsal against an isolated test database.

- [ ] **Step 1: Build game-core before server checks**

```bash
pnpm --filter @hockey/game-core build
```

Expected: exit 0.

- [ ] **Step 2: Run focused tournament achievement suites with test infrastructure**

Set the repository's documented `TEST_DATABASE_URL` and `TEST_REDIS_URL`, then run:

```bash
pnpm --filter @hockey/server test -- \
  test/db/migration103.test.ts \
  test/achievements/completionCandidates.test.ts \
  test/achievements/tournamentRules.test.ts \
  test/achievements/tournamentEvaluator.test.ts \
  test/achievements/tournamentLifecycle.integration.test.ts \
  test/achievements/tournamentBackfill.test.ts
```

Expected: all tests execute and pass; zero skips in these named files.

- [ ] **Step 3: Rehearse backfill on synthetic isolated data**

Run dry-run, record counts, run apply with `TOURNAMENT_ACHIEVEMENT_BACKFILL=1`, then run dry-run again. Expected: first dry-run `insertable > 0`, apply `inserted = previous insertable`, final dry-run `insertable = 0`; balances remain unchanged.

- [ ] **Step 4: Run static checks**

```bash
pnpm typecheck
pnpm lint
pnpm exec prettier --check \
  packages/server/src/achievements \
  packages/server/src/tournament \
  packages/server/test/achievements \
  packages/server/test/tournament \
  packages/web/src/screens/AchievementsScreen.test.tsx
git diff --check
```

- [ ] **Step 5: Run package and build suites**

```bash
pnpm --filter @hockey/server test
pnpm --filter @hockey/web test
pnpm build
```

Report exact pass/fail/skip counts. A skipped integration suite is `BLOCKED`, not passed.

- [ ] **Step 6: Inspect final images and diff**

Visually inspect both final WebP assets at original detail. Review:

```bash
git status --short
git diff --stat origin/dev...HEAD
git diff --check origin/dev...HEAD
```

Confirm only scoped files changed and no generated secrets, database dumps, `.env`, or unrelated artifacts are present.

- [ ] **Step 7: Commit any verification-only fixes**

If verification required scoped fixes:

```bash
git add <only-the-verified-scoped-files>
git commit -m "fix: harden tournament achievement reconciliation"
```

If no fixes were needed, do not create an empty commit.

- [ ] **Step 8: Hand off without publishing**

Report:

- branch and exact HEAD SHA;
- expected versus actual behaviour;
- tests and exact counts;
- integration infrastructure status;
- backfill rehearsal counts;
- files and migration added;
- known risks;
- explicit statement that no push, deploy, or remote database backfill occurred.
