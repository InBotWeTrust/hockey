import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { reconcileTournamentLifecycle } from '../../src/tournament/automaticLifecycle.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import {
  generateRegularSchedule,
  type TournamentRulesSnapshot,
} from '../../src/tournament/service.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const CLOSES_AT = new Date('2030-09-01T12:00:00.000Z');
const CREATOR_ID = '00000000-0000-4000-8000-000000000901';
const ADMIN_ID = '00000000-0000-4000-8000-000000000902';

function minuteAfter(date: Date): Date {
  return new Date(date.getTime() + 60_000);
}

function rules(source: 'head_to_head' | 'daily_aggregate' | 'classic', playoffSize: 2 | 4) {
  const base = {
    participantLimit: 4,
    playoffSize,
    timezone: 'Europe/Moscow',
    registrationMode: 'open' as const,
    visibility: 'public' as const,
    entryFeeCoins: 0,
  };
  const config =
    source === 'head_to_head'
      ? parseTournamentConfig({
          ...base,
          regularSource: source,
          roundRobinCycles: 1,
          roundsPerDay: 3,
          firstRoundLocalTime: '16:00',
          fixtureWindowMs: 60_000,
          roundBreakMs: 0,
          dailyDays: null,
          dailyMetric: null,
          bestDays: null,
        })
      : parseTournamentConfig({
          ...base,
          regularSource: source,
          roundRobinCycles: null,
          roundsPerDay: null,
          firstRoundLocalTime: null,
          fixtureWindowMs: null,
          roundBreakMs: null,
          dailyDays: 3,
          dailyMetric: 'goals_sum',
          bestDays: null,
          ...(source === 'classic'
            ? {
                classicRules: {
                  goalieId: 'classic-goalie',
                  shotsPerPeriod: 1,
                  periodDurationMs: 60_000,
                  breakDurationMs: 0,
                  incompleteResultPolicy: 'completed_game' as const,
                  periodSpeedPresets: [
                    {
                      periodNumber: 1 as const,
                      goalFrequency: 0.55,
                      goalieFrequency: 0.65,
                      shooterFrequency: 0.8,
                      puckSpeedPerMs: 1.3,
                    },
                    {
                      periodNumber: 2 as const,
                      goalFrequency: 0.72,
                      goalieFrequency: 0.84,
                      shooterFrequency: 1,
                      puckSpeedPerMs: 1.55,
                    },
                    {
                      periodNumber: 3 as const,
                      goalFrequency: 0.9,
                      goalieFrequency: 1.05,
                      shooterFrequency: 1.18,
                      puckSpeedPerMs: 1.8,
                    },
                  ],
                },
              }
            : {}),
        });
  return {
    config,
    automaticLifecycleVersion: 1,
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
  } satisfies TournamentRulesSnapshot;
}

async function seedAutomaticTournament(
  pool: Pool,
  input: {
    source?: 'head_to_head' | 'daily_aggregate' | 'classic';
    approved: number;
    playoffSize: 2 | 4;
    subscribedAdmins?: number;
  },
) {
  const source = input.source ?? 'head_to_head';
  const tournament = await pool.query<{ id: string }>(
    `insert into tournament
       (slug, title, status, regular_source, current_revision, registration_opens_at,
        registration_closes_at, starts_at, created_by)
     values ($1, 'Автоматический кубок', 'registration', $2, 1, $3, $4, $5, $6)
     returning id`,
    [
      `automatic-${source}-${input.approved}-${input.playoffSize}`,
      source,
      new Date(CLOSES_AT.getTime() - 3_600_000),
      CLOSES_AT,
      new Date(CLOSES_AT.getTime() + 86_400_000),
      CREATOR_ID,
    ],
  );
  const tournamentId = tournament.rows[0]!.id;
  const revision = await pool.query<{ id: string }>(
    `insert into tournament_revision
       (tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
     values ($1, 1, $2, true, $3, $4)
     returning id`,
    [tournamentId, JSON.stringify(rules(source, input.playoffSize)), CREATOR_ID, CLOSES_AT],
  );
  await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
    tournamentId,
    revision.rows[0]!.id,
  ]);

  for (let index = 0; index < input.approved; index += 1) {
    const userId = `00000000-0000-4000-8000-${String(910 + index).padStart(12, '0')}`;
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, $2, 'Europe/Moscow', 'player')`,
      [userId, `Игрок ${index + 1}`],
    );
    await pool.query(
      `insert into tournament_participant (tournament_id, user_id, state, joined_at)
       values ($1, $2, 'approved', $3)`,
      [tournamentId, userId, CLOSES_AT],
    );
  }

  if (input.subscribedAdmins !== undefined) {
    const subscribed = [CREATOR_ID, ADMIN_ID].slice(0, input.subscribedAdmins);
    for (const userId of subscribed) {
      await pool.query(
        `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
         values ($1, $2, 'test-p256dh', 'test-auth')`,
        [userId, `https://push.example.test/${userId}`],
      );
    }
  }
  return { id: tournamentId, revision: 1 };
}

async function counts(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query<{ matchdays: number; rounds: number; fixtures: number }>(
    `select
       (select count(*)::int from tournament_matchday where tournament_id = $1) as matchdays,
       (select count(*)::int from tournament_round where tournament_id = $1) as rounds,
       (select count(*)::int from tournament_fixture where tournament_id = $1) as fixtures`,
    [tournamentId],
  );
  return rows[0]!;
}

describe.skipIf(!hasIntegrationEnv)('automatic tournament lifecycle reconcile', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, 'Создатель', 'Europe/Moscow', 'admin'),
              ($2, 'Администратор', 'Europe/Moscow', 'admin')`,
      [CREATOR_ID, ADMIN_ID],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates a head-to-head schedule once after registration closes but leaves regular manual', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 4,
      playoffSize: 4,
    });

    const first = await reconcileTournamentLifecycle(pool, {
      now: CLOSES_AT,
      tournamentId: tournament.id,
    });
    const second = await reconcileTournamentLifecycle(pool, {
      now: minuteAfter(CLOSES_AT),
      tournamentId: tournament.id,
    });

    expect(first.items[0]).toMatchObject({
      before: 'registration',
      after: 'scheduling',
      action: 'generate_schedule',
      changed: true,
    });
    expect(second.items[0]).toMatchObject({
      action: 'await_manual_regular_start',
      changed: false,
    });
    expect(await counts(pool, tournament.id)).toMatchObject({
      matchdays: 1,
      rounds: 3,
      fixtures: 6,
    });

    const beforeStaleGenerate = await pool.query<{ id: string }>(
      `select id from tournament_matchday where tournament_id = $1`,
      [tournament.id],
    );
    const staleGenerate = await generateRegularSchedule(pool, tournament.id, tournament.revision);
    const afterStaleGenerate = await pool.query<{ id: string }>(
      `select id from tournament_matchday where tournament_id = $1`,
      [tournament.id],
    );

    expect(staleGenerate).toMatchObject({ matchdayCount: 1, roundCount: 3, fixtureCount: 6 });
    expect(afterStaleGenerate.rows[0]!.id).toBe(beforeStaleGenerate.rows[0]!.id);
  });

  it.each(['daily_aggregate', 'classic'] as const)(
    'creates only matchdays for %s',
    async (source) => {
      const tournament = await seedAutomaticTournament(pool, {
        source,
        approved: 4,
        playoffSize: 4,
      });

      await reconcileTournamentLifecycle(pool, {
        now: CLOSES_AT,
        tournamentId: tournament.id,
        classicSeedSecret: 'test-secret',
      });

      expect(await counts(pool, tournament.id)).toMatchObject({
        matchdays: 3,
        rounds: 0,
        fixtures: 0,
      });
    },
  );

  it('blocks without shrinking playoff size and notifies creator and admins once', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      approved: 3,
      playoffSize: 4,
      subscribedAdmins: 2,
    });
    const eventKey = `${tournament.id}:registration-blocked:${tournament.revision}`;

    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    await reconcileTournamentLifecycle(pool, {
      now: minuteAfter(CLOSES_AT),
      tournamentId: tournament.id,
    });

    const row = await pool.query<{ status: string; playoff_size: number }>(
      `select tournament.status, (revision.rules_snapshot->'config'->>'playoffSize')::int as playoff_size
         from tournament join tournament_revision revision on revision.id = tournament.published_revision_id
        where tournament.id = $1`,
      [tournament.id],
    );
    expect(row.rows[0]).toMatchObject({ status: 'registration_blocked', playoff_size: 4 });
    const deliveries = await pool.query<{ count: number }>(
      `select count(*)::int as count from push_delivery_log
        where event_type = 'tournament.registration_blocked' and event_key = $1`,
      [eventKey],
    );
    expect(deliveries.rows[0]!.count).toBe(2);
  });
});
