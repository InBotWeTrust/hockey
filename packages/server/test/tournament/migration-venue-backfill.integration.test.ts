import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const VENUE_MIGRATION = '065_tournament_fixture_venue.sql';

async function applyMigrationsThrough064(pool: Pool): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file < VENUE_MIGRATION)
    .sort((left, right) => left.localeCompare(right));
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function seedLegacyUnopenedFixtures(pool: Pool): Promise<void> {
  const userIds = [
    '00000000-0000-4000-8000-000000000851',
    '00000000-0000-4000-8000-000000000852',
  ];
  await pool.query(
    `insert into users (id, display_name, timezone)
     values ($1, 'Legacy home', 'Europe/Moscow'), ($2, 'Legacy away', 'Europe/Moscow')`,
    userIds,
  );
  const tournament = await pool.query<{ id: string }>(
    `insert into tournament (slug, title, status, regular_source, created_by)
     values ('legacy-venue-backfill', 'Legacy venue backfill', 'regular', 'head_to_head', $1)
     returning id`,
    [userIds[0]],
  );
  const participants = await pool.query<{ id: string }>(
    `insert into tournament_participant (tournament_id, user_id, state)
     values ($1, $2, 'approved'), ($1, $3, 'approved')
     returning id`,
    [tournament.rows[0]!.id, userIds[0], userIds[1]],
  );
  const rounds = await pool.query<{ id: string; stage: string }>(
    `insert into tournament_round (tournament_id, stage, number, rules_snapshot)
     values ($1, 'regular', 1, '{}'::jsonb),
            ($1, 'playoff', 2, '{}'::jsonb),
            ($1, 'tiebreak', 3, '{}'::jsonb)
     returning id, stage`,
    [tournament.rows[0]!.id],
  );
  const roundId = new Map(rounds.rows.map((round) => [round.stage, round.id]));
  await pool.query(
    `insert into tournament_fixture
       (tournament_id, round_id, fixture_number, home_participant_id, away_participant_id, status)
     values ($1, $2, 1, $3, $4, 'scheduled'),
            ($1, $5, 2, $3, $4, 'scheduled'),
            ($1, $6, 3, $3, $4, 'scheduled')`,
    [
      tournament.rows[0]!.id,
      roundId.get('regular'),
      participants.rows[0]!.id,
      participants.rows[1]!.id,
      roundId.get('playoff'),
      roundId.get('tiebreak'),
    ],
  );
}

describe.skipIf(!hasIntegrationEnv)('065 tournament fixture venue backfill', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrationsThrough064(pool);
    await seedLegacyUnopenedFixtures(pool);
    await pool.query(await readFile(path.join(MIGRATIONS_DIR, VENUE_MIGRATION), 'utf8'));
  });

  afterAll(async () => {
    await pool.end();
  });

  it('preserves legacy backfill decisions when 065 is applied again', async () => {
    const legacy = await pool.query<{
      tournament_id: string;
      round_id: string;
      home_participant_id: string;
      away_participant_id: string;
    }>(
      `select fixture.tournament_id, fixture.round_id,
              fixture.home_participant_id, fixture.away_participant_id
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
        where round.stage = 'regular'
        order by fixture.fixture_number
        limit 1`,
    );
    const regular = legacy.rows[0]!;
    await pool.query(
      `insert into tournament_fixture
         (tournament_id, round_id, fixture_number, home_participant_id, away_participant_id, status)
       values ($1, $2, 4, $3, $4, 'scheduled')`,
      [
        regular.tournament_id,
        regular.round_id,
        regular.home_participant_id,
        regular.away_participant_id,
      ],
    );
    await pool.query(await readFile(path.join(MIGRATIONS_DIR, VENUE_MIGRATION), 'utf8'));

    const fixtures = await pool.query<{ stage: string; venue_mode: string }>(
      `select round.stage, fixture.venue_mode
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
        order by fixture.fixture_number`,
    );

    expect(fixtures.rows).toEqual([
      { stage: 'regular', venue_mode: 'home_selected' },
      { stage: 'playoff', venue_mode: 'home_selected' },
      { stage: 'tiebreak', venue_mode: 'neutral_default' },
      { stage: 'regular', venue_mode: 'neutral_default' },
    ]);
  });
});
