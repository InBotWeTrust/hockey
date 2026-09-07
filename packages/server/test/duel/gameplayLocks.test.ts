import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  GAMEPLAY_RECOVERY_MS,
  assertGameplayActionAllowed,
  assertSafeSegmentStart,
  getGameplayLockState,
  getNearestScheduledTournamentBlock,
  getTournamentGameplayLockStates,
  lockUserGameplay,
  type GameplayAction,
} from '../../src/duel/gameplayLocks.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

type ActivityMode = 'training' | 'daily' | 'amateur_duel';

interface Activity {
  mode: ActivityMode;
  createdAt: Date;
  duelSource?: 'challenge' | 'matchmaking' | 'tournament';
}

function at(value: string): Date {
  return new Date(value);
}

function gameplayClient(activities: Activity[]) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes('tournament_fixture')) return { rows: [] } as unknown as QueryResult;
    if (sql.includes('tournament_classic_session')) {
      return { rows: [{ active: false }] } as unknown as QueryResult;
    }
    const requestedModes = (values?.[1] ?? []) as ActivityMode[];
    const accepted = activities.filter(
      (activity) =>
        requestedModes.includes(activity.mode) &&
        (activity.mode !== 'amateur_duel' || activity.duelSource !== 'tournament'),
    );
    const latest = accepted.reduce<Date | null>(
      (current, activity) =>
        current === null || activity.createdAt > current ? activity.createdAt : current,
      null,
    );
    return { rows: [{ last_activity_at: latest }] } as QueryResult;
  });
  return { client: { query } as unknown as PoolClient, query };
}

describe('action-specific gameplay recovery', () => {
  it.each([
    ['training', undefined],
    ['daily', undefined],
    ['amateur_duel', 'challenge'],
    ['amateur_duel', 'matchmaking'],
  ] as const)(
    'blocks Classic for one hour after accepted %s activity',
    async (mode, duelSource) => {
      const createdAt = at('2026-09-07T23:30:00+03:00');
      const { client } = gameplayClient([{ mode, createdAt, duelSource }]);

      await expect(
        getGameplayLockState(client, {
          userId: 'player-1',
          action: 'start_classic',
          now: at('2026-09-08T00:20:00+03:00'),
        }),
      ).resolves.toEqual({
        blocked: true,
        reason: 'recent_gameplay',
        endsAt: at('2026-09-08T00:30:00+03:00'),
      });
    },
  );

  it('uses the latest accepted activity and unlocks at the exact one-hour boundary', async () => {
    const { client } = gameplayClient([
      { mode: 'training', createdAt: at('2026-09-07T22:30:00+03:00') },
      { mode: 'daily', createdAt: at('2026-09-07T23:20:00+03:00') },
    ]);

    await expect(
      getGameplayLockState(client, {
        userId: 'player-1',
        action: 'start_classic',
        now: at('2026-09-08T00:20:00+03:00'),
      }),
    ).resolves.toEqual({ blocked: false, reason: null, endsAt: null });
  });

  it('excludes tournament duel shots from gameplay recovery', async () => {
    const { client, query } = gameplayClient([
      {
        mode: 'amateur_duel',
        duelSource: 'tournament',
        createdAt: at('2026-09-08T00:10:00+03:00'),
      },
    ]);

    await expect(
      getGameplayLockState(client, {
        userId: 'player-1',
        action: 'start_classic',
        now: at('2026-09-08T00:20:00+03:00'),
      }),
    ).resolves.toEqual({ blocked: false, reason: null, endsAt: null });
    expect(
      query.mock.calls.some((call) => String(call[0]).includes("m.source <> 'tournament'")),
    ).toBe(true);
  });

  it.each([
    ['training', 'start_training', false],
    ['training', 'start_daily_period', true],
    ['daily', 'start_daily_period', false],
    ['daily', 'start_training', true],
  ] satisfies Array<[ActivityMode, GameplayAction, boolean]>)(
    'keeps %s continuation available while action %s blocked=%s',
    async (mode, action, blocked) => {
      const { client } = gameplayClient([{ mode, createdAt: at('2026-09-08T00:10:00+03:00') }]);

      await expect(
        getGameplayLockState(client, {
          userId: 'player-1',
          action,
          now: at('2026-09-08T00:20:00+03:00'),
        }),
      ).resolves.toMatchObject({ blocked, reason: blocked ? 'recent_gameplay' : null });
    },
  );

  it.each([
    ['challenge', 'start_training'],
    ['challenge', 'start_daily_period'],
    ['matchmaking', 'start_training'],
    ['matchmaking', 'start_daily_period'],
  ] satisfies Array<[NonNullable<Activity['duelSource']>, GameplayAction]>)(
    'keeps %s duel recovery from blocking %s',
    async (duelSource, action) => {
      const { client } = gameplayClient([
        {
          mode: 'amateur_duel',
          duelSource,
          createdAt: at('2026-09-08T00:10:00+03:00'),
        },
      ]);

      await expect(
        getGameplayLockState(client, {
          userId: 'player-1',
          action,
          now: at('2026-09-08T00:20:00+03:00'),
        }),
      ).resolves.toEqual({ blocked: false, reason: null, endsAt: null });
    },
  );

  it.each([
    'start_ordinary_duel',
    'ordinary_duel_shot',
    'continue_classic',
  ] satisfies GameplayAction[])('does not apply recovery alone to %s', async (action) => {
    const { client, query } = gameplayClient([
      { mode: 'training', createdAt: at('2026-09-08T00:10:00+03:00') },
    ]);

    await expect(
      getGameplayLockState(client, {
        userId: 'player-1',
        action,
        now: at('2026-09-08T00:20:00+03:00'),
      }),
    ).resolves.toEqual({ blocked: false, reason: null, endsAt: null });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects a blocked action with the derived lock state', async () => {
    const { client } = gameplayClient([
      { mode: 'daily', createdAt: at('2026-09-08T00:10:00+03:00') },
    ]);

    await expect(
      assertGameplayActionAllowed(client, {
        userId: 'player-1',
        action: 'start_classic',
        now: at('2026-09-08T00:20:00+03:00'),
      }),
    ).rejects.toMatchObject({ code: 'conflict', statusCode: 409 });
  });
});

describe.skipIf(!hasIntegrationEnv)('scheduled tournament gameplay locks', () => {
  let pool: Pool;
  let userId: string;
  let opponentId: string;
  let fixtureSequence = 0;

  beforeAll(async () => {
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await applyMigrations(initPool, MIGRATIONS_DIR);
    await initPool.end();
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate users restart identity cascade');
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: 'gameplay-lock-user',
      displayName: 'Lock User',
      timezone: 'Europe/Moscow',
    });
    const opponent = await findOrCreateTelegramUser(pool, {
      providerUid: 'gameplay-lock-opponent',
      displayName: 'Lock Opponent',
      timezone: 'Europe/Moscow',
    });
    userId = user.id;
    opponentId = opponent.id;
  });

  async function createTournamentParticipants(input: {
    status: 'regular' | 'playoff';
    source: 'head_to_head' | 'classic';
  }): Promise<{ tournamentId: string; homeId: string; awayId: string }> {
    fixtureSequence += 1;
    const tournament = await pool.query<{ id: string }>(
      `insert into tournament (slug, title, status, regular_source, created_by)
       values ($1, 'Gameplay lock cup', $2, $3, $4)
       returning id`,
      [`gameplay-lock-${fixtureSequence}`, input.status, input.source, userId],
    );
    const home = await pool.query<{ id: string }>(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved') returning id`,
      [tournament.rows[0]!.id, userId],
    );
    const away = await pool.query<{ id: string }>(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved') returning id`,
      [tournament.rows[0]!.id, opponentId],
    );
    return {
      tournamentId: tournament.rows[0]!.id,
      homeId: home.rows[0]!.id,
      awayId: away.rows[0]!.id,
    };
  }

  async function createRegularFixture(startsAt: Date): Promise<{ fixtureId: string }> {
    const participants = await createTournamentParticipants({
      status: 'regular',
      source: 'head_to_head',
    });
    const round = await pool.query<{ id: string }>(
      `insert into tournament_round (tournament_id, stage, number, status, starts_at)
       values ($1, 'regular', 1, 'open', $2) returning id`,
      [participants.tournamentId, startsAt],
    );
    const fixture = await pool.query<{ id: string }>(
      `insert into tournament_fixture
         (tournament_id, round_id, fixture_number, home_participant_id,
          away_participant_id, scheduled_starts_at, window_ends_at, status)
       values ($1, $2, 1, $3, $4, $5, $6, 'scheduled') returning id`,
      [
        participants.tournamentId,
        round.rows[0]!.id,
        participants.homeId,
        participants.awayId,
        startsAt,
        new Date(startsAt.getTime() + 2 * 60 * 60_000),
      ],
    );
    return { fixtureId: fixture.rows[0]!.id };
  }

  async function createPlayoffBlock(startsAt: Date): Promise<{
    fixtureId: string;
    attemptId: string;
    gameDayId: string;
    seriesId: string;
  }> {
    const participants = await createTournamentParticipants({
      status: 'playoff',
      source: 'head_to_head',
    });
    const round = await pool.query<{ id: string }>(
      `insert into tournament_round (tournament_id, stage, number, status, starts_at)
       values ($1, 'playoff', 1, 'open', $2) returning id`,
      [participants.tournamentId, startsAt],
    );
    const series = await pool.query<{ id: string }>(
      `insert into tournament_playoff_series
         (tournament_id, round_id, bracket_position, higher_seed_participant_id,
          lower_seed_participant_id, wins_required, home_sequence, status)
       values ($1, $2, 1, $3, $4, 2, '["higher","lower"]'::jsonb, 'active')
       returning id`,
      [participants.tournamentId, round.rows[0]!.id, participants.homeId, participants.awayId],
    );
    const gameDay = await pool.query<{ id: string }>(
      `insert into tournament_round_game_day
         (round_id, day_number, local_date, first_game_local_time, first_game_starts_at,
          max_result_bearing_games, readiness_duration, planned_start_interval, status)
       values ($1, 1, ($2::timestamptz at time zone 'Europe/Moscow')::date, '18:00', $2,
               7, interval '10 minutes', interval '15 minutes', 'open') returning id`,
      [round.rows[0]!.id, startsAt],
    );
    const fixture = await pool.query<{ id: string }>(
      `insert into tournament_fixture
         (tournament_id, round_id, series_id, fixture_number, home_participant_id,
          away_participant_id, scheduled_starts_at, window_ends_at, status)
       values ($1, $2, $3, 1, $4, $5, $6, $7, 'active') returning id`,
      [
        participants.tournamentId,
        round.rows[0]!.id,
        series.rows[0]!.id,
        participants.homeId,
        participants.awayId,
        startsAt,
        new Date(startsAt.getTime() + 60 * 60_000),
      ],
    );
    const attempt = await pool.query<{ id: string }>(
      `insert into tournament_fixture_attempt
         (fixture_id, round_game_day_id, attempt_number, kind, status,
          scheduled_starts_at, readiness_expires_at, hard_deadline_at, is_result_bearing)
       values ($1, $2, 1, 'initial', 'active', $3, $4, $5, true) returning id`,
      [
        fixture.rows[0]!.id,
        gameDay.rows[0]!.id,
        startsAt,
        new Date(startsAt.getTime() + 10 * 60_000),
        new Date(startsAt.getTime() + 60 * 60_000),
      ],
    );
    return {
      fixtureId: fixture.rows[0]!.id,
      attemptId: attempt.rows[0]!.id,
      gameDayId: gameDay.rows[0]!.id,
      seriesId: series.rows[0]!.id,
    };
  }

  it('allows T-61 and blocks at the exact T-60 boundary', async () => {
    const startsAt = at('2026-09-08T18:00:00+03:00');
    await createRegularFixture(startsAt);

    await expect(
      getNearestScheduledTournamentBlock(
        pool as unknown as PoolClient,
        userId,
        at('2026-09-08T16:59:00+03:00'),
      ),
    ).resolves.toEqual({
      blocked: false,
      reason: null,
      endsAt: null,
      tournamentStartsAt: startsAt,
    });
    await expect(
      getNearestScheduledTournamentBlock(
        pool as unknown as PoolClient,
        userId,
        at('2026-09-08T17:00:00+03:00'),
      ),
    ).resolves.toEqual({
      blocked: true,
      reason: 'scheduled_tournament',
      endsAt: null,
      tournamentStartsAt: startsAt,
    });
  });

  it('keeps the pre-game hour locked across local midnight', async () => {
    const startsAt = at('2026-09-09T00:30:00+03:00');
    await createPlayoffBlock(startsAt);

    await expect(
      getNearestScheduledTournamentBlock(
        pool as unknown as PoolClient,
        userId,
        at('2026-09-08T23:30:00+03:00'),
      ),
    ).resolves.toMatchObject({
      blocked: true,
      reason: 'scheduled_tournament',
      tournamentStartsAt: startsAt,
    });
  });

  it('unlocks immediately after a regular fixture settles early', async () => {
    const fixture = await createRegularFixture(at('2026-09-08T18:00:00+03:00'));
    const now = at('2026-09-08T17:15:00+03:00');

    await expect(
      getNearestScheduledTournamentBlock(pool as unknown as PoolClient, userId, now),
    ).resolves.toMatchObject({ blocked: true });
    await pool.query(
      `update tournament_fixture
          set status = 'settled', settled_at = $2
        where id = $1`,
      [fixture.fixtureId, now],
    );

    await expect(
      getNearestScheduledTournamentBlock(pool as unknown as PoolClient, userId, now),
    ).resolves.toEqual({ blocked: false, reason: null, endsAt: null });
  });

  it('keeps unfinished playoff overtime locked after its stale deadline', async () => {
    const startsAt = at('2026-09-08T18:00:00+03:00');
    await createPlayoffBlock(startsAt);

    await expect(
      getNearestScheduledTournamentBlock(
        pool as unknown as PoolClient,
        userId,
        at('2026-09-08T20:30:00+03:00'),
      ),
    ).resolves.toMatchObject({
      blocked: true,
      reason: 'scheduled_tournament',
      tournamentStartsAt: startsAt,
      endsAt: null,
    });
  });

  it('keeps another overlapping scheduled block active when the first settles', async () => {
    const first = await createRegularFixture(at('2026-09-08T17:30:00+03:00'));
    await createRegularFixture(at('2026-09-08T18:00:00+03:00'));
    const now = at('2026-09-08T17:00:00+03:00');

    await pool.query(
      `update tournament_fixture
          set status = 'settled', settled_at = $2
        where id = $1`,
      [first.fixtureId, now],
    );

    await expect(
      getNearestScheduledTournamentBlock(pool as unknown as PoolClient, userId, now),
    ).resolves.toMatchObject({
      blocked: true,
      tournamentStartsAt: at('2026-09-08T18:00:00+03:00'),
    });
  });

  it('ignores playoff blocks whose series or whole game day completed', async () => {
    const completedSeries = await createPlayoffBlock(at('2026-09-08T18:00:00+03:00'));
    const completedDay = await createPlayoffBlock(at('2026-09-08T18:30:00+03:00'));
    await pool.query(`update tournament_playoff_series set status = 'completed' where id = $1`, [
      completedSeries.seriesId,
    ]);
    await pool.query(`update tournament_round_game_day set status = 'closed' where id = $1`, [
      completedDay.gameDayId,
    ]);

    await expect(
      getNearestScheduledTournamentBlock(
        pool as unknown as PoolClient,
        userId,
        at('2026-09-08T17:30:00+03:00'),
      ),
    ).resolves.toEqual({ blocked: false, reason: null, endsAt: null });
  });

  it('rejects a daily segment that can reach the T-60 lock boundary', async () => {
    await createPlayoffBlock(at('2026-09-08T18:00:00+03:00'));

    await expect(
      assertSafeSegmentStart(pool as unknown as PoolClient, {
        userId,
        now: at('2026-09-08T16:39:00+03:00'),
        maxSegmentDurationMs: 20 * 60_000,
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertSafeSegmentStart(pool as unknown as PoolClient, {
        userId,
        now: at('2026-09-08T16:40:00+03:00'),
        maxSegmentDurationMs: 20 * 60_000,
      }),
    ).rejects.toMatchObject({ code: 'conflict', statusCode: 409 });
  });

  it('activates the Classic lock on the first accepted shot until the session is terminal', async () => {
    const participants = await createTournamentParticipants({
      status: 'regular',
      source: 'classic',
    });
    const matchday = await pool.query<{ id: string }>(
      `insert into tournament_matchday
         (tournament_id, number, local_date, starts_at, ends_at, status)
       values ($1, 1, '2026-09-08', $2, $3, 'open') returning id`,
      [participants.tournamentId, at('2026-09-08T18:00:00+03:00'), at('2026-09-08T19:00:00+03:00')],
    );
    const session = await pool.query<{ id: string }>(
      `insert into tournament_classic_session
         (tournament_id, participant_id, matchday_id, tournament_day, state,
          current_period, rules_snapshot, game_core_version, session_seed, closes_at)
       values ($1, $2, $3, 1, 'period_active', 1, '{}'::jsonb, 1, 'classic-seed', $4)
       returning id`,
      [
        participants.tournamentId,
        participants.homeId,
        matchday.rows[0]!.id,
        at('2026-09-08T19:00:00+03:00'),
      ],
    );
    const input = {
      userId,
      action: 'start_training' as const,
      now: at('2026-09-08T20:30:00+03:00'),
    };

    await expect(getGameplayLockState(pool as unknown as PoolClient, input)).resolves.toEqual({
      blocked: false,
      reason: null,
      endsAt: null,
    });

    await pool.query(
      `insert into shot_session
         (user_id, mode, tournament_classic_session_id, period_number, shot_index,
          seed, input_payload, server_result, game_core_version, created_at)
       values ($1, 'tournament_classic', $2, 1, 1, 'shot-seed', '{}'::jsonb, 'miss', 1, $3)`,
      [userId, session.rows[0]!.id, at('2026-09-08T18:01:00+03:00')],
    );
    await pool.query(
      `update tournament_classic_session
          set state = 'break_active', period_started_at = null, break_started_at = $2
        where id = $1`,
      [session.rows[0]!.id, at('2026-09-08T18:02:00+03:00')],
    );

    await expect(getGameplayLockState(pool as unknown as PoolClient, input)).resolves.toEqual({
      blocked: true,
      reason: 'active_classic',
      endsAt: null,
    });
    const overlapping = await createRegularFixture(at('2026-09-08T21:00:00+03:00'));
    await expect(getGameplayLockState(pool as unknown as PoolClient, input)).resolves.toEqual({
      blocked: true,
      reason: 'active_classic',
      endsAt: null,
    });
    const batched = await getTournamentGameplayLockStates(
      pool as unknown as PoolClient,
      [userId, opponentId],
      input.now,
    );
    expect(batched.get(userId)).toEqual({ blocked: true, reason: 'active_classic', endsAt: null });
    expect(batched.get(opponentId)).toMatchObject({
      blocked: true,
      reason: 'scheduled_tournament',
    });

    await pool.query("update tournament_fixture set status = 'settled' where id = $1", [
      overlapping.fixtureId,
    ]);

    for (const terminalState of ['closed', 'expired'] as const) {
      await pool.query(`update tournament_classic_session set state = $2 where id = $1`, [
        session.rows[0]!.id,
        terminalState,
      ]);
      await expect(getGameplayLockState(pool as unknown as PoolClient, input)).resolves.toEqual({
        blocked: false,
        reason: null,
        endsAt: null,
      });
    }
  });
});

describe('gameplay serialization', () => {
  it('takes the transaction-scoped advisory lock for one user', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;

    await lockUserGameplay(client, 'player-1');

    expect(query).toHaveBeenCalledWith(
      "select pg_advisory_xact_lock(hashtext('gameplay:' || $1))",
      ['player-1'],
    );
  });

  it('exports the one-hour recovery duration', () => {
    expect(GAMEPLAY_RECOVERY_MS).toBe(3_600_000);
  });
});
