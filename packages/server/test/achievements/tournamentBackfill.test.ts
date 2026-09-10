import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { backfillTournamentAchievements } from '../../src/achievements/tournamentBackfill.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('tournament achievement backfill', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => pool?.end());
  beforeEach(async () => pool.query('truncate users cascade'));

  async function seedCompletedTournament() {
    const championUserId = randomUUID();
    const opponentUserId = randomUUID();
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Champion', 'Europe/Moscow'), ($2, 'Opponent', 'Europe/Moscow')`,
      [championUserId, opponentUserId],
    );
    const tournamentId = randomUUID();
    const revisionId = randomUUID();
    await pool.query(
      `insert into tournament
         (id, slug, title, status, regular_source, starts_at, completed_at, created_by)
       values ($1, $2, 'Backfill Cup', 'completed', 'head_to_head',
               '2026-09-01T10:00:00Z', '2026-09-05T10:00:00Z', $3)`,
      [tournamentId, `backfill-${tournamentId}`, championUserId],
    );
    await pool.query(
      `insert into tournament_revision
         (id, tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
       values ($1, $2, 1, $3, true, $4, '2026-08-01T10:00:00Z')`,
      [
        revisionId,
        tournamentId,
        JSON.stringify({
          config: { timezone: 'Europe/Moscow', playoffSize: 2, regularSource: 'head_to_head' },
        }),
        championUserId,
      ],
    );
    await pool.query(
      `update tournament set published_revision_id = $2, current_revision = 1 where id = $1`,
      [tournamentId, revisionId],
    );
    const championParticipant = randomUUID();
    const opponentParticipant = randomUUID();
    await pool.query(
      `insert into tournament_participant (id, tournament_id, user_id, state)
       values ($1, $3, $4, 'approved'), ($2, $3, $5, 'approved')`,
      [championParticipant, opponentParticipant, tournamentId, championUserId, opponentUserId],
    );
    await pool.query(
      `insert into tournament_standing (tournament_id, participant_id, rank, played)
       values ($1, $2, 1, 1), ($1, $3, 2, 1)`,
      [tournamentId, championParticipant, opponentParticipant],
    );
    const roundId = randomUUID();
    await pool.query(
      `insert into tournament_round (id, tournament_id, stage, number, status)
       values ($1, $2, 'playoff', 1, 'settled')`,
      [roundId, tournamentId],
    );
    await pool.query(
      `insert into tournament_playoff_series
         (tournament_id, round_id, bracket_position, higher_seed_participant_id,
          lower_seed_participant_id, winner_participant_id, wins_required,
          higher_seed_wins, home_sequence, status, updated_at)
       values ($1, $2, 1, $3, $4, $3, 1, 1, '[]', 'completed', '2026-09-05T10:00:00Z')`,
      [tournamentId, roundId, championParticipant, opponentParticipant],
    );
    return championUserId;
  }

  it('reports without writes in dry-run and applies idempotently as unclaimed', async () => {
    const championUserId = await seedCompletedTournament();
    const dryRun = await backfillTournamentAchievements(pool, { apply: false, batchSize: 250 });
    expect(dryRun.tournamentsScanned).toBe(1);
    expect(dryRun.insertable).toBeGreaterThan(0);
    expect(dryRun.inserted).toBe(0);
    expect(await pool.query(`select 1 from user_achievements`)).toHaveProperty('rowCount', 0);

    const applied = await backfillTournamentAchievements(pool, { apply: true, batchSize: 2 });
    expect(applied.inserted).toBe(dryRun.insertable);
    const completions = await pool.query<{ claimed_at: Date | null }>(
      `select claimed_at from user_achievements where user_id = $1`,
      [championUserId],
    );
    expect(completions.rows.length).toBeGreaterThan(0);
    expect(completions.rows.every((row) => row.claimed_at === null)).toBe(true);

    const repeated = await backfillTournamentAchievements(pool, { apply: true, batchSize: 250 });
    expect(repeated.insertable).toBe(0);
    expect(repeated.inserted).toBe(0);
  });

  it('fails fast when another apply holds the advisory lock', async () => {
    await seedCompletedTournament();
    const blocker = await pool.connect();
    await blocker.query('begin');
    await blocker.query(
      `select pg_advisory_xact_lock(hashtext('tournament-achievement-backfill:v1'))`,
    );
    await expect(
      backfillTournamentAchievements(pool, { apply: true, batchSize: 250 }),
    ).rejects.toThrow('backfill already running');
    await blocker.query('rollback');
    blocker.release();
  });
});
