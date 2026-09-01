import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { auditAutomaticTournamentLifecycle } from '../../src/tournament/automaticLifecycleAudit.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import { generateRegularSchedule, type TournamentRulesSnapshot } from '../../src/tournament/service.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const CREATOR_ID = '00000000-0000-4000-8000-000000008001';
const NOW = new Date('2030-09-01T12:00:00.000Z');

function legacyRules(): TournamentRulesSnapshot {
  return {
    config: parseTournamentConfig({
      participantLimit: 4,
      playoffSize: 4,
      timezone: 'Europe/Moscow',
      registrationMode: 'open',
      visibility: 'public',
      entryFeeCoins: 0,
      regularSource: 'head_to_head',
      roundRobinCycles: 1,
      roundsPerDay: 3,
      firstRoundLocalTime: '16:00',
      fixtureWindowMs: 60_000,
      roundBreakMs: 0,
      dailyDays: null,
      dailyMetric: null,
      bestDays: null,
    }),
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
  };
}

async function seedLegacyTournament(pool: Pool, slug: string) {
  const tournament = await pool.query<{ id: string }>(
    `insert into tournament
       (slug, title, status, regular_source, current_revision, registration_opens_at,
        registration_closes_at, starts_at, created_by)
     values ($1, 'Legacy cup', 'registration', 'head_to_head', 1, $2, $3, $4, $5)
     returning id`,
    [
      slug,
      new Date('2030-09-02T12:00:00.000Z'),
      new Date('2030-09-03T12:00:00.000Z'),
      new Date('2030-09-04T12:00:00.000Z'),
      CREATOR_ID,
    ],
  );
  const tournamentId = tournament.rows[0]!.id;
  const revision = await pool.query<{ id: string }>(
    `insert into tournament_revision
       (tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
     values ($1, 1, $2, true, $3, $4)
     returning id`,
    [tournamentId, JSON.stringify(legacyRules()), CREATOR_ID, NOW],
  );
  await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
    tournamentId,
    revision.rows[0]!.id,
  ]);
  for (let index = 0; index < 4; index += 1) {
    const userId = `00000000-0000-4000-8000-${String(8_100 + index).padStart(12, '0')}`;
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, $2, 'Europe/Moscow', 'player')`,
      [userId, `Player ${index + 1}`],
    );
    await pool.query(
      `insert into tournament_participant (tournament_id, user_id, state, joined_at)
       values ($1, $2, 'approved', $3)`,
      [tournamentId, userId, NOW],
    );
  }
  return { id: tournamentId };
}

async function tournamentFingerprint(pool: Pool, tournamentId: string) {
  const result = await pool.query<{ fingerprint: Record<string, unknown> }>(
    `select jsonb_build_object(
       'tournament', (select to_jsonb(tournament) from tournament where id = $1),
       'revision', (select to_jsonb(revision) from tournament_revision revision
          where revision.id = (select published_revision_id from tournament where id = $1)),
       'participants', coalesce((select jsonb_agg(to_jsonb(participant) order by participant.id)
          from tournament_participant participant where participant.tournament_id = $1), '[]'::jsonb),
       'matchdays', coalesce((select jsonb_agg(to_jsonb(matchday) order by matchday.id)
          from tournament_matchday matchday where matchday.tournament_id = $1), '[]'::jsonb),
       'rounds', coalesce((select jsonb_agg(to_jsonb(round) order by round.id)
          from tournament_round round where round.tournament_id = $1), '[]'::jsonb),
       'fixtures', coalesce((select jsonb_agg(to_jsonb(fixture) order by fixture.id)
          from tournament_fixture fixture where fixture.tournament_id = $1), '[]'::jsonb),
       'series', coalesce((select jsonb_agg(to_jsonb(series) order by series.id)
          from tournament_playoff_series series where series.tournament_id = $1), '[]'::jsonb),
       'results', coalesce((select jsonb_agg(to_jsonb(result) order by result.id)
          from tournament_daily_result result where result.tournament_id = $1), '[]'::jsonb)
     ) as fingerprint`,
    [tournamentId],
  );
  return result.rows[0]!.fingerprint;
}

async function automaticMarker(pool: Pool, tournamentId: string): Promise<number | null> {
  const result = await pool.query<{ marker: number | null }>(
    `select (rules_snapshot->>'automaticLifecycleVersion')::int as marker
       from tournament_revision
      where id = (select published_revision_id from tournament where id = $1)`,
    [tournamentId],
  );
  return result.rows[0]?.marker ?? null;
}

describe.skipIf(!hasIntegrationEnv)('automatic tournament lifecycle audit', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
    getTestUrls();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, 'Creator', 'Europe/Moscow', 'admin')`,
      [CREATOR_ID],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('does not mutate a legacy tournament during dry-run', async () => {
    const legacy = await seedLegacyTournament(pool, 'legacy-audit-dry-run');
    const before = await tournamentFingerprint(pool, legacy.id);

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: legacy.id,
      now: NOW,
      apply: false,
    });

    expect(report.tournaments[0]).toMatchObject({ status: 'ready_to_enable' });
    expect(await tournamentFingerprint(pool, legacy.id)).toEqual(before);
  });

  it('blocks a legacy tournament with played or conflicting schedule data', async () => {
    const conflicted = await seedLegacyTournament(pool, 'legacy-audit-conflicted');
    await generateRegularSchedule(pool, conflicted.id, 1);
    await pool.query(
      `update tournament_fixture set status = 'active'
        where id = (select id from tournament_fixture where tournament_id = $1 order by id limit 1)`,
      [conflicted.id],
    );

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: conflicted.id,
      now: NOW,
      apply: true,
    });

    expect(report.tournaments[0]).toMatchObject({
      status: 'blocked',
      reasons: expect.arrayContaining(['games_already_started']),
    });
    expect(await automaticMarker(pool, conflicted.id)).toBeNull();
  });

  it('enables a safe tournament and reconciles it once', async () => {
    const safe = await seedLegacyTournament(pool, 'legacy-audit-safe');

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: safe.id,
      now: NOW,
      apply: true,
    });

    expect(report.tournaments[0]).toMatchObject({
      status: 'enabled',
      reconcile: { scanned: 1, changed: 0 },
    });
    expect(await automaticMarker(pool, safe.id)).toBe(1);
  });
});
