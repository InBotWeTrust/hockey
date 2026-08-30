import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  finalizeDueClassicTournamentDays,
  getClassicGameState,
  listActiveClassicGames,
  startClassicGamePeriod,
  submitClassicGameShot,
} from '../../src/tournament/classicGame.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const ADMIN_ID = '00000000-0000-4000-8000-000000000801';
const PLAYER_ID = '00000000-0000-4000-8000-000000000802';
const TOURNAMENT_ID = '00000000-0000-4000-8000-000000000803';
const PARTICIPANT_ID = '00000000-0000-4000-8000-000000000804';
const MATCHDAY_ID = '00000000-0000-4000-8000-000000000805';
const REVISION_ID = '00000000-0000-4000-8000-000000000806';
const NOW = new Date('2030-09-01T10:00:00.000Z');
const SEED_SECRET = 'classic-integration-seed-secret';

function classicConfig() {
  return parseTournamentConfig({
    regularSource: 'classic',
    participantLimit: 8,
    playoffSize: 4,
    timezone: 'Europe/Moscow',
    registrationMode: 'open',
    visibility: 'public',
    entryFeeCoins: 0,
    roundRobinCycles: null,
    roundsPerDay: null,
    firstRoundLocalTime: null,
    fixtureWindowMs: null,
    roundBreakMs: null,
    dailyDays: 1,
    dailyMetric: 'goals_sum',
    bestDays: null,
    classicRules: {
      shotsPerPeriod: 1,
      periodDurationMs: 60_000,
      breakDurationMs: 0,
      incompleteResultPolicy: 'completed_game',
      periodSpeedPresets: [
        {
          periodNumber: 1,
          goalFrequency: 0.55,
          goalieFrequency: 0.65,
          shooterFrequency: 0.8,
          puckSpeedPerMs: 1.3,
        },
        {
          periodNumber: 2,
          goalFrequency: 0.72,
          goalieFrequency: 0.84,
          shooterFrequency: 1,
          puckSpeedPerMs: 1.55,
        },
        {
          periodNumber: 3,
          goalFrequency: 0.9,
          goalieFrequency: 1.05,
          shooterFrequency: 1.18,
          puckSpeedPerMs: 1.8,
        },
      ],
    },
  });
}

async function seedClassicTournament(pool: Pool) {
  await pool.query(
    `insert into users (id, display_name, timezone, role, level)
     values ($1, 'Admin', 'Europe/Moscow', 'admin', 10),
            ($2, 'Игрок', 'Europe/Moscow', 'player', 2)`,
    [ADMIN_ID, PLAYER_ID],
  );
  const rules = {
    config: classicConfig(),
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
  };
  await pool.query(
    `insert into tournament
       (id, slug, title, status, regular_source, current_revision, starts_at, created_by)
     values ($1, 'classic-cup', 'Кубок классики', 'regular', 'classic', 1, $2, $3)`,
    [TOURNAMENT_ID, NOW, ADMIN_ID],
  );
  await pool.query(
    `insert into tournament_revision
       (id, tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
     values ($1, $2, 1, $3, true, $4, $5)`,
    [REVISION_ID, TOURNAMENT_ID, JSON.stringify(rules), ADMIN_ID, NOW],
  );
  await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
    TOURNAMENT_ID,
    REVISION_ID,
  ]);
  await pool.query(
    `insert into tournament_participant
       (id, tournament_id, user_id, state, joined_at)
     values ($1, $2, $3, 'approved', $4)`,
    [PARTICIPANT_ID, TOURNAMENT_ID, PLAYER_ID, NOW],
  );
  await pool.query(
    `insert into tournament_matchday
       (id, tournament_id, number, local_date, starts_at, ends_at, status)
     values ($1, $2, 1, '2030-09-01', $3, $4, 'open')`,
    [MATCHDAY_ID, TOURNAMENT_ID, NOW, new Date('2030-09-01T20:59:59.999Z')],
  );
}

async function configureIncompleteGamePolicy(
  pool: Pool,
  policy: 'all_shots' | 'completed_periods' | 'completed_game',
): Promise<void> {
  await pool.query(
    `update tournament_revision
        set rules_snapshot = jsonb_set(
          jsonb_set(
            rules_snapshot,
            '{config,classicRules,incompleteResultPolicy}',
            to_jsonb($2::text)
          ),
          '{config,classicRules,shotsPerPeriod}',
          '2'::jsonb
        )
      where id = $1`,
    [REVISION_ID, policy],
  );
}

async function submitMiss(pool: Pool, shotIndex: number, now: Date): Promise<void> {
  await submitClassicGameShot(pool, {
    userId: PLAYER_ID,
    tournamentId: TOURNAMENT_ID,
    now,
    seedSecret: SEED_SECRET,
    shotIndex,
    input: { tapTime: 0 },
    claimedResult: 'miss',
  });
}

describe.skipIf(!hasIntegrationEnv)('classic tournament game integration', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await seedClassicTournament(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates one resumable session and exposes it on the active-games board', async () => {
    const first = await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    const second = await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    const active = await listActiveClassicGames(pool, { userId: PLAYER_ID, now: NOW });

    expect(second.session_id).toBe(first.session_id);
    expect(active).toEqual([
      expect.objectContaining({
        tournament_id: TOURNAMENT_ID,
        tournament_title: 'Кубок классики',
        tournament_day: 1,
        state: 'idle',
      }),
    ]);
    const sessions = await pool.query(`select id from tournament_classic_session`);
    expect(sessions.rowCount).toBe(1);
  });

  it('does not duplicate a session or shot when requests arrive together', async () => {
    const states = await Promise.all([
      getClassicGameState(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
      }),
      getClassicGameState(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
      }),
    ]);
    expect(new Set(states.map((state) => state.session_id)).size).toBe(1);

    await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    const shots = await Promise.allSettled([
      submitClassicGameShot(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
        shotIndex: 1,
        input: { tapTime: 0 },
        claimedResult: 'miss',
      }),
      submitClassicGameShot(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
        shotIndex: 1,
        input: { tapTime: 0 },
        claimedResult: 'miss',
      }),
    ]);

    expect(shots.filter((shot) => shot.status === 'fulfilled')).toHaveLength(1);
    expect(shots.filter((shot) => shot.status === 'rejected')).toHaveLength(1);
    expect(
      await pool.query(`select id from tournament_classic_session where tournament_id = $1`, [
        TOURNAMENT_ID,
      ]),
    ).toMatchObject({ rowCount: 1 });
    expect(
      await pool.query(`select id from shot_session where mode = 'tournament_classic'`),
    ).toMatchObject({ rowCount: 1 });
    expect(
      await pool.query(`select lifetime_shots_total from users where id = $1`, [PLAYER_ID]),
    ).toMatchObject({ rows: [{ lifetime_shots_total: 1 }] });
  });

  it('plays three one-shot periods, updates lifetime totals and records one tournament result', async () => {
    let now = NOW;
    for (let period = 1; period <= 3; period += 1) {
      const started = await startClassicGamePeriod(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now,
        seedSecret: SEED_SECRET,
      });
      expect(started.current_period).toBe(period);

      const submitted = await submitClassicGameShot(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now,
        seedSecret: SEED_SECRET,
        shotIndex: 1,
        input: { tapTime: 0 },
        claimedResult: 'miss',
      });
      expect(submitted.state.current_period).toBe(period);
      now = new Date(now.getTime() + 1);
    }

    const state = await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now,
      seedSecret: SEED_SECRET,
    });
    expect(state.state).toBe('closed');
    expect(state.daily_total_shots).toBe(3);

    const user = await pool.query<{ shots: number; goals: number }>(
      `select lifetime_shots_total as shots, lifetime_goals_total as goals
         from users where id = $1`,
      [PLAYER_ID],
    );
    const result = await pool.query<{ shots: number; completed: boolean }>(
      `select shots, completed from tournament_daily_result
        where tournament_id = $1 and participant_id = $2 and tournament_day = 1`,
      [TOURNAMENT_ID, PARTICIPANT_ID],
    );
    expect(user.rows[0]!.shots).toBe(3);
    expect(result.rows).toEqual([{ shots: 3, completed: true }]);
    expect((await pool.query(`select id from day_pool`)).rowCount).toBe(0);
  });

  it('finalizes a missed game once at the tournament-day deadline', async () => {
    const afterDeadline = new Date('2030-09-01T21:00:00.000Z');
    const first = await finalizeDueClassicTournamentDays(pool, {
      now: afterDeadline,
      seedSecret: SEED_SECRET,
    });
    const second = await finalizeDueClassicTournamentDays(pool, {
      now: afterDeadline,
      seedSecret: SEED_SECRET,
    });

    expect(first).toEqual({ finalizedDays: 1, finalizedParticipants: 1 });
    expect(second).toEqual({ finalizedDays: 0, finalizedParticipants: 0 });
    const result = await pool.query<{ goals: number; shots: number; completed: boolean }>(
      `select goals, shots, completed from tournament_daily_result
        where tournament_id = $1 and participant_id = $2 and tournament_day = 1`,
      [TOURNAMENT_ID, PARTICIPANT_ID],
    );
    expect(result.rows).toEqual([{ goals: 0, shots: 0, completed: false }]);
    const session = await pool.query<{ state: string }>(
      `select state from tournament_classic_session where tournament_id = $1`,
      [TOURNAMENT_ID],
    );
    expect(session.rows).toEqual([{ state: 'expired' }]);
  });

  it.each([
    { policy: 'all_shots' as const, expectedShots: 1, expectedCounted: true },
    { policy: 'completed_periods' as const, expectedShots: 2, expectedCounted: true },
    { policy: 'completed_game' as const, expectedShots: 0, expectedCounted: false },
  ])(
    'applies the $policy rule when the tournament day ends',
    async ({ policy, expectedShots, expectedCounted }) => {
      await configureIncompleteGamePolicy(pool, policy);
      await startClassicGamePeriod(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
      });
      await submitMiss(pool, 1, NOW);

      if (policy === 'completed_periods') {
        await submitMiss(pool, 2, new Date(NOW.getTime() + 1));
        const secondPeriodAt = new Date(NOW.getTime() + 2);
        await startClassicGamePeriod(pool, {
          userId: PLAYER_ID,
          tournamentId: TOURNAMENT_ID,
          now: secondPeriodAt,
          seedSecret: SEED_SECRET,
        });
        await submitMiss(pool, 1, secondPeriodAt);
      }

      await finalizeDueClassicTournamentDays(pool, {
        now: new Date('2030-09-01T21:00:00.000Z'),
        seedSecret: SEED_SECRET,
      });

      const result = await pool.query<{ shots: number; completed: boolean }>(
        `select shots, completed from tournament_daily_result
          where tournament_id = $1 and participant_id = $2 and tournament_day = 1`,
        [TOURNAMENT_ID, PARTICIPANT_ID],
      );
      expect(result.rows).toEqual([{ shots: expectedShots, completed: expectedCounted }]);
    },
  );
});
