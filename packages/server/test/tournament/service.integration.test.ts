import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import {
  getFixtureLiveState,
  proposeFixtureLiveTime,
  respondFixtureLiveProposal,
} from '../../src/tournament/live.js';
import {
  applyToTournament,
  cancelTournament,
  createTournamentDraft,
  generateRegularSchedule,
  publishRegularSchedule,
  publishTournament,
  rescheduleTournamentFixture,
  startTournamentPlayoffs,
  type TournamentRulesSnapshot,
} from '../../src/tournament/service.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const ADMIN_ID = '00000000-0000-4000-8000-000000000701';
const PLAYER_IDS = [
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000712',
  '00000000-0000-4000-8000-000000000713',
  '00000000-0000-4000-8000-000000000714',
] as const;

function rules(entryFeeCoins: number): TournamentRulesSnapshot {
  return {
    config: parseTournamentConfig({
      regularSource: 'head_to_head',
      participantLimit: 4,
      playoffSize: 2,
      timezone: 'Europe/Moscow',
      registrationMode: 'open',
      visibility: 'public',
      entryFeeCoins,
      roundRobinCycles: 2,
      roundsPerDay: 2,
      firstRoundLocalTime: '10:00',
      fixtureWindowMs: 3_600_000,
      roundBreakMs: 900_000,
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
    regularDuelTemplateId: '00000000-0000-4000-8000-000000000799',
  };
}

async function seedUsers(pool: Pool, playerBalance: number): Promise<void> {
  await pool.query(
    `insert into users (id, display_name, timezone, role, level, lifetime_goals_total, experience)
     values ($1, 'Tournament Admin', 'Europe/Moscow', 'admin', 10, 1000, 1000)`,
    [ADMIN_ID],
  );
  for (const [index, playerId] of PLAYER_IDS.entries()) {
    await pool.query(
      `insert into users
         (id, display_name, timezone, level, lifetime_goals_total, experience)
       values ($1, $2, 'Europe/Moscow', 5, 500, 500)`,
      [playerId, `Tournament Player ${index + 1}`],
    );
    await pool.query(`insert into user_currency_account (user_id, balance) values ($1, $2)`, [
      playerId,
      playerBalance,
    ]);
  }
}

async function createPublishedTournament(
  pool: Pool,
  slug: string,
  entryFeeCoins: number,
  tournamentRules: TournamentRulesSnapshot = rules(entryFeeCoins),
) {
  const tournament = await createTournamentDraft(pool, {
    slug,
    title: 'Integration Championship',
    description: 'Tournament integration test',
    rules: tournamentRules,
    createdBy: ADMIN_ID,
    registrationOpensAt: null,
    registrationClosesAt: null,
    startsAt: new Date('2030-09-01T07:00:00.000Z'),
  });
  await publishTournament(pool, tournament.id, tournament.revision, ADMIN_ID);
  return tournament;
}

function playoffTournamentRules(
  playoffSize: 2 | 4,
  extra: Record<string, unknown> = {},
): TournamentRulesSnapshot {
  return {
    ...rules(0),
    config: parseTournamentConfig({
      regularSource: 'head_to_head',
      participantLimit: 4,
      playoffSize,
      timezone: 'Europe/Moscow',
      registrationMode: 'open',
      visibility: 'public',
      entryFeeCoins: 0,
      roundRobinCycles: 1,
      roundsPerDay: 1,
      firstRoundLocalTime: '10:00',
      fixtureWindowMs: 3_600_000,
      roundBreakMs: 900_000,
      dailyDays: null,
      dailyMetric: null,
      bestDays: null,
    }),
    ...extra,
  };
}

async function prepareTournamentForPlayoffs(
  pool: Pool,
  tournamentId: string,
  points: number[],
): Promise<string[]> {
  for (const playerId of PLAYER_IDS) {
    await pool.query(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved')`,
      [tournamentId, playerId],
    );
  }
  const participants = await pool.query<{ id: string }>(
    `select id from tournament_participant where tournament_id = $1 order by user_id`,
    [tournamentId],
  );
  const participantIds = participants.rows.map((participant) => participant.id);
  const regularRound = await pool.query<{ id: string }>(
    `insert into tournament_round
       (tournament_id, stage, number, starts_at, ends_at, rules_snapshot)
     values ($1, 'regular', 1, $2, $3, '{}'::jsonb) returning id`,
    [tournamentId, new Date('2030-09-01T10:00:00.000Z'), new Date('2030-09-01T11:00:00.000Z')],
  );
  await pool.query(
    `insert into tournament_fixture
       (tournament_id, round_id, fixture_number, home_participant_id, away_participant_id,
        scheduled_starts_at, window_ends_at, status)
     values ($1, $2, 1, $3, $4, $5, $6, 'scheduled')`,
    [
      tournamentId,
      regularRound.rows[0]!.id,
      participantIds[0]!,
      participantIds[1]!,
      new Date('2030-09-01T10:00:00.000Z'),
      new Date('2030-09-01T11:00:00.000Z'),
    ],
  );
  for (const [index, participantId] of participantIds.entries()) {
    await pool.query(
      `insert into tournament_adjustment
         (tournament_id, participant_id, kind, payload, reason, created_by)
       values ($1, $2, 'points', $3, 'integration standings seed', $4)`,
      [tournamentId, participantId, JSON.stringify({ delta: points[index]! }), ADMIN_ID],
    );
  }
  await pool.query(`update tournament set status = 'regular' where id = $1`, [tournamentId]);
  return participantIds;
}

describe.skipIf(!hasIntegrationEnv)('tournament service integration', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('charges and refunds an entry fee exactly once under concurrent requests', async () => {
    await seedUsers(pool, 100);
    const tournament = await createPublishedTournament(pool, 'concurrent-entry-fee', 25);

    const applications = await Promise.allSettled([
      applyToTournament(pool, tournament.id, PLAYER_IDS[0]),
      applyToTournament(pool, tournament.id, PLAYER_IDS[0]),
    ]);

    expect(applications.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(applications.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const charged = await pool.query<{ balance: number }>(
      `select balance from user_currency_account where user_id = $1`,
      [PLAYER_IDS[0]],
    );
    expect(charged.rows[0]?.balance).toBe(75);

    const entryEvents = await pool.query<{ count: string }>(
      `select count(*)::text as count from tournament_economy_event
        where tournament_id = $1 and kind = 'entry_fee' and status = 'applied'`,
      [tournament.id],
    );
    expect(entryEvents.rows[0]?.count).toBe('1');

    const cancellations = await Promise.allSettled([
      cancelTournament(pool, tournament.id, tournament.revision, ADMIN_ID),
      cancelTournament(pool, tournament.id, tournament.revision, ADMIN_ID),
    ]);
    expect(cancellations.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(cancellations.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const refunded = await pool.query<{ balance: number }>(
      `select balance from user_currency_account where user_id = $1`,
      [PLAYER_IDS[0]],
    );
    expect(refunded.rows[0]?.balance).toBe(100);

    const refundEvents = await pool.query<{ count: string }>(
      `select count(*)::text as count from tournament_economy_event
        where tournament_id = $1 and kind = 'entry_refund' and status = 'applied'`,
      [tournament.id],
    );
    expect(refundEvents.rows[0]?.count).toBe('1');
  });

  it('rolls back the participant and economy event when the balance is insufficient', async () => {
    await seedUsers(pool, 10);
    const tournament = await createPublishedTournament(pool, 'insufficient-entry-fee', 25);

    await expect(applyToTournament(pool, tournament.id, PLAYER_IDS[0])).rejects.toMatchObject({
      code: 'insufficient_coins',
    });

    const participants = await pool.query<{ count: string }>(
      `select count(*)::text as count from tournament_participant where tournament_id = $1`,
      [tournament.id],
    );
    expect(participants.rows[0]?.count).toBe('0');

    const events = await pool.query<{ count: string }>(
      `select count(*)::text as count from tournament_economy_event where tournament_id = $1`,
      [tournament.id],
    );
    expect(events.rows[0]?.count).toBe('0');
  });

  it('regenerates a round-robin schedule without duplicate persisted rows', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(pool, 'schedule-regeneration', 0);
    for (const playerId of PLAYER_IDS) {
      await applyToTournament(pool, tournament.id, playerId);
    }

    const first = await generateRegularSchedule(pool, tournament.id, tournament.revision);
    const second = await generateRegularSchedule(pool, tournament.id, tournament.revision);

    expect(first).toMatchObject({ status: 'scheduling', roundCount: 6, fixtureCount: 12 });
    expect(second).toMatchObject({ status: 'scheduling', roundCount: 6, fixtureCount: 12 });

    const persisted = await pool.query<{
      matchdays: string;
      rounds: string;
      fixtures: string;
      participant_appearances: string;
    }>(
      `select
         (select count(*) from tournament_matchday where tournament_id = $1)::text as matchdays,
         (select count(*) from tournament_round where tournament_id = $1)::text as rounds,
         (select count(*) from tournament_fixture where tournament_id = $1)::text as fixtures,
         (select count(*) from tournament_fixture f
           where f.tournament_id = $1
             and ($2 = f.home_participant_id or $2 = f.away_participant_id))::text
           as participant_appearances`,
      [
        tournament.id,
        (
          await pool.query<{ id: string }>(
            `select id from tournament_participant where tournament_id = $1 and user_id = $2`,
            [tournament.id, PLAYER_IDS[0]],
          )
        ).rows[0]!.id,
      ],
    );
    expect(persisted.rows[0]).toEqual({
      matchdays: '3',
      rounds: '6',
      fixtures: '12',
      participant_appearances: '6',
    });
  });

  it('returns a stable live DTO through proposal and acceptance', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(pool, 'live-proposal-contract', 0);
    await applyToTournament(pool, tournament.id, PLAYER_IDS[0]);
    await applyToTournament(pool, tournament.id, PLAYER_IDS[1]);
    await generateRegularSchedule(pool, tournament.id, tournament.revision);
    await publishRegularSchedule(pool, tournament.id);
    const fixture = await pool.query<{ id: string }>(
      `select id from tournament_fixture where tournament_id = $1 order by fixture_number limit 1`,
      [tournament.id],
    );
    const fixtureId = fixture.rows[0]!.id;

    expect(await getFixtureLiveState(pool, fixtureId, PLAYER_IDS[0])).toEqual({
      fixtureId,
      status: 'scheduled',
      score: { home: 0, away: 0 },
      scheduledStartsAt: '2030-09-01T07:00:00.000Z',
      windowEndsAt: '2030-09-01T08:00:00.000Z',
      proposal: null,
      duelMatchId: null,
      participants: [],
    });

    const proposal = await proposeFixtureLiveTime(pool, {
      fixtureId,
      userId: PLAYER_IDS[0],
      proposedAt: new Date('2030-09-01T07:30:00.000Z'),
    });
    await respondFixtureLiveProposal(pool, {
      fixtureId,
      proposalId: proposal.id,
      userId: PLAYER_IDS[1],
      accept: true,
    });

    expect(await getFixtureLiveState(pool, fixtureId, PLAYER_IDS[1])).toMatchObject({
      fixtureId,
      scheduledStartsAt: '2030-09-01T07:30:00.000Z',
      proposal: {
        id: proposal.id,
        proposedAt: '2030-09-01T07:30:00.000Z',
        proposedByUserId: PLAYER_IDS[0],
        state: 'accepted',
      },
    });
  });

  it('materializes deterministic playoff windows from dependencies and configured round slots', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'deterministic-playoff-windows',
      0,
      playoffTournamentRules(4, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 2,
            homeSequence: ['H', 'A', 'H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000801',
            gameWindowMs: 3_600_000,
            gameBreakMs: 1_800_000,
            roundBreakMs: 5_400_000,
            firstGameStartsAt: '2030-09-01T13:00:00.000Z',
          },
          {
            roundNumber: 2,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000802',
            gameWindowMs: 1_800_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T16:00:00.000Z',
          },
        ],
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);

    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const rounds = await pool.query<{
      stage: string;
      number: number;
      starts_at: Date;
      ends_at: Date;
      rules_snapshot: { duelTemplateId: string };
    }>(
      `select stage, number, starts_at, ends_at, rules_snapshot
         from tournament_round
        where tournament_id = $1 and stage in ('playoff', 'third_place')
        order by stage, number`,
      [tournament.id],
    );
    expect(
      rounds.rows.map((round) => ({
        stage: round.stage,
        number: Number(round.number),
        startsAt: round.starts_at?.toISOString() ?? null,
        endsAt: round.ends_at?.toISOString() ?? null,
        duelTemplateId: round.rules_snapshot.duelTemplateId,
      })),
    ).toEqual([
      {
        stage: 'playoff',
        number: 1,
        startsAt: '2030-09-01T13:00:00.000Z',
        endsAt: '2030-09-01T17:00:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000801',
      },
      {
        stage: 'playoff',
        number: 2,
        startsAt: '2030-09-01T18:30:00.000Z',
        endsAt: '2030-09-01T19:00:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000802',
      },
      {
        stage: 'third_place',
        number: 2,
        startsAt: '2030-09-01T18:30:00.000Z',
        endsAt: '2030-09-01T19:00:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000802',
      },
    ]);

    const fixtures = await pool.query<{
      stage: string;
      round_number: number;
      scheduled_starts_at: Date;
      window_ends_at: Date;
      result_snapshot: { duelTemplateId: string };
    }>(
      `select r.stage, r.number as round_number, f.scheduled_starts_at, f.window_ends_at,
              f.result_snapshot
         from tournament_fixture f
         join tournament_round r on r.id = f.round_id
        where f.tournament_id = $1 and r.stage in ('playoff', 'third_place')
        order by r.stage, r.number, f.fixture_number`,
      [tournament.id],
    );
    expect(
      fixtures.rows.map((fixture) => ({
        stage: fixture.stage,
        roundNumber: Number(fixture.round_number),
        startsAt: fixture.scheduled_starts_at?.toISOString() ?? null,
        endsAt: fixture.window_ends_at?.toISOString() ?? null,
        duelTemplateId: fixture.result_snapshot.duelTemplateId,
      })),
    ).toEqual([
      {
        stage: 'playoff',
        roundNumber: 1,
        startsAt: '2030-09-01T13:00:00.000Z',
        endsAt: '2030-09-01T14:00:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000801',
      },
      {
        stage: 'playoff',
        roundNumber: 1,
        startsAt: '2030-09-01T14:30:00.000Z',
        endsAt: '2030-09-01T15:30:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000801',
      },
      {
        stage: 'playoff',
        roundNumber: 1,
        startsAt: '2030-09-01T16:00:00.000Z',
        endsAt: '2030-09-01T17:00:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000801',
      },
      {
        stage: 'playoff',
        roundNumber: 1,
        startsAt: '2030-09-01T13:00:00.000Z',
        endsAt: '2030-09-01T14:00:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000801',
      },
      {
        stage: 'playoff',
        roundNumber: 1,
        startsAt: '2030-09-01T14:30:00.000Z',
        endsAt: '2030-09-01T15:30:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000801',
      },
      {
        stage: 'playoff',
        roundNumber: 1,
        startsAt: '2030-09-01T16:00:00.000Z',
        endsAt: '2030-09-01T17:00:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000801',
      },
      {
        stage: 'playoff',
        roundNumber: 2,
        startsAt: '2030-09-01T18:30:00.000Z',
        endsAt: '2030-09-01T19:00:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000802',
      },
      {
        stage: 'third_place',
        roundNumber: 2,
        startsAt: '2030-09-01T18:30:00.000Z',
        endsAt: '2030-09-01T19:00:00.000Z',
        duelTemplateId: '00000000-0000-4000-8000-000000000802',
      },
    ]);
  });

  it('materializes sequential playable tie-break fixtures with explicit timing and duel rules', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'timed-playoff-tie-break',
      0,
      playoffTournamentRules(2, {
        tieBreakDuelTemplateId: '00000000-0000-4000-8000-000000000803',
        tieBreakGameWindowMs: 1_800_000,
        tieBreakGameBreakMs: 600_000,
        tieBreakFirstGameStartsAt: '2030-09-01T12:00:00.000Z',
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 3, 3]);

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z')),
    ).resolves.toEqual({
      tournamentId: tournament.id,
      status: 'tiebreak_required',
      participantIds: expect.any(Array),
    });

    const round = await pool.query<{
      starts_at: Date;
      ends_at: Date;
      status: string;
      rules_snapshot: { duelTemplateId: string };
    }>(
      `select starts_at, ends_at, status, rules_snapshot
         from tournament_round
        where tournament_id = $1 and stage = 'tiebreak'`,
      [tournament.id],
    );
    expect(round.rows).toHaveLength(1);
    expect(round.rows[0]).toMatchObject({
      starts_at: new Date('2030-09-01T12:00:00.000Z'),
      ends_at: new Date('2030-09-01T13:50:00.000Z'),
      status: 'scheduled',
      rules_snapshot: { duelTemplateId: '00000000-0000-4000-8000-000000000803' },
    });

    const fixtures = await pool.query<{
      scheduled_starts_at: Date;
      window_ends_at: Date;
      status: string;
      result_snapshot: { duelTemplateId: string };
    }>(
      `select f.scheduled_starts_at, f.window_ends_at, f.status, f.result_snapshot
         from tournament_fixture f
         join tournament_round r on r.id = f.round_id
        where f.tournament_id = $1 and r.stage = 'tiebreak'
        order by f.fixture_number`,
      [tournament.id],
    );
    expect(
      fixtures.rows.map((fixture) => ({
        startsAt: fixture.scheduled_starts_at?.toISOString() ?? null,
        endsAt: fixture.window_ends_at?.toISOString() ?? null,
        status: fixture.status,
        duelTemplateId: fixture.result_snapshot.duelTemplateId,
      })),
    ).toEqual([
      {
        startsAt: '2030-09-01T12:00:00.000Z',
        endsAt: '2030-09-01T12:30:00.000Z',
        status: 'scheduled',
        duelTemplateId: '00000000-0000-4000-8000-000000000803',
      },
      {
        startsAt: '2030-09-01T12:40:00.000Z',
        endsAt: '2030-09-01T13:10:00.000Z',
        status: 'scheduled',
        duelTemplateId: '00000000-0000-4000-8000-000000000803',
      },
      {
        startsAt: '2030-09-01T13:20:00.000Z',
        endsAt: '2030-09-01T13:50:00.000Z',
        status: 'scheduled',
        duelTemplateId: '00000000-0000-4000-8000-000000000803',
      },
    ]);
  });

  it('falls back to safe playoff timing when configured rule durations or ISO time are invalid', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'safe-playoff-timing-defaults',
      0,
      playoffTournamentRules(2, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000804',
            gameWindowMs: 0,
            gameBreakMs: -1,
            roundBreakMs: -1,
            firstGameStartsAt: '2031-02-31T12:00:00.000Z',
          },
        ],
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);

    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const round = await pool.query<{
      starts_at: Date;
      ends_at: Date;
      rules_snapshot: Record<string, unknown>;
    }>(
      `select starts_at, ends_at, rules_snapshot
         from tournament_round
        where tournament_id = $1 and stage = 'playoff' and number = 1`,
      [tournament.id],
    );
    expect(round.rows[0]).toMatchObject({
      starts_at: new Date('2030-09-01T11:00:00.000Z'),
      ends_at: new Date('2030-09-02T11:00:00.000Z'),
      rules_snapshot: {
        gameWindowMs: 86_400_000,
        gameBreakMs: 0,
        roundBreakMs: 0,
        firstGameStartsAt: null,
      },
    });
  });

  it('uses regular tournament template and schedule defaults for an unspecified tie-break', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'tie-break-regular-defaults',
      0,
      playoffTournamentRules(2),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 3, 3]);

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z')),
    ).resolves.toMatchObject({ status: 'tiebreak_required' });

    const round = await pool.query<{
      starts_at: Date;
      ends_at: Date;
      rules_snapshot: Record<string, unknown>;
    }>(
      `select starts_at, ends_at, rules_snapshot
         from tournament_round
        where tournament_id = $1 and stage = 'tiebreak'`,
      [tournament.id],
    );
    expect(round.rows[0]).toMatchObject({
      starts_at: new Date('2030-09-01T11:00:00.000Z'),
      ends_at: new Date('2030-09-01T14:30:00.000Z'),
      rules_snapshot: {
        duelTemplateId: '00000000-0000-4000-8000-000000000799',
        gameWindowMs: 3_600_000,
        gameBreakMs: 900_000,
      },
    });
  });

  it('starts playoffs after the saved break from a rescheduled last tie-break fixture', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'playoffs-after-tie-break-round-break',
      0,
      playoffTournamentRules(2),
    );
    const participantIds = await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    const tieBreakRound = await pool.query<{ id: string }>(
      `insert into tournament_round
         (tournament_id, stage, number, starts_at, ends_at, status, rules_snapshot)
       values ($1, 'tiebreak', 1, $2, $3, 'scheduled', $4) returning id`,
      [
        tournament.id,
        new Date('2030-09-01T11:00:00.000Z'),
        new Date('2030-09-01T12:00:00.000Z'),
        JSON.stringify({ roundBreakMs: 1_800_000 }),
      ],
    );
    const tieBreakFixture = await pool.query<{ id: string }>(
      `insert into tournament_fixture
         (tournament_id, round_id, fixture_number, home_participant_id, away_participant_id,
          scheduled_starts_at, window_ends_at, status)
       values ($1, $2, 100001, $3, $4, $5, $6, 'scheduled') returning id`,
      [
        tournament.id,
        tieBreakRound.rows[0]!.id,
        participantIds[1]!,
        participantIds[2]!,
        new Date('2030-09-01T11:00:00.000Z'),
        new Date('2030-09-01T12:00:00.000Z'),
      ],
    );
    await rescheduleTournamentFixture(pool, {
      tournamentId: tournament.id,
      fixtureId: tieBreakFixture.rows[0]!.id,
      startsAt: new Date('2030-09-01T12:00:00.000Z'),
      endsAt: new Date('2030-09-01T13:00:00.000Z'),
      reason: 'integration tie-break delay',
      adminUserId: ADMIN_ID,
    });
    await pool.query(`update tournament_fixture set status = 'settled' where id = $1`, [
      tieBreakFixture.rows[0]!.id,
    ]);
    await pool.query(`update tournament_round set status = 'settled' where id = $1`, [
      tieBreakRound.rows[0]!.id,
    ]);

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z')),
    ).resolves.toMatchObject({ status: 'playoff' });

    const firstPlayoffRound = await pool.query<{ starts_at: Date }>(
      `select starts_at from tournament_round
        where tournament_id = $1 and stage = 'playoff' and number = 1`,
      [tournament.id],
    );
    expect(firstPlayoffRound.rows[0]?.starts_at?.toISOString()).toBe('2030-09-01T13:30:00.000Z');
  });

  it('falls back from fractional and oversized playoff timing durations', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'integral-bounded-playoff-durations',
      0,
      playoffTournamentRules(2, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000805',
            gameWindowMs: 0.5,
            gameBreakMs: 1.5,
            roundBreakMs: 31 * 86_400_000,
          },
        ],
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z')),
    ).resolves.toMatchObject({ status: 'playoff' });

    const round = await pool.query<{ ends_at: Date; rules_snapshot: Record<string, unknown> }>(
      `select ends_at, rules_snapshot from tournament_round
        where tournament_id = $1 and stage = 'playoff' and number = 1`,
      [tournament.id],
    );
    expect(round.rows[0]).toMatchObject({
      ends_at: new Date('2030-09-02T11:00:00.000Z'),
      rules_snapshot: {
        gameWindowMs: 86_400_000,
        gameBreakMs: 0,
        roundBreakMs: 0,
      },
    });
  });
});
