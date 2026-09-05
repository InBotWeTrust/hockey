import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const MIGRATION_NAME = '100_align_tournament_classic_puck_speed.sql';

async function createMigrationsDirBefore(cutoff: string): Promise<string> {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migrations-before-100-'));
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file.localeCompare(cutoff) < 0)
    .sort((left, right) => left.localeCompare(right));
  await Promise.all(
    files.map((file) => fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(targetDir, file))),
  );
  return targetDir;
}

const periodSpeedPresets = [1, 2, 3].map((periodNumber, index) => ({
  periodNumber,
  goalFrequency: 0.5,
  goalieFrequency: 0.6,
  shooterFrequency: [0.75, 0.7, 0.65][index],
  puckSpeedPerMs: 1.25,
}));

describe.skipIf(!hasIntegrationEnv)('100 Classic tournament puck-speed alignment', () => {
  let pool: Pool;
  let migrationsBefore100Dir: string | undefined;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore100Dir = await createMigrationsDirBefore(MIGRATION_NAME);
    await applyMigrations(pool, migrationsBefore100Dir);
  });

  afterAll(async () => {
    await pool.end();
    if (migrationsBefore100Dir !== undefined) {
      await fs.rm(migrationsBefore100Dir, { recursive: true, force: true });
    }
  });

  it('aligns published Classic rules and open sessions while preserving history', async () => {
    const userId = '00000000-0000-4000-8000-000000001001';
    const tournamentId = '00000000-0000-4000-8000-000000001002';
    const revisionId = '00000000-0000-4000-8000-000000001003';
    const participantId = '00000000-0000-4000-8000-000000001004';
    const openMatchdayId = '00000000-0000-4000-8000-000000001005';
    const closedMatchdayId = '00000000-0000-4000-8000-000000001006';
    const classicRules = {
      goalieId: 'rookie', shotsPerPeriod: 30, periodDurationMs: 1_200_000,
      breakDurationMs: 120_000, incompleteResultPolicy: 'completed_game', periodSpeedPresets,
    };
    const revisionRules = {
      config: {
        regularSource: 'classic',
        classicRules,
      },
    };

    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Migration 100 Player', 'Europe/Moscow')`,
      [userId],
    );
    await pool.query(
      `insert into tournament (id, slug, title, status, regular_source, created_by)
       values ($1, 'migration-100', 'Migration 100', 'regular', 'classic', $2)`,
      [tournamentId, userId],
    );
    await pool.query(
      `insert into tournament_revision
         (id, tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
       values ($1, $2, 1, $3, true, $4, now())`,
      [revisionId, tournamentId, JSON.stringify(revisionRules), userId],
    );
    await pool.query(`update tournament set published_revision_id=$1,current_revision=1 where id=$2`, [revisionId, tournamentId]);
    await pool.query(
      `insert into tournament_participant (id,tournament_id,user_id,state)
       values ($1,$2,$3,'approved')`,
      [participantId, tournamentId, userId],
    );
    await pool.query(
      `insert into tournament_matchday (id,tournament_id,number,local_date,starts_at,ends_at,status)
       values ($1,$3,1,'2026-09-06',now(),now()+interval '1 hour','open'),
              ($2,$3,2,'2026-09-05',now()-interval '1 day',now()-interval '23 hours','closed')`,
      [openMatchdayId, closedMatchdayId, tournamentId],
    );
    await pool.query(
      `insert into tournament_classic_session
         (tournament_id,participant_id,matchday_id,tournament_day,state,current_period,
          rules_snapshot,game_core_version,session_seed,closes_at)
       values ($1,$2,$3,1,'break_active',1,$5,1,'open-seed',now()+interval '1 hour'),
              ($1,$2,$4,2,'closed',3,$5,1,'closed-seed',now()-interval '23 hours')`,
      [tournamentId, participantId, openMatchdayId, closedMatchdayId, JSON.stringify(classicRules)],
    );

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(applied.applied).toContain(MIGRATION_NAME);

    const revision = await pool.query<{ speeds: Array<{ puckSpeedPerMs: number }> }>(
      `select rules_snapshot->'config'->'classicRules'->'periodSpeedPresets' as speeds
         from tournament_revision where id=$1`,
      [revisionId],
    );
    expect(revision.rows[0]!.speeds.map((period) => period.puckSpeedPerMs)).toEqual([0.85, 0.85, 0.85]);

    const sessions = await pool.query<{ state: string; speeds: Array<{ puckSpeedPerMs: number }> }>(
      `select state,rules_snapshot->'periodSpeedPresets' as speeds
         from tournament_classic_session where tournament_id=$1 order by tournament_day`,
      [tournamentId],
    );
    expect(sessions.rows[0]!.speeds.map((period) => period.puckSpeedPerMs)).toEqual([0.85, 0.85, 0.85]);
    expect(sessions.rows[1]!.speeds.map((period) => period.puckSpeedPerMs)).toEqual([1.25, 1.25, 1.25]);
  });
});
