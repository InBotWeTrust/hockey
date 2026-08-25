import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Pool as PgPool, type Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTournamentDuelMatch } from '../../src/duel/amateur/routes.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import {
  getFixtureLiveState,
  proposeFixtureLiveTime,
  respondFixtureLiveProposal,
} from '../../src/tournament/live.js';
import {
  applyToTournament,
  approveTournamentParticipant,
  cancelTournament,
  createTournamentDraft,
  disqualifyTournamentParticipant,
  generateRegularSchedule,
  inviteTournamentParticipant,
  publishRegularSchedule,
  publishTournament,
  rescheduleTournamentFixture,
  resolveTournamentNoShow,
  startTournamentPlayoffs,
  type TournamentRulesSnapshot,
} from '../../src/tournament/service.js';
import * as tournamentService from '../../src/tournament/service.js';
import {
  openTournamentFixtureSegment,
  settleTournamentSegmentForDuel,
} from '../../src/tournament/fixtureLifecycle.js';
import { dispatchTournamentCommunication } from '../../src/tournament/communications.js';
import { enqueueTournamentPush } from '../../src/push/tournament.js';
import { grantTournamentStageRewards } from '../../src/tournament/rewards.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';
import { waitForBlockedWriter } from '../helpers/postgresLocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const ADMIN_ID = '00000000-0000-4000-8000-000000000701';
const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';
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

async function createLiveFixture(
  pool: Pool,
  input: { slug: string; title: string; playerIds: readonly string[] },
) {
  const tournament = await createPublishedTournament(pool, input.slug, 0);
  await pool.query(`update tournament set title = $2 where id = $1`, [tournament.id, input.title]);
  for (const playerId of input.playerIds) {
    await applyToTournament(pool, tournament.id, playerId);
  }
  await generateRegularSchedule(pool, tournament.id, tournament.revision);
  await publishRegularSchedule(pool, tournament.id);
  const fixture = await pool.query<{ id: string }>(
    `select id from tournament_fixture where tournament_id = $1 order by fixture_number limit 1`,
    [tournament.id],
  );
  return { fixtureId: fixture.rows[0]!.id, tournamentId: tournament.id, title: input.title };
}

async function attachActiveTournamentDuel(pool: Pool, fixtureId: string) {
  const fixture = await pool.query<{
    tournament_id: string;
    home_participant_id: string;
    away_participant_id: string;
    home_user_id: string;
    away_user_id: string;
  }>(
    `select fixture.tournament_id, fixture.home_participant_id, fixture.away_participant_id,
            home_participant.user_id as home_user_id,
            away_participant.user_id as away_user_id
       from tournament_fixture fixture
       join tournament_participant home_participant on home_participant.id = fixture.home_participant_id
       join tournament_participant away_participant on away_participant.id = fixture.away_participant_id
      where fixture.id = $1`,
    [fixtureId],
  );
  const context = fixture.rows[0]!;
  const duel = await pool.query<{ id: string }>(
    `insert into amateur_duel_match
       (challenger_user_id, opponent_user_id, status, source, rules_snapshot,
        match_seed, starts_at, ends_at, game_core_version)
     values ($1, $2, 'active', 'tournament', '{}'::jsonb,
             'terminal-lifecycle-regression', $3, $4, 1)
     returning id`,
    [
      context.home_user_id,
      context.away_user_id,
      new Date('2030-09-01T07:00:00.000Z'),
      new Date('2030-09-01T08:00:00.000Z'),
    ],
  );
  await pool.query(
    `insert into amateur_duel_participant (match_id, user_id, side, state)
     values ($1, $2, 'challenger', 'accepted'), ($1, $3, 'opponent', 'accepted')`,
    [duel.rows[0]!.id, context.home_user_id, context.away_user_id],
  );
  await pool.query(`update tournament_fixture set status = 'active' where id = $1`, [fixtureId]);
  await pool.query(
    `insert into tournament_fixture_segment
       (fixture_id, sequence_number, kind, duel_match_id, status, rules_snapshot)
     values ($1, 1, 'regulation', $2, 'active', '{}'::jsonb)`,
    [fixtureId, duel.rows[0]!.id],
  );
  return {
    duelMatchId: duel.rows[0]!.id,
    tournamentId: context.tournament_id,
    homeParticipantId: context.home_participant_id,
  };
}

async function installFailingPushTrigger(pool: Pool, eventType: string): Promise<void> {
  if (!/^tournament\.[a-z_]+$/.test(eventType)) throw new Error('unsafe test event type');
  await pool.query(`
    create or replace function fail_selected_tournament_push() returns trigger as $$
    begin
      if new.event_type = '${eventType}' then
        raise exception 'forced tournament push failure: ${eventType}';
      end if;
      return new;
    end;
    $$ language plpgsql;
    create trigger fail_selected_tournament_push
      before insert on push_delivery_log
      for each row execute function fail_selected_tournament_push();
  `);
}

async function removeFailingPushTrigger(pool: Pool): Promise<void> {
  await pool.query(`
    drop trigger if exists fail_selected_tournament_push on push_delivery_log;
    drop function if exists fail_selected_tournament_push();
  `);
}

async function subscribeTournamentUsers(pool: Pool, userIds: readonly string[]): Promise<void> {
  for (const userId of userIds) {
    await pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ($1, $2, 'p256dh', 'auth') on conflict do nothing`,
      [userId, `https://push.example.test/transaction-${userId}`],
    );
  }
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

function dailyPlayoffTournamentRules(): TournamentRulesSnapshot {
  return {
    ...rules(0),
    config: parseTournamentConfig({
      regularSource: 'daily_aggregate',
      participantLimit: 4,
      playoffSize: 2,
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
      dailyMetric: 'accuracy_average',
      bestDays: 1,
    }),
    tieBreakDuelTemplateId: '00000000-0000-4000-8000-000000000803',
    tieBreakGameWindowMs: 1_800_000,
    tieBreakGameBreakMs: 0,
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
	     values ($1, $2, 1, $3, $4, $5, $6, 'settled')`,
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

async function prepareDailyTournamentForPlayoffs(
  pool: Pool,
  tournamentId: string,
  points: readonly [number, number, number, number] = [0.9, 0.5, 0.5, 0.1],
): Promise<string[]> {
  for (const playerId of PLAYER_IDS) {
    await pool.query(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved')`,
      [tournamentId, playerId],
    );
  }
  const participants = await pool.query<{ id: string; user_id: string }>(
    `select id, user_id from tournament_participant where tournament_id = $1 order by user_id`,
    [tournamentId],
  );
  for (const [index, participant] of participants.rows.entries()) {
    await pool.query(
      `insert into tournament_daily_result
         (tournament_id, participant_id, tournament_day, player_local_date,
          goals, shots, accuracy, place, place_points, completed, source_snapshot, finalized_at)
       values ($1, $2, 1, '2030-09-01', $3, 10, $4, $5, 0, true, $6, $7)`,
      [
        tournamentId,
        participant.id,
        Math.round(points[index]! * 10),
        points[index],
        index + 1,
        JSON.stringify({ userId: participant.user_id, periodCount: 3 }),
        new Date('2030-09-02T00:00:00.000Z'),
      ],
    );
    await pool.query(
      `insert into tournament_standing
         (tournament_id, participant_id, rank, points, metrics, tie_key, source_version)
       values ($1, $2, $3, $4, $5, $6, 4)`,
      [
        tournamentId,
        participant.id,
        index + 1,
        points[index],
        JSON.stringify({ metric: 'accuracy_average', countedDays: [1] }),
        JSON.stringify([points[index]]),
      ],
    );
  }
  await pool.query(`update tournament set status = 'regular' where id = $1`, [tournamentId]);
  return participants.rows.map((participant) => participant.id);
}

function unorderedParticipantPair(left: string, right: string): string {
  return [left, right].sort().join(':');
}

async function settleExpectedTieBreakRound(
  pool: Pool,
  input: {
    tournamentId: string;
    roundNumber: number;
    outcomes: Array<{ pair: readonly [string, string]; winnerParticipantId: string }>;
  },
): Promise<void> {
  const fixtures = await pool.query<{
    id: string;
    home_participant_id: string;
    away_participant_id: string;
    status: string;
    scheduled_starts_at: Date | null;
    window_ends_at: Date | null;
    result_snapshot: { duelTemplateId: string };
  }>(
    `select fixture.id, fixture.home_participant_id, fixture.away_participant_id, fixture.status,
            fixture.scheduled_starts_at, fixture.window_ends_at, fixture.result_snapshot
       from tournament_fixture fixture
       join tournament_round round on round.id = fixture.round_id and round.stage = 'tiebreak'
      where fixture.tournament_id = $1 and round.number = $2
      order by fixture.fixture_number`,
    [input.tournamentId, input.roundNumber],
  );
  expect(
    fixtures.rows
      .map((fixture) =>
        unorderedParticipantPair(fixture.home_participant_id, fixture.away_participant_id),
      )
      .sort(),
  ).toEqual(
    input.outcomes
      .map((outcome) => unorderedParticipantPair(outcome.pair[0], outcome.pair[1]))
      .sort(),
  );
  for (const fixture of fixtures.rows) {
    expect(fixture.status).toBe('scheduled');
    expect(fixture.scheduled_starts_at).toBeInstanceOf(Date);
    expect(fixture.window_ends_at).toBeInstanceOf(Date);
    expect(fixture.window_ends_at!.getTime()).toBeGreaterThan(
      fixture.scheduled_starts_at!.getTime(),
    );
    expect(fixture.result_snapshot.duelTemplateId).toBe('00000000-0000-4000-8000-000000000803');
  }
  for (const fixture of fixtures.rows) {
    const pair = unorderedParticipantPair(fixture.home_participant_id, fixture.away_participant_id);
    const expected = input.outcomes.find(
      (outcome) => unorderedParticipantPair(outcome.pair[0], outcome.pair[1]) === pair,
    )!;
    expect([fixture.home_participant_id, fixture.away_participant_id]).toContain(
      expected.winnerParticipantId,
    );
    await resolveTournamentNoShow(pool, {
      tournamentId: input.tournamentId,
      fixtureId: fixture.id,
      absent: fixture.home_participant_id === expected.winnerParticipantId ? 'away' : 'home',
      reason: `settle daily tie-break round ${input.roundNumber}`,
      adminUserId: ADMIN_ID,
    });
  }
  const settled = await pool.query<{
    home_participant_id: string;
    away_participant_id: string;
    winner_participant_id: string;
    status: string;
  }>(
    `select fixture.home_participant_id, fixture.away_participant_id,
            fixture.winner_participant_id, fixture.status
       from tournament_fixture fixture
       join tournament_round round on round.id = fixture.round_id and round.stage = 'tiebreak'
      where fixture.tournament_id = $1 and round.number = $2
      order by fixture.fixture_number`,
    [input.tournamentId, input.roundNumber],
  );
  expect(
    settled.rows
      .map((fixture) => ({
        pair: unorderedParticipantPair(fixture.home_participant_id, fixture.away_participant_id),
        winnerParticipantId: fixture.winner_participant_id,
        status: fixture.status,
      }))
      .sort((left, right) => left.pair.localeCompare(right.pair)),
  ).toEqual(
    input.outcomes
      .map((outcome) => ({
        pair: unorderedParticipantPair(outcome.pair[0], outcome.pair[1]),
        winnerParticipantId: outcome.winnerParticipantId,
        status: 'forfeit',
      }))
      .sort((left, right) => left.pair.localeCompare(right.pair)),
  );
}

async function subscribeTournamentParticipants(pool: Pool, participantIds: readonly string[]) {
  await pool.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
     select p.user_id, 'https://push.example.test/' || p.id, 'p256dh', 'auth'
       from tournament_participant p
      where p.id = any($1::uuid[])`,
    [participantIds],
  );
}

function bestOfThreePlayoffRules(): TournamentRulesSnapshot {
  return playoffTournamentRules(2, {
    playoffRounds: [
      {
        roundNumber: 1,
        winsRequired: 2,
        homeSequence: ['H', 'A', 'H'],
        duelTemplateId: '00000000-0000-4000-8000-000000000814',
        gameWindowMs: 3_600_000,
        gameBreakMs: 0,
        roundBreakMs: 0,
        firstGameStartsAt: '2030-09-01T13:00:00.000Z',
      },
    ],
  });
}

async function createBestOfThreePlayoff(pool: Pool, slug: string) {
  await seedUsers(pool, 0);
  const tournament = await createPublishedTournament(pool, slug, 0, bestOfThreePlayoffRules());
  await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
  await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));
  const fixtures = await pool.query<{
    id: string;
    series_id: string;
    home_participant_id: string;
    away_participant_id: string;
    home_user_id: string;
    away_user_id: string;
    scheduled_starts_at: Date;
  }>(
    `select f.id, f.series_id, f.home_participant_id, f.away_participant_id,
            home_participant.user_id as home_user_id, away_participant.user_id as away_user_id,
            f.scheduled_starts_at
       from tournament_fixture f
       join tournament_playoff_series s on s.id = f.series_id
       join tournament_participant home_participant on home_participant.id = f.home_participant_id
       join tournament_participant away_participant on away_participant.id = f.away_participant_id
      where s.tournament_id = $1 and s.depends_on->>'key' = 'R1S1'
      order by f.fixture_number`,
    [tournament.id],
  );
  return { tournament, fixtures: fixtures.rows };
}

async function settlePlayedPlayoffFixture(
  pool: Pool,
  fixture: {
    id: string;
    home_user_id: string;
    away_user_id: string;
    scheduled_starts_at: Date;
  },
) {
  const duel = await pool.query<{ id: string }>(
    `insert into amateur_duel_match
       (challenger_user_id, opponent_user_id, status, source, rules_snapshot,
        match_seed, starts_at, ends_at, game_core_version)
     values ($1, $2, 'active', 'tournament', '{}'::jsonb,
             'series-notification', $3, $4, 1)
     returning id`,
    [
      fixture.home_user_id,
      fixture.away_user_id,
      fixture.scheduled_starts_at,
      new Date(fixture.scheduled_starts_at.getTime() + 3_600_000),
    ],
  );
  await pool.query(
    `insert into tournament_fixture_segment
       (fixture_id, sequence_number, kind, duel_match_id, status, rules_snapshot)
     values ($1, 1, 'regulation', $2, 'scheduled', '{}'::jsonb)`,
    [fixture.id, duel.rows[0]!.id],
  );
  const client = await pool.connect();
  try {
    await client.query('begin');
    await settleTournamentSegmentForDuel(client, {
      duelMatchId: duel.rows[0]!.id,
      homeScore: 1,
      awayScore: 0,
      settledAt: fixture.scheduled_starts_at,
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function seriesNextGameDeliveries(pool: Pool) {
  return pool.query<{ user_id: string; event_key: string; body: string }>(
    `select user_id, event_key, payload->>'body' as body from push_delivery_log
      where event_type = 'tournament.series_next_game'
      order by event_key, user_id`,
  );
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

  it('generates unique slugs for concurrent drafts when the admin omits them', async () => {
    await seedUsers(pool, 0);
    const input = {
      title: 'Кубок Севера',
      description: '',
      rules: rules(0),
      createdBy: ADMIN_ID,
      registrationOpensAt: null,
      registrationClosesAt: null,
      startsAt: null,
    };

    const drafts = await Promise.all([
      createTournamentDraft(pool, input),
      createTournamentDraft(pool, input),
    ]);

    expect(drafts.map((draft) => draft.slug).sort()).toEqual(['kubok-severa', 'kubok-severa-2']);
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

  it('terminalizes an active backing duel when the tournament is cancelled', async () => {
    await seedUsers(pool, 0);
    const fixture = await createLiveFixture(pool, {
      slug: 'cancel-active-backing-duel',
      title: 'Cancellation lifecycle',
      playerIds: [PLAYER_IDS[0], PLAYER_IDS[1]],
    });
    const backing = await attachActiveTournamentDuel(pool, fixture.fixtureId);

    await cancelTournament(pool, fixture.tournamentId, 1, ADMIN_ID);

    const terminal = await pool.query<{
      duel_status: string;
      segment_status: string;
      fixture_status: string;
    }>(
      `select duel.status as duel_status, segment.status as segment_status,
              fixture.status as fixture_status
         from amateur_duel_match duel
         join tournament_fixture_segment segment on segment.duel_match_id = duel.id
         join tournament_fixture fixture on fixture.id = segment.fixture_id
        where duel.id = $1`,
      [backing.duelMatchId],
    );
    expect(terminal.rows[0]).toEqual({
      duel_status: 'cancelled',
      segment_status: 'cancelled',
      fixture_status: 'cancelled',
    });
  });

  it('terminalizes an active backing duel when its fixture receives a no-show result', async () => {
    await seedUsers(pool, 0);
    const fixture = await createLiveFixture(pool, {
      slug: 'no-show-active-backing-duel',
      title: 'No-show lifecycle',
      playerIds: [PLAYER_IDS[0], PLAYER_IDS[1]],
    });
    const backing = await attachActiveTournamentDuel(pool, fixture.fixtureId);

    await resolveTournamentNoShow(pool, {
      tournamentId: fixture.tournamentId,
      fixtureId: fixture.fixtureId,
      absent: 'home',
      reason: 'focused no-show regression',
      adminUserId: ADMIN_ID,
    });

    const terminal = await pool.query<{
      duel_status: string;
      segment_status: string;
      fixture_status: string;
    }>(
      `select duel.status as duel_status, segment.status as segment_status,
              fixture.status as fixture_status
         from amateur_duel_match duel
         join tournament_fixture_segment segment on segment.duel_match_id = duel.id
         join tournament_fixture fixture on fixture.id = segment.fixture_id
        where duel.id = $1`,
      [backing.duelMatchId],
    );
    expect(terminal.rows[0]).toEqual({
      duel_status: 'cancelled',
      segment_status: 'cancelled',
      fixture_status: 'forfeit',
    });
  });

  it('terminalizes active backing duels when their participant is disqualified', async () => {
    await seedUsers(pool, 0);
    const fixture = await createLiveFixture(pool, {
      slug: 'dq-active-backing-duel',
      title: 'Disqualification lifecycle',
      playerIds: [PLAYER_IDS[0], PLAYER_IDS[1]],
    });
    const backing = await attachActiveTournamentDuel(pool, fixture.fixtureId);

    await disqualifyTournamentParticipant(pool, {
      tournamentId: fixture.tournamentId,
      participantId: backing.homeParticipantId,
      reason: 'focused disqualification regression',
      adminUserId: ADMIN_ID,
    });

    const terminal = await pool.query<{
      duel_status: string;
      segment_status: string;
      fixture_status: string;
    }>(
      `select duel.status as duel_status, segment.status as segment_status,
              fixture.status as fixture_status
         from amateur_duel_match duel
         join tournament_fixture_segment segment on segment.duel_match_id = duel.id
         join tournament_fixture fixture on fixture.id = segment.fixture_id
        where duel.id = $1`,
      [backing.duelMatchId],
    );
    expect(terminal.rows[0]).toEqual({
      duel_status: 'cancelled',
      segment_status: 'cancelled',
      fixture_status: 'forfeit',
    });
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

  it('charges the configured fee when an invited participant is approved', async () => {
    await seedUsers(pool, 100);
    const tournament = await createPublishedTournament(pool, 'invited-entry-fee', 25);
    const invitation = await inviteTournamentParticipant(
      pool,
      tournament.id,
      PLAYER_IDS[0],
      ADMIN_ID,
    );

    await approveTournamentParticipant(pool, tournament.id, invitation.participantId, ADMIN_ID);

    const state = await pool.query<{
      balance: number;
      entry_fee_coins: number;
      entry_fee_state: string;
      ledger_count: string;
    }>(
      `select account.balance, participant.entry_fee_coins, participant.entry_fee_state,
              (select count(*)::text from currency_ledger ledger
                where ledger.user_id = participant.user_id
                  and ledger.reason = 'tournament_entry_fee') as ledger_count
         from tournament_participant participant
         join user_currency_account account on account.user_id = participant.user_id
        where participant.id = $1`,
      [invitation.participantId],
    );
    expect(state.rows[0]).toEqual({
      balance: 75,
      entry_fee_coins: 25,
      entry_fee_state: 'paid',
      ledger_count: '1',
    });
  });

  it('rolls back automatic application approval when its push outbox insert fails', async () => {
    await seedUsers(pool, 100);
    await subscribeTournamentUsers(pool, [PLAYER_IDS[0]]);
    const tournament = await createPublishedTournament(pool, 'transactional-auto-approval', 25);
    await installFailingPushTrigger(pool, 'tournament.application_approved');

    await expect(applyToTournament(pool, tournament.id, PLAYER_IDS[0])).rejects.toThrow(
      'forced tournament push failure',
    );
    expect(
      (
        await pool.query<{ count: string }>(
          `select count(*)::text as count from tournament_participant where tournament_id = $1`,
          [tournament.id],
        )
      ).rows[0]?.count,
    ).toBe('0');
    expect(
      (
        await pool.query<{ balance: number }>(
          `select balance from user_currency_account where user_id = $1`,
          [PLAYER_IDS[0]],
        )
      ).rows[0]?.balance,
    ).toBe(100);

    await removeFailingPushTrigger(pool);
    await expect(applyToTournament(pool, tournament.id, PLAYER_IDS[0])).resolves.toMatchObject({
      state: 'approved',
    });
    const delivery = await pool.query<{ count: string }>(
      `select count(*)::text as count from push_delivery_log
        where event_type = 'tournament.application_approved' and user_id = $1`,
      [PLAYER_IDS[0]],
    );
    expect(delivery.rows[0]?.count).toBe('1');
  });

  it('rolls back manual participant approval when its push outbox insert fails', async () => {
    await seedUsers(pool, 100);
    await subscribeTournamentUsers(pool, [PLAYER_IDS[0]]);
    const tournament = await createPublishedTournament(pool, 'transactional-admin-approval', 25);
    const invited = await inviteTournamentParticipant(pool, tournament.id, PLAYER_IDS[0], ADMIN_ID);
    await installFailingPushTrigger(pool, 'tournament.application_approved');

    await expect(
      approveTournamentParticipant(pool, tournament.id, invited.participantId, ADMIN_ID),
    ).rejects.toThrow('forced tournament push failure');
    const rolledBack = await pool.query<{ state: string; balance: number }>(
      `select participant.state, account.balance
         from tournament_participant participant
         join user_currency_account account on account.user_id = participant.user_id
        where participant.id = $1`,
      [invited.participantId],
    );
    expect(rolledBack.rows[0]).toEqual({ state: 'invited', balance: 100 });

    await removeFailingPushTrigger(pool);
    await expect(
      approveTournamentParticipant(pool, tournament.id, invited.participantId, ADMIN_ID),
    ).resolves.toMatchObject({ state: 'approved' });
    const deliveries = await pool.query<{ count: string }>(
      `select count(*)::text as count from push_delivery_log
        where event_type = 'tournament.application_approved' and user_id = $1`,
      [PLAYER_IDS[0]],
    );
    expect(deliveries.rows[0]?.count).toBe('1');
  });

  it('rolls back schedule publication when its audience outbox insert fails', async () => {
    await seedUsers(pool, 0);
    await subscribeTournamentUsers(pool, PLAYER_IDS);
    const tournament = await createPublishedTournament(pool, 'transactional-schedule-publish', 0);
    for (const playerId of PLAYER_IDS) await applyToTournament(pool, tournament.id, playerId);
    await generateRegularSchedule(pool, tournament.id, tournament.revision);
    await installFailingPushTrigger(pool, 'tournament.schedule_published');

    await expect(publishRegularSchedule(pool, tournament.id)).rejects.toThrow(
      'forced tournament push failure',
    );
    expect(
      (
        await pool.query<{ status: string }>(`select status from tournament where id = $1`, [
          tournament.id,
        ])
      ).rows[0]?.status,
    ).toBe('scheduling');

    await removeFailingPushTrigger(pool);
    await expect(publishRegularSchedule(pool, tournament.id)).resolves.toMatchObject({
      status: 'regular',
    });
    const deliveries = await pool.query<{ count: string }>(
      `select count(*)::text as count from push_delivery_log
        where event_type = 'tournament.schedule_published'`,
    );
    expect(deliveries.rows[0]?.count).toBe(String(PLAYER_IDS.length));
  });

  it('rolls back playoff materialization when its audience outbox insert fails', async () => {
    await seedUsers(pool, 0);
    await subscribeTournamentUsers(pool, PLAYER_IDS);
    const tournament = await createPublishedTournament(
      pool,
      'transactional-playoff-start',
      0,
      playoffTournamentRules(2),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await installFailingPushTrigger(pool, 'tournament.playoff_started');

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z')),
    ).rejects.toThrow('forced tournament push failure');
    const rolledBack = await pool.query<{ status: string; series_count: string }>(
      `select tournament.status,
              (select count(*)::text from tournament_playoff_series series
                where series.tournament_id = tournament.id) as series_count
         from tournament where id = $1`,
      [tournament.id],
    );
    expect(rolledBack.rows[0]).toEqual({ status: 'regular', series_count: '0' });

    await removeFailingPushTrigger(pool);
    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z')),
    ).resolves.toMatchObject({ status: 'playoff' });
    const deliveries = await pool.query<{ count: string }>(
      `select count(*)::text as count from push_delivery_log
        where event_type = 'tournament.playoff_started'`,
    );
    expect(deliveries.rows[0]?.count).toBe(String(PLAYER_IDS.length));
  });

  it('rolls back tournament completion when its audience outbox insert fails', async () => {
    await seedUsers(pool, 0);
    await subscribeTournamentUsers(pool, PLAYER_IDS);
    const tournament = await createPublishedTournament(
      pool,
      'transactional-completion',
      0,
      playoffTournamentRules(2, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000817',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
          },
        ],
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));
    const finalFixture = await pool.query<{
      id: string;
      home_participant_id: string;
    }>(
      `select fixture.id, fixture.home_participant_id
         from tournament_fixture fixture
         join tournament_playoff_series series on series.id = fixture.series_id
        where series.tournament_id = $1 and series.kind = 'championship'
          and fixture.status = 'scheduled'
        order by fixture.fixture_number limit 1`,
      [tournament.id],
    );
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: finalFixture.rows[0]!.id,
      absent: 'away',
      reason: 'complete final for transactional notification regression',
      adminUserId: ADMIN_ID,
    });
    await installFailingPushTrigger(pool, 'tournament.completed');

    await expect(grantTournamentStageRewards(pool, tournament.id, 'playoff')).rejects.toThrow(
      'forced tournament push failure',
    );
    expect(
      (
        await pool.query<{ status: string }>(`select status from tournament where id = $1`, [
          tournament.id,
        ])
      ).rows[0]?.status,
    ).toBe('playoff');

    await removeFailingPushTrigger(pool);
    await expect(
      grantTournamentStageRewards(pool, tournament.id, 'playoff'),
    ).resolves.toMatchObject({
      stage: 'playoff',
    });
    const completed = await pool.query<{ status: string; delivery_count: string }>(
      `select tournament.status,
              (select count(*)::text from push_delivery_log
                where event_type = 'tournament.completed') as delivery_count
         from tournament where id = $1`,
      [tournament.id],
    );
    expect(completed.rows[0]).toEqual({
      status: 'completed',
      delivery_count: String(PLAYER_IDS.length),
    });
  });

  it('allows parallel tournament duels for the same participant pair', async () => {
    await seedUsers(pool, 0);
    const template = await pool.query<{ id: string }>(
      `select id from amateur_duel_template
        where is_active and deleted_at is null
        order by created_at
        limit 1`,
    );
    const client = await pool.connect();
    try {
      const input = {
        templateId: template.rows[0]!.id,
        homeUserId: PLAYER_IDS[0],
        awayUserId: PLAYER_IDS[1],
        startsAt: new Date('2030-09-01T08:00:00.000Z'),
        endsAt: new Date('2030-09-01T09:00:00.000Z'),
      };
      const first = await createTournamentDuelMatch(client, {
        ...input,
        now: new Date('2030-09-01T08:00:00.000Z'),
      });
      const second = await createTournamentDuelMatch(client, {
        ...input,
        now: new Date('2030-09-01T08:01:00.000Z'),
      });

      expect(second.matchId).not.toBe(first.matchId);
      const matches = await pool.query<{ id: string }>(
        `select id from amateur_duel_match
          where source = 'tournament'
            and least(challenger_user_id, opponent_user_id) = least($1::uuid, $2::uuid)
            and greatest(challenger_user_id, opponent_user_id) = greatest($1::uuid, $2::uuid)
          order by created_at, id`,
        [PLAYER_IDS[0], PLAYER_IDS[1]],
      );
      expect(matches.rows.map((match) => match.id)).toEqual([first.matchId, second.matchId]);
    } finally {
      client.release();
    }
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
      overlapWarnings: [],
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

  it('keeps only the latest live proposal active after an accepted time is replaced', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(pool, 'single-active-live-proposal', 0);
    await applyToTournament(pool, tournament.id, PLAYER_IDS[0]);
    await applyToTournament(pool, tournament.id, PLAYER_IDS[1]);
    await generateRegularSchedule(pool, tournament.id, tournament.revision);
    await publishRegularSchedule(pool, tournament.id);
    const fixture = await pool.query<{ id: string }>(
      `select id from tournament_fixture where tournament_id = $1 order by fixture_number limit 1`,
      [tournament.id],
    );
    const fixtureId = fixture.rows[0]!.id;
    const first = await proposeFixtureLiveTime(pool, {
      fixtureId,
      userId: PLAYER_IDS[0],
      proposedAt: new Date('2030-09-01T07:20:00.000Z'),
    });
    await respondFixtureLiveProposal(pool, {
      fixtureId,
      proposalId: first.id,
      userId: PLAYER_IDS[1],
      accept: true,
    });

    const second = await proposeFixtureLiveTime(pool, {
      fixtureId,
      userId: PLAYER_IDS[1],
      proposedAt: new Date('2030-09-01T07:40:00.000Z'),
    });
    expect(
      (
        await pool.query<{ state: string }>(
          `select state from tournament_live_proposal where id = $1`,
          [first.id],
        )
      ).rows[0]?.state,
    ).toBe('superseded');
    await respondFixtureLiveProposal(pool, {
      fixtureId,
      proposalId: second.id,
      userId: PLAYER_IDS[0],
      accept: true,
    });

    const active = await pool.query<{ id: string; state: string }>(
      `select id, state from tournament_live_proposal
        where fixture_id = $1 and state in ('pending', 'accepted')`,
      [fixtureId],
    );
    expect(active.rows).toEqual([{ id: second.id, state: 'accepted' }]);
    expect(await getFixtureLiveState(pool, fixtureId, PLAYER_IDS[0])).toMatchObject({
      scheduledStartsAt: '2030-09-01T07:40:00.000Z',
      proposal: {
        id: second.id,
        proposedAt: '2030-09-01T07:40:00.000Z',
        state: 'accepted',
      },
    });
  });

  it('returns no live-overlap warning when neither participant has another fixture at the proposed time', async () => {
    await seedUsers(pool, 0);
    const current = await createLiveFixture(pool, {
      slug: 'live-overlap-none',
      title: 'Текущий кубок',
      playerIds: [PLAYER_IDS[0], PLAYER_IDS[1]],
    });

    await expect(
      proposeFixtureLiveTime(pool, {
        fixtureId: current.fixtureId,
        userId: PLAYER_IDS[0],
        proposedAt: new Date('2030-09-01T07:30:00.000Z'),
      }),
    ).resolves.toMatchObject({ overlapWarnings: [] });
  });

  it('warns when the proposing player has a scheduled fixture in another tournament', async () => {
    await seedUsers(pool, 0);
    const current = await createLiveFixture(pool, {
      slug: 'live-overlap-same-player-current',
      title: 'Текущий кубок',
      playerIds: [PLAYER_IDS[0], PLAYER_IDS[1]],
    });
    const conflict = await createLiveFixture(pool, {
      slug: 'live-overlap-same-player-conflict',
      title: 'Другой кубок',
      playerIds: [PLAYER_IDS[0], PLAYER_IDS[2]],
    });

    await expect(
      proposeFixtureLiveTime(pool, {
        fixtureId: current.fixtureId,
        userId: PLAYER_IDS[0],
        proposedAt: new Date('2030-09-01T07:30:00.000Z'),
      }),
    ).resolves.toMatchObject({
      overlapWarnings: [
        {
          fixtureId: conflict.fixtureId,
          tournamentId: conflict.tournamentId,
          tournamentTitle: 'Другой кубок',
          scheduledStartsAt: '2030-09-01T07:00:00.000Z',
          windowEndsAt: '2030-09-01T08:00:00.000Z',
          acceptedLiveAt: null,
        },
      ],
    });
  });

  it('warns when the opponent has a scheduled fixture in another tournament', async () => {
    await seedUsers(pool, 0);
    const current = await createLiveFixture(pool, {
      slug: 'live-overlap-opponent-current',
      title: 'Текущий кубок',
      playerIds: [PLAYER_IDS[0], PLAYER_IDS[1]],
    });
    const conflict = await createLiveFixture(pool, {
      slug: 'live-overlap-opponent-conflict',
      title: 'Кубок соперника',
      playerIds: [PLAYER_IDS[1], PLAYER_IDS[2]],
    });

    await expect(
      proposeFixtureLiveTime(pool, {
        fixtureId: current.fixtureId,
        userId: PLAYER_IDS[0],
        proposedAt: new Date('2030-09-01T07:30:00.000Z'),
      }),
    ).resolves.toMatchObject({ overlapWarnings: [{ fixtureId: conflict.fixtureId }] });
  });

  it.each(['settled', 'forfeit', 'cancelled'] as const)(
    'ignores a %s conflicting fixture',
    async (terminalStatus) => {
      await seedUsers(pool, 0);
      const current = await createLiveFixture(pool, {
        slug: `live-overlap-terminal-current-${terminalStatus}`,
        title: 'Текущий кубок',
        playerIds: [PLAYER_IDS[0], PLAYER_IDS[1]],
      });
      const conflict = await createLiveFixture(pool, {
        slug: `live-overlap-terminal-conflict-${terminalStatus}`,
        title: 'Закрытый кубок',
        playerIds: [PLAYER_IDS[0], PLAYER_IDS[2]],
      });
      await pool.query(`update tournament_fixture set status = $2 where id = $1`, [
        conflict.fixtureId,
        terminalStatus,
      ]);

      await expect(
        proposeFixtureLiveTime(pool, {
          fixtureId: current.fixtureId,
          userId: PLAYER_IDS[0],
          proposedAt: new Date('2030-09-01T07:30:00.000Z'),
        }),
      ).resolves.toMatchObject({ overlapWarnings: [] });
    },
  );

  it('returns the same warning for the opponent counter-proposal', async () => {
    await seedUsers(pool, 0);
    const current = await createLiveFixture(pool, {
      slug: 'live-overlap-counter-current',
      title: 'Текущий кубок',
      playerIds: [PLAYER_IDS[0], PLAYER_IDS[1]],
    });
    const conflict = await createLiveFixture(pool, {
      slug: 'live-overlap-counter-conflict',
      title: 'Кубок соперника',
      playerIds: [PLAYER_IDS[1], PLAYER_IDS[2]],
    });
    await proposeFixtureLiveTime(pool, {
      fixtureId: current.fixtureId,
      userId: PLAYER_IDS[0],
      proposedAt: new Date('2030-09-01T07:20:00.000Z'),
    });

    await expect(
      proposeFixtureLiveTime(pool, {
        fixtureId: current.fixtureId,
        userId: PLAYER_IDS[1],
        proposedAt: new Date('2030-09-01T07:30:00.000Z'),
      }),
    ).resolves.toMatchObject({
      state: 'pending',
      overlapWarnings: [{ fixtureId: conflict.fixtureId }],
    });
  });

  it('recomputes the warning when a conflict appears after proposal and before acceptance', async () => {
    await seedUsers(pool, 0);
    const current = await createLiveFixture(pool, {
      slug: 'live-overlap-accept-current',
      title: 'Текущий кубок',
      playerIds: [PLAYER_IDS[0], PLAYER_IDS[1]],
    });
    const proposal = await proposeFixtureLiveTime(pool, {
      fixtureId: current.fixtureId,
      userId: PLAYER_IDS[0],
      proposedAt: new Date('2030-09-01T07:30:00.000Z'),
    });
    const conflict = await createLiveFixture(pool, {
      slug: 'live-overlap-accept-conflict',
      title: 'Поздний кубок',
      playerIds: [PLAYER_IDS[0], PLAYER_IDS[2]],
    });

    await expect(
      respondFixtureLiveProposal(pool, {
        fixtureId: current.fixtureId,
        proposalId: proposal.id,
        userId: PLAYER_IDS[1],
        accept: true,
      }),
    ).resolves.toMatchObject({
      state: 'accepted',
      overlapWarnings: [{ fixtureId: conflict.fixtureId }],
    });
  });

  it('closes a best-of-three playoff series from technical wins exactly once and resolves its dependents', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'technical-playoff-series',
      0,
      playoffTournamentRules(4, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 2,
            homeSequence: ['H', 'A', 'H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000806',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T13:00:00.000Z',
          },
          {
            roundNumber: 2,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000807',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T17:00:00.000Z',
          },
        ],
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const firstRound = await pool.query<{
      fixture_id: string;
      game_number: number;
      home_participant_id: string;
      away_participant_id: string;
      higher_seed_participant_id: string;
      series_id: string;
    }>(
      `select f.id as fixture_id, (f.result_snapshot->>'gameNumber')::int as game_number,
              f.home_participant_id, f.away_participant_id,
              s.higher_seed_participant_id, s.id as series_id
         from tournament_fixture f
         join tournament_playoff_series s on s.id = f.series_id
        where s.tournament_id = $1 and s.depends_on->>'key' = 'R1S1'
        order by (f.result_snapshot->>'gameNumber')::int`,
      [tournament.id],
    );
    expect(firstRound.rows).toHaveLength(3);
    for (const participantId of [
      firstRound.rows[0]!.home_participant_id,
      firstRound.rows[0]!.away_participant_id,
    ]) {
      const user = await pool.query<{ user_id: string }>(
        `select user_id from tournament_participant where id = $1`,
        [participantId],
      );
      await pool.query(
        `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
         values ($1, $2, 'p256dh', 'auth')`,
        [user.rows[0]!.user_id, `https://push.example.test/${participantId}`],
      );
    }

    const technicalWinForHigherSeed = async (fixture: (typeof firstRound.rows)[number]) => {
      await resolveTournamentNoShow(pool, {
        tournamentId: tournament.id,
        fixtureId: fixture.fixture_id,
        absent:
          fixture.home_participant_id === fixture.higher_seed_participant_id ? 'away' : 'home',
        reason: 'integration technical win',
        adminUserId: ADMIN_ID,
      });
    };

    await technicalWinForHigherSeed(firstRound.rows[0]!);
    await technicalWinForHigherSeed(firstRound.rows[0]!);
    await technicalWinForHigherSeed(firstRound.rows[1]!);

    const completed = await pool.query<{
      higher_seed_wins: number;
      lower_seed_wins: number;
      status: string;
      winner_participant_id: string;
    }>(
      `select higher_seed_wins, lower_seed_wins, status, winner_participant_id
         from tournament_playoff_series where id = $1`,
      [firstRound.rows[0]!.series_id],
    );
    expect(completed.rows[0]).toEqual({
      higher_seed_wins: 2,
      lower_seed_wins: 0,
      status: 'completed',
      winner_participant_id: firstRound.rows[0]!.higher_seed_participant_id,
    });

    const firstRoundFixtures = await pool.query<{ fixture_number: number; status: string }>(
      `select fixture_number, status
         from tournament_fixture where series_id = $1
        order by fixture_number`,
      [firstRound.rows[0]!.series_id],
    );
    expect(firstRoundFixtures.rows.map((fixture) => fixture.status)).toEqual([
      'forfeit',
      'forfeit',
      'cancelled',
    ]);

    const finalSeries = await pool.query<{ higher_seed_participant_id: string; status: string }>(
      `select higher_seed_participant_id, status from tournament_playoff_series
        where tournament_id = $1 and depends_on->>'key' = 'R2S1'`,
      [tournament.id],
    );
    expect(finalSeries.rows[0]).toEqual({
      higher_seed_participant_id: firstRound.rows[0]!.higher_seed_participant_id,
      status: 'pending',
    });
    const notifications = await pool.query<{ event_key: string }>(
      `select event_key from push_delivery_log
        where event_type = 'tournament.result_ready'
        order by event_key`,
    );
    expect(notifications.rows).toHaveLength(4);
  });

  it('promotes the deciding conditional game after a best-of-three series is split 1:1', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'technical-playoff-decider',
      0,
      playoffTournamentRules(4, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 2,
            homeSequence: ['H', 'A', 'H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000810',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T13:00:00.000Z',
          },
          {
            roundNumber: 2,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000811',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T17:00:00.000Z',
          },
        ],
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const games = await pool.query<{
      fixture_id: string;
      home_participant_id: string;
      higher_seed_participant_id: string;
      series_id: string;
    }>(
      `select f.id as fixture_id, f.home_participant_id,
              s.higher_seed_participant_id, s.id as series_id
         from tournament_fixture f
         join tournament_playoff_series s on s.id = f.series_id
        where s.tournament_id = $1 and s.depends_on->>'key' = 'R1S1'
        order by f.fixture_number`,
      [tournament.id],
    );
    const higherSeedId = games.rows[0]!.higher_seed_participant_id;
    const higherAbsent = games.rows[0]!.home_participant_id === higherSeedId ? 'away' : 'home';
    const lowerAbsent = games.rows[1]!.home_participant_id === higherSeedId ? 'home' : 'away';
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: games.rows[0]!.fixture_id,
      absent: higherAbsent,
      reason: 'integration higher seed technical win',
      adminUserId: ADMIN_ID,
    });
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: games.rows[1]!.fixture_id,
      absent: lowerAbsent,
      reason: 'integration lower seed technical win',
      adminUserId: ADMIN_ID,
    });

    const state = await pool.query<{
      status: string;
      higher_seed_wins: number;
      lower_seed_wins: number;
      deciding_fixture_status: string;
    }>(
      `select s.status, s.higher_seed_wins, s.lower_seed_wins,
              (select f.status from tournament_fixture f
                where f.series_id = s.id
                  and (f.result_snapshot->>'gameNumber')::int = 3) as deciding_fixture_status
         from tournament_playoff_series s
        where s.id = $1`,
      [games.rows[0]!.series_id],
    );
    expect(state.rows[0]).toEqual({
      status: 'active',
      higher_seed_wins: 1,
      lower_seed_wins: 1,
      deciding_fixture_status: 'scheduled',
    });
  });

  it('notifies both active participants when a played series game promotes the next fixture', async () => {
    const { fixtures } = await createBestOfThreePlayoff(pool, 'played-series-next-game');
    const [firstFixture, secondFixture, nextFixture] = fixtures;
    await subscribeTournamentParticipants(pool, [
      firstFixture!.home_participant_id,
      firstFixture!.away_participant_id,
    ]);

    await settlePlayedPlayoffFixture(pool, firstFixture!);
    await settlePlayedPlayoffFixture(pool, secondFixture!);

    const startsAt = nextFixture!.scheduled_starts_at.toISOString();
    expect((await seriesNextGameDeliveries(pool)).rows).toEqual([
      {
        user_id: nextFixture!.home_user_id,
        event_key: `${nextFixture!.id}:series-next-game:${startsAt}`,
        body: `Следующий матч откроется ${startsAt}.`,
      },
      {
        user_id: nextFixture!.away_user_id,
        event_key: `${nextFixture!.id}:series-next-game:${startsAt}`,
        body: `Следующий матч откроется ${startsAt}.`,
      },
    ]);
  });

  it('notifies both active participants when a technical result promotes the next fixture', async () => {
    const { tournament, fixtures } = await createBestOfThreePlayoff(
      pool,
      'technical-series-next-game',
    );
    const [firstFixture, secondFixture, nextFixture] = fixtures;
    await subscribeTournamentParticipants(pool, [
      firstFixture!.home_participant_id,
      firstFixture!.away_participant_id,
    ]);

    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: firstFixture!.id,
      absent: 'away',
      reason: 'integration promote the next game',
      adminUserId: ADMIN_ID,
    });
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: secondFixture!.id,
      absent: 'away',
      reason: 'integration promote the next game',
      adminUserId: ADMIN_ID,
    });

    const startsAt = nextFixture!.scheduled_starts_at.toISOString();
    expect((await seriesNextGameDeliveries(pool)).rows.map((row) => row.event_key)).toEqual([
      `${nextFixture!.id}:series-next-game:${startsAt}`,
      `${nextFixture!.id}:series-next-game:${startsAt}`,
    ]);
  });

  it('notifies the first scheduled final and bronze fixtures after both source series resolve', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'dependent-series-next-game',
      0,
      playoffTournamentRules(4, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000815',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T13:00:00.000Z',
          },
          {
            roundNumber: 2,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000816',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T17:00:00.000Z',
          },
        ],
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));
    const semifinals = await pool.query<{
      fixture_id: string;
      home_participant_id: string;
      higher_seed_participant_id: string;
    }>(
      `select f.id as fixture_id, f.home_participant_id, s.higher_seed_participant_id
         from tournament_fixture f
         join tournament_playoff_series s on s.id = f.series_id
        where s.tournament_id = $1 and s.depends_on->>'key' in ('R1S1', 'R1S2')
        order by s.depends_on->>'key'`,
      [tournament.id],
    );
    const participantIds = await pool.query<{ id: string }>(
      `select id from tournament_participant where tournament_id = $1 order by id`,
      [tournament.id],
    );
    await subscribeTournamentParticipants(
      pool,
      participantIds.rows.map((participant) => participant.id),
    );

    for (const semifinal of semifinals.rows) {
      await resolveTournamentNoShow(pool, {
        tournamentId: tournament.id,
        fixtureId: semifinal.fixture_id,
        absent:
          semifinal.home_participant_id === semifinal.higher_seed_participant_id ? 'away' : 'home',
        reason: 'integration resolve dependent series',
        adminUserId: ADMIN_ID,
      });
    }

    const dependents = await pool.query<{
      fixture_id: string;
      scheduled_starts_at: Date;
      home_user_id: string;
      away_user_id: string;
    }>(
      `select f.id as fixture_id, f.scheduled_starts_at,
              home_participant.user_id as home_user_id, away_participant.user_id as away_user_id
         from tournament_fixture f
         join tournament_playoff_series s on s.id = f.series_id
         join tournament_participant home_participant on home_participant.id = f.home_participant_id
         join tournament_participant away_participant on away_participant.id = f.away_participant_id
        where s.tournament_id = $1 and s.kind in ('championship', 'third_place')
          and s.depends_on->>'key' in ('R2S1', 'BRONZE')
          and f.status = 'scheduled'
        order by s.kind`,
      [tournament.id],
    );
    expect(dependents.rows).toHaveLength(2);
    const expectedDeliveries = dependents.rows
      .flatMap((fixture) => {
        const eventKey = `${fixture.fixture_id}:series-next-game:${fixture.scheduled_starts_at.toISOString()}`;
        return [
          { user_id: fixture.away_user_id, event_key: eventKey },
          { user_id: fixture.home_user_id, event_key: eventKey },
        ];
      })
      .sort((left, right) =>
        left.event_key === right.event_key
          ? left.user_id.localeCompare(right.user_id)
          : left.event_key.localeCompare(right.event_key),
      );
    expect(
      (await seriesNextGameDeliveries(pool)).rows.map(({ user_id, event_key }) => ({
        user_id,
        event_key,
      })),
    ).toEqual(expectedDeliveries);
  });

  it('keeps the better original seed as higher seed after a dependent-round upset', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'dependent-original-seed-order',
      0,
      playoffTournamentRules(4, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000815',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
          },
          {
            roundNumber: 2,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000816',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
          },
        ],
      }),
    );
    const participantIds = await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));
    const semifinals = await pool.query<{
      fixture_id: string;
      series_key: string;
      home_participant_id: string;
      away_participant_id: string;
    }>(
      `select fixture.id as fixture_id, series.depends_on->>'key' as series_key,
              fixture.home_participant_id, fixture.away_participant_id
         from tournament_fixture fixture
         join tournament_playoff_series series on series.id = fixture.series_id
        where series.tournament_id = $1
          and series.depends_on->>'key' in ('R1S1', 'R1S2')
        order by series.depends_on->>'key'`,
      [tournament.id],
    );
    const winners = new Map([
      ['R1S1', participantIds[3]!],
      ['R1S2', participantIds[1]!],
    ]);
    for (const semifinal of semifinals.rows) {
      const winner = winners.get(semifinal.series_key)!;
      await resolveTournamentNoShow(pool, {
        tournamentId: tournament.id,
        fixtureId: semifinal.fixture_id,
        absent: semifinal.home_participant_id === winner ? 'away' : 'home',
        reason: 'resolve original-seed ordering regression',
        adminUserId: ADMIN_ID,
      });
    }

    const final = await pool.query<{
      higher_seed_participant_id: string;
      lower_seed_participant_id: string;
      home_participant_id: string;
    }>(
      `select series.higher_seed_participant_id, series.lower_seed_participant_id,
              fixture.home_participant_id
         from tournament_playoff_series series
         join tournament_fixture fixture on fixture.series_id = series.id
        where series.tournament_id = $1 and series.depends_on->>'key' = 'R2S1'
          and (fixture.result_snapshot->>'gameNumber')::int = 1`,
      [tournament.id],
    );
    expect(final.rows).toEqual([
      {
        higher_seed_participant_id: participantIds[1],
        lower_seed_participant_id: participantIds[3],
        home_participant_id: participantIds[1],
      },
    ]);
  });

  it('does not duplicate a series-next-game notification when a technical fixture is resolved twice', async () => {
    const { tournament, fixtures } = await createBestOfThreePlayoff(
      pool,
      'duplicate-series-next-game',
    );
    const [firstFixture, secondFixture, nextFixture] = fixtures;
    await subscribeTournamentParticipants(pool, [
      firstFixture!.home_participant_id,
      firstFixture!.away_participant_id,
    ]);
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: firstFixture!.id,
      absent: 'away' as const,
      reason: 'integration duplicate fixture result',
      adminUserId: ADMIN_ID,
    });
    const secondNoShow = {
      tournamentId: tournament.id,
      fixtureId: secondFixture!.id,
      absent: 'away' as const,
      reason: 'integration duplicate fixture result',
      adminUserId: ADMIN_ID,
    };

    await resolveTournamentNoShow(pool, secondNoShow);
    await resolveTournamentNoShow(pool, secondNoShow);

    const startsAt = nextFixture!.scheduled_starts_at.toISOString();
    expect((await seriesNextGameDeliveries(pool)).rows.map((row) => row.event_key)).toEqual([
      `${nextFixture!.id}:series-next-game:${startsAt}`,
      `${nextFixture!.id}:series-next-game:${startsAt}`,
    ]);
  });

  it('notifies only the active participant who has tournament notifications enabled', async () => {
    const { tournament, fixtures } = await createBestOfThreePlayoff(
      pool,
      'opt-out-series-next-game',
    );
    const [firstFixture, secondFixture, nextFixture] = fixtures;
    await subscribeTournamentParticipants(pool, [
      firstFixture!.home_participant_id,
      firstFixture!.away_participant_id,
    ]);
    await pool.query(
      `insert into user_push_preferences (user_id, tournament_events)
       values ($1, false)`,
      [firstFixture!.home_user_id],
    );

    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: firstFixture!.id,
      absent: 'away',
      reason: 'integration respect recipient state',
      adminUserId: ADMIN_ID,
    });
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: secondFixture!.id,
      absent: 'away',
      reason: 'integration respect recipient state',
      adminUserId: ADMIN_ID,
    });

    const startsAt = nextFixture!.scheduled_starts_at.toISOString();
    expect((await seriesNextGameDeliveries(pool)).rows.map((row) => row.user_id)).toEqual([
      nextFixture!.away_user_id,
    ]);
    expect((await seriesNextGameDeliveries(pool)).rows.map((row) => row.event_key)).toEqual([
      `${nextFixture!.id}:series-next-game:${startsAt}`,
    ]);
  });

  it('uses a new timestamped series-next-game key when a promoted fixture is rescheduled', async () => {
    const { tournament, fixtures } = await createBestOfThreePlayoff(
      pool,
      'rescheduled-series-next-game',
    );
    const [firstFixture, secondFixture, nextFixture] = fixtures;
    await subscribeTournamentParticipants(pool, [
      firstFixture!.home_participant_id,
      firstFixture!.away_participant_id,
    ]);
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: firstFixture!.id,
      absent: 'away',
      reason: 'integration promote then reschedule',
      adminUserId: ADMIN_ID,
    });
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: secondFixture!.id,
      absent: 'away',
      reason: 'integration promote then reschedule',
      adminUserId: ADMIN_ID,
    });
    const originalStartsAt = nextFixture!.scheduled_starts_at.toISOString();
    const rescheduledStartsAt = new Date('2030-09-01T16:00:00.000Z');
    await rescheduleTournamentFixture(pool, {
      tournamentId: tournament.id,
      fixtureId: nextFixture!.id,
      startsAt: rescheduledStartsAt,
      endsAt: new Date('2030-09-01T17:00:00.000Z'),
      reason: 'integration next game reschedule',
      adminUserId: ADMIN_ID,
    });

    expect((await seriesNextGameDeliveries(pool)).rows.map((row) => row.event_key)).toEqual([
      `${nextFixture!.id}:series-next-game:${originalStartsAt}`,
      `${nextFixture!.id}:series-next-game:${originalStartsAt}`,
      `${nextFixture!.id}:series-next-game:${rescheduledStartsAt.toISOString()}`,
      `${nextFixture!.id}:series-next-game:${rescheduledStartsAt.toISOString()}`,
    ]);
  });

  it('propagates a playoff disqualification through the newly resolved third-place series', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'technical-playoff-disqualification',
      0,
      playoffTournamentRules(4, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000808',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T13:00:00.000Z',
          },
          {
            roundNumber: 2,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000809',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T17:00:00.000Z',
          },
        ],
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const semifinals = await pool.query<{
      key: string;
      fixture_id: string;
      home_participant_id: string;
      away_participant_id: string;
      higher_seed_participant_id: string;
    }>(
      `select s.depends_on->>'key' as key, f.id as fixture_id, f.home_participant_id,
              f.away_participant_id, s.higher_seed_participant_id
         from tournament_playoff_series s
         join tournament_fixture f on f.series_id = s.id
        where s.tournament_id = $1 and s.depends_on->>'key' in ('R1S1', 'R1S2')
        order by s.depends_on->>'key'`,
      [tournament.id],
    );
    const firstSemi = semifinals.rows[0]!;
    const secondSemi = semifinals.rows[1]!;
    const secondSemiWinner = secondSemi.higher_seed_participant_id;
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: secondSemi.fixture_id,
      absent: secondSemi.home_participant_id === secondSemiWinner ? 'away' : 'home',
      reason: 'integration other semifinal result',
      adminUserId: ADMIN_ID,
    });
    await pool.query(
      `update tournament_fixture fixture
          set status = 'scheduled'
         from tournament_round round
        where fixture.round_id = round.id
          and fixture.tournament_id = $1
          and round.stage = 'regular'`,
      [tournament.id],
    );

    const result = await disqualifyTournamentParticipant(pool, {
      tournamentId: tournament.id,
      participantId: firstSemi.higher_seed_participant_id,
      reason: 'integration disqualification',
      adminUserId: ADMIN_ID,
    });
    expect(result.futureForfeits).toBe(3);

    const series = await pool.query<{
      key: string;
      status: string;
      winner_participant_id: string | null;
      higher_seed_wins: number;
      lower_seed_wins: number;
    }>(
      `select depends_on->>'key' as key, status, winner_participant_id,
              higher_seed_wins, lower_seed_wins
         from tournament_playoff_series
        where tournament_id = $1 and depends_on->>'key' in ('R1S1', 'BRONZE')
        order by depends_on->>'key'`,
      [tournament.id],
    );
    expect(series.rows).toEqual([
      {
        key: 'BRONZE',
        status: 'completed',
        winner_participant_id: expect.any(String),
        higher_seed_wins: expect.any(Number),
        lower_seed_wins: expect.any(Number),
      },
      {
        key: 'R1S1',
        status: 'completed',
        winner_participant_id: firstSemi.away_participant_id,
        higher_seed_wins: 0,
        lower_seed_wins: 1,
      },
    ]);
    expect(series.rows[0]!.winner_participant_id).not.toBe(firstSemi.higher_seed_participant_id);
    expect(Number(series.rows[0]!.higher_seed_wins) + Number(series.rows[0]!.lower_seed_wins)).toBe(
      1,
    );

    const dependentFixtures = await pool.query<{
      key: string;
      series_status: string;
      higher_seed_participant_id: string | null;
      lower_seed_participant_id: string | null;
      fixture_status: string;
    }>(
      `select s.depends_on->>'key' as key, s.status as series_status,
              s.higher_seed_participant_id, s.lower_seed_participant_id,
              f.status as fixture_status
         from tournament_playoff_series s
         join tournament_fixture f on f.series_id = s.id
        where s.tournament_id = $1 and s.depends_on->>'key' = 'R2S1'`,
      [tournament.id],
    );
    expect(dependentFixtures.rows[0]).toMatchObject({
      key: 'R2S1',
      series_status: 'scheduled',
      fixture_status: 'scheduled',
    });
    expect(dependentFixtures.rows[0]?.higher_seed_participant_id).not.toBeNull();
    expect(dependentFixtures.rows[0]?.lower_seed_participant_id).not.toBeNull();

    const regularFixture = await pool.query<{
      status: string;
      result_snapshot: { technical?: boolean };
    }>(
      `select f.status, f.result_snapshot from tournament_fixture f
         join tournament_round r on r.id = f.round_id
        where f.tournament_id = $1 and r.stage = 'regular'`,
      [tournament.id],
    );
    expect(regularFixture.rows[0]).toEqual({
      status: 'forfeit',
      result_snapshot: { technical: true, disqualification: true },
    });
  });

  it('pauses a playoff double no-show without awarding a series win or duplicating its adjustment', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'technical-playoff-double-no-show',
      0,
      playoffTournamentRules(4),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const fixture = await pool.query<{ fixture_id: string; series_id: string }>(
      `select f.id as fixture_id, s.id as series_id
         from tournament_playoff_series s
         join tournament_fixture f on f.series_id = s.id
        where s.tournament_id = $1 and s.depends_on->>'key' = 'R1S1'`,
      [tournament.id],
    );
    const input = {
      tournamentId: tournament.id,
      fixtureId: fixture.rows[0]!.fixture_id,
      absent: 'both' as const,
      reason: 'integration double no-show',
      adminUserId: ADMIN_ID,
    };
    await resolveTournamentNoShow(pool, input);
    await resolveTournamentNoShow(pool, input);

    const state = await pool.query<{
      fixture_status: string;
      series_status: string;
      higher_seed_wins: number;
      lower_seed_wins: number;
      tournament_status: string;
    }>(
      `select f.status as fixture_status, s.status as series_status,
              s.higher_seed_wins, s.lower_seed_wins, t.status as tournament_status
         from tournament_fixture f
         join tournament_playoff_series s on s.id = f.series_id
         join tournament t on t.id = f.tournament_id
        where f.id = $1`,
      [fixture.rows[0]!.fixture_id],
    );
    expect(state.rows[0]).toEqual({
      fixture_status: 'paused',
      series_status: 'paused',
      higher_seed_wins: 0,
      lower_seed_wins: 0,
      tournament_status: 'paused',
    });
    const adjustments = await pool.query<{ count: string }>(
      `select count(*)::text as count from tournament_adjustment
        where fixture_id = $1 and kind = 'forfeit'`,
      [fixture.rows[0]!.fixture_id],
    );
    expect(adjustments.rows[0]?.count).toBe('1');

    await resolveTournamentNoShow(pool, {
      ...input,
      absent: 'home',
      reason: 'integration admin selects the away winner',
    });
    await tournamentService.resumeTournament(pool, {
      tournamentId: tournament.id,
      reason: 'integration incident resolved',
      adminUserId: ADMIN_ID,
    });
    const resumed = await pool.query<{
      fixture_status: string;
      series_status: string;
      tournament_status: string;
    }>(
      `select fixture.status as fixture_status,
              series.status as series_status,
              tournament.status as tournament_status
         from tournament_fixture fixture
         join tournament_playoff_series series on series.id = fixture.series_id
         join tournament on tournament.id = fixture.tournament_id
        where fixture.id = $1`,
      [fixture.rows[0]!.fixture_id],
    );
    expect(resumed.rows[0]).toEqual({
      fixture_status: 'forfeit',
      series_status: 'active',
      tournament_status: 'playoff',
    });
  });

  it('blocks opening another playoff fixture while a double no-show has paused the tournament flow', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'technical-playoff-pause-blocks-opening',
      0,
      playoffTournamentRules(4),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const fixtures = await pool.query<{
      key: string;
      fixture_id: string;
      home_user_id: string;
      scheduled_starts_at: Date;
    }>(
      `select s.depends_on->>'key' as key, f.id as fixture_id,
              home_participant.user_id as home_user_id, f.scheduled_starts_at
         from tournament_playoff_series s
         join tournament_fixture f on f.series_id = s.id
         join tournament_participant home_participant on home_participant.id = f.home_participant_id
        where s.tournament_id = $1 and s.depends_on->>'key' in ('R1S1', 'R1S2')
        order by s.depends_on->>'key'`,
      [tournament.id],
    );
    const pausedFixture = fixtures.rows[0]!;
    const otherFixture = fixtures.rows[1]!;
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: pausedFixture.fixture_id,
      absent: 'both',
      reason: 'integration pauses playoff flow',
      adminUserId: ADMIN_ID,
    });

    await expect(
      openTournamentFixtureSegment(
        pool,
        {
          fixtureId: otherFixture.fixture_id,
          tournamentId: tournament.id,
          userId: otherFixture.home_user_id,
          now: otherFixture.scheduled_starts_at,
        },
        async () => {
          throw new Error('duel factory must not run while tournament is paused');
        },
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('settles tied playoff fixtures using the overtime rules snapshot of their own round', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'playoff-round-overtime-snapshots',
      0,
      playoffTournamentRules(4, {
        overtime: { count: 1, shootoutInitialShots: 3 },
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000821',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            overtime: { count: 0, shootoutInitialShots: 5 },
          },
          {
            roundNumber: 2,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000822',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            overtime: { count: 2, shootoutInitialShots: 7 },
          },
        ],
      }),
    );
    const participantIds = await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const fixtures = await pool.query<{
      fixture_id: string;
      round_number: number;
      home_user_id: string | null;
      away_user_id: string | null;
    }>(
      `select distinct on (round.number)
              fixture.id as fixture_id, round.number as round_number,
              home_participant.user_id as home_user_id,
              away_participant.user_id as away_user_id
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         left join tournament_participant home_participant
           on home_participant.id = fixture.home_participant_id
         left join tournament_participant away_participant
           on away_participant.id = fixture.away_participant_id
        where fixture.tournament_id = $1 and round.stage = 'playoff'
        order by round.number, fixture.fixture_number`,
      [tournament.id],
    );
    expect(fixtures.rows.map((fixture) => fixture.round_number)).toEqual([1, 2]);

    const finalFixture = fixtures.rows.find((fixture) => fixture.round_number === 2)!;
    await pool.query(
      `update tournament_fixture
          set home_participant_id = $2, away_participant_id = $3, status = 'scheduled'
        where id = $1`,
      [finalFixture.fixture_id, participantIds[0], participantIds[1]],
    );

    for (const fixture of fixtures.rows) {
      const users =
        fixture.round_number === 1
          ? { home: fixture.home_user_id!, away: fixture.away_user_id! }
          : { home: PLAYER_IDS[0], away: PLAYER_IDS[1] };
      const duel = await pool.query<{ id: string }>(
        `insert into amateur_duel_match
           (challenger_user_id, opponent_user_id, status, source, rules_snapshot,
            match_seed, starts_at, ends_at, game_core_version)
         values ($1, $2, 'active', 'tournament', '{}'::jsonb,
                 $3, $4, $5, 1)
         returning id`,
        [
          users.home,
          users.away,
          `round-overtime-${fixture.round_number}`,
          new Date('2030-09-01T13:00:00.000Z'),
          new Date('2030-09-01T14:00:00.000Z'),
        ],
      );
      await pool.query(
        `insert into tournament_fixture_segment
           (fixture_id, sequence_number, kind, duel_match_id, status, rules_snapshot)
         values ($1, 1, 'regulation', $2, 'scheduled', '{}'::jsonb)`,
        [fixture.fixture_id, duel.rows[0]!.id],
      );
      const client = await pool.connect();
      try {
        await client.query('begin');
        await settleTournamentSegmentForDuel(client, {
          duelMatchId: duel.rows[0]!.id,
          homeScore: 1,
          awayScore: 1,
          settledAt: new Date('2030-09-01T13:30:00.000Z'),
        });
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }

    const nextSegments = await pool.query<{
      round_number: number;
      kind: string;
      shots_per_participant: number | null;
    }>(
      `select round.number as round_number, segment.kind,
              (segment.rules_snapshot->>'shotsPerParticipant')::int as shots_per_participant
         from tournament_fixture_segment segment
         join tournament_fixture fixture on fixture.id = segment.fixture_id
         join tournament_round round on round.id = fixture.round_id
        where fixture.tournament_id = $1 and segment.sequence_number = 2
        order by round.number`,
      [tournament.id],
    );
    expect(nextSegments.rows).toEqual([
      { round_number: 1, kind: 'shootout_initial', shots_per_participant: 5 },
      { round_number: 2, kind: 'overtime', shots_per_participant: null },
    ]);
  });

  it('publishes an idempotent tournament news post in the official channel', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(pool, 'official-news-dispatch', 0);
    const published: Array<{ channel: string; type: string }> = [];
    const publisher = {
      publish: async (channel: string, event: { type: string }) => {
        published.push({ channel, type: event.type });
      },
    };
    const input = {
      tournamentId: tournament.id,
      idempotencyKey: `${tournament.id}:official-news:1`,
      kind: 'official_news',
      audience: 'approved',
      title: 'Турнирная новость',
      body: 'Календарь турнира опубликован.',
      createdBy: ADMIN_ID,
    } as const;

    const first = await dispatchTournamentCommunication(pool, publisher, input as never);
    const second = await dispatchTournamentCommunication(pool, publisher, input as never);

    expect(first).toMatchObject({ status: 'sent', recipients: 1, delivered: 1, failed: 0 });
    expect(second).toEqual(first);
    const posts = await pool.query<{
      content: string;
      tournament_dispatch_id: string;
      channel_slug: string;
    }>(
      `select message.content,
              message.metadata->>'tournamentDispatchId' as tournament_dispatch_id,
              chat.channel_slug
         from messages message
         join chats chat on chat.id = message.chat_id
        where message.metadata->>'tournamentId' = $1`,
      [tournament.id],
    );
    expect(posts.rows).toEqual([
      {
        content: 'Календарь турнира опубликован.',
        tournament_dispatch_id: first.dispatchId,
        channel_slug: 'news',
      },
    ]);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ type: 'message:new' });
  });

  it('does not exhaust the pool when concurrent manual dispatch retries share an idempotency key', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(pool, 'pool-safe-manual-dispatch', 0);
    const { databaseUrl } = getTestUrls();
    const constrainedPool = new PgPool({
      connectionString: databaseUrl,
      max: 2,
      statement_timeout: 1_000,
    });
    const published: Array<{ channel: string; type: string }> = [];
    const publisher = {
      publish: async (channel: string, event: { type: string }) => {
        published.push({ channel, type: event.type });
      },
    };
    const input = {
      tournamentId: tournament.id,
      idempotencyKey: `${tournament.id}:pool-safe-official-news`,
      kind: 'official_news',
      audience: 'approved',
      title: 'Безопасная отправка',
      body: 'Одна новость при конкурентных повторах.',
      createdBy: ADMIN_ID,
    } as const;

    try {
      const results = await Promise.all([
        dispatchTournamentCommunication(constrainedPool, publisher, input),
        dispatchTournamentCommunication(constrainedPool, publisher, input),
        dispatchTournamentCommunication(constrainedPool, publisher, input),
      ]);

      expect(new Set(results.map((result) => result.dispatchId))).toEqual(
        new Set([results[0]!.dispatchId]),
      );
      expect(results).toEqual([
        {
          dispatchId: results[0]!.dispatchId,
          status: 'sent',
          recipients: 1,
          delivered: 1,
          failed: 0,
        },
        {
          dispatchId: results[0]!.dispatchId,
          status: 'sent',
          recipients: 1,
          delivered: 1,
          failed: 0,
        },
        {
          dispatchId: results[0]!.dispatchId,
          status: 'sent',
          recipients: 1,
          delivered: 1,
          failed: 0,
        },
      ]);
      const dispatches = await constrainedPool.query<{
        id: string;
        status: string;
        delivered_count: number;
      }>(
        `select id, status, delivered_count
             from tournament_dispatch where idempotency_key = $1`,
        [input.idempotencyKey],
      );
      expect(dispatches.rows).toEqual([
        { id: results[0]!.dispatchId, status: 'sent', delivered_count: 1 },
      ]);
      const messages = await constrainedPool.query<{ id: string }>(
        `select id from messages where metadata->>'tournamentDispatchId' = $1`,
        [results[0]!.dispatchId],
      );
      expect(messages.rows).toHaveLength(1);
      expect(published).toHaveLength(1);
    } finally {
      await constrainedPool.end();
    }
  }, 7_000);

  it('bounds dispatch lock acquisition while another session keeps ownership', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(pool, 'bounded-manual-dispatch-lock', 0);
    const idempotencyKey = `${tournament.id}:bounded-official-news`;
    const lockKey = `tournament-dispatch:${idempotencyKey}`;
    const lockHolder = await pool.connect();
    let lockHeld = false;
    let boundTimer: ReturnType<typeof setTimeout> | undefined;
    let dispatchOutcome:
      | Promise<{ kind: 'resolved' } | { kind: 'rejected'; error: unknown; elapsedMs: number }>
      | undefined;

    try {
      await lockHolder.query(`select pg_advisory_lock(hashtext($1))`, [lockKey]);
      lockHeld = true;
      const startedAt = Date.now();
      dispatchOutcome = dispatchTournamentCommunication(
        pool,
        { publish: async () => undefined },
        {
          tournamentId: tournament.id,
          idempotencyKey,
          kind: 'official_news',
          audience: 'approved',
          title: 'Занятая отправка',
          body: 'Повторите отправку позже.',
          createdBy: ADMIN_ID,
        },
      ).then(
        () => ({ kind: 'resolved' as const }),
        (error: unknown) => ({
          kind: 'rejected' as const,
          error,
          elapsedMs: Date.now() - startedAt,
        }),
      );
      const outcome = await Promise.race([
        dispatchOutcome,
        new Promise<{ kind: 'exceeded' }>((resolve) => {
          boundTimer = setTimeout(() => resolve({ kind: 'exceeded' }), 1_500);
        }),
      ]);

      expect(outcome).toMatchObject({
        kind: 'rejected',
        error: {
          code: 'service_unavailable',
          statusCode: 503,
          message: 'tournament dispatch lock acquisition timed out',
        },
      });
      if (outcome.kind === 'rejected') expect(outcome.elapsedMs).toBeLessThan(1_500);
    } finally {
      if (boundTimer !== undefined) clearTimeout(boundTimer);
      if (lockHeld) {
        await lockHolder.query(`select pg_advisory_unlock(hashtext($1))`, [lockKey]);
      }
      lockHolder.release();
      await dispatchOutcome;
    }
  }, 5_000);

  it('serializes concurrent manual dispatch retries and keeps the original snapshot', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(pool, 'concurrent-manual-dispatch', 0);
    await applyToTournament(pool, tournament.id, PLAYER_IDS[0]);
    await applyToTournament(pool, tournament.id, PLAYER_IDS[1]);
    let releaseFirstPublish: (() => void) | undefined;
    const firstPublishRelease = new Promise<void>((resolve) => {
      releaseFirstPublish = resolve;
    });
    let signalFirstPublish: (() => void) | undefined;
    const firstPublishStarted = new Promise<void>((resolve) => {
      signalFirstPublish = resolve;
    });
    let publishCalls = 0;
    const publisher = {
      publish: async () => {
        publishCalls += 1;
        if (publishCalls === 1) {
          signalFirstPublish!();
          await firstPublishRelease;
        }
      },
    };
    const idempotencyKey = `${tournament.id}:concurrent-direct-message`;
    const first = dispatchTournamentCommunication(pool, publisher, {
      tournamentId: tournament.id,
      idempotencyKey,
      kind: 'direct_message',
      audience: 'approved',
      title: 'Исходный заголовок',
      body: 'Исходный текст',
      createdBy: ADMIN_ID,
      systemUserId: ADMIN_ID,
    });
    await firstPublishStarted;
    await inviteTournamentParticipant(pool, tournament.id, PLAYER_IDS[2], ADMIN_ID);
    const second = dispatchTournamentCommunication(pool, publisher, {
      tournamentId: tournament.id,
      idempotencyKey,
      kind: 'direct_message',
      audience: 'all_participants',
      title: 'Изменённый заголовок',
      body: 'Изменённый текст',
      createdBy: ADMIN_ID,
      systemUserId: ADMIN_ID,
    });

    try {
      const secondFinishedBeforeOwner = await Promise.race([
        second.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
      ]);
      expect(secondFinishedBeforeOwner).toBe(false);
    } finally {
      releaseFirstPublish!();
    }
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondResult).toEqual(firstResult);
    expect(firstResult).toMatchObject({ status: 'sent', recipients: 2, delivered: 2, failed: 0 });
    const messages = await pool.query<{
      content: string;
      title: string;
      recipient_user_id: string;
    }>(
      `select content, metadata->>'title' as title,
              metadata->>'recipientUserId' as recipient_user_id
         from messages
        where metadata->>'tournamentDispatchId' = $1
        order by metadata->>'recipientUserId'`,
      [firstResult.dispatchId],
    );
    expect(messages.rows).toEqual(
      [PLAYER_IDS[0], PLAYER_IDS[1]].map((recipient_user_id) => ({
        content: 'Исходный текст',
        title: 'Исходный заголовок',
        recipient_user_id,
      })),
    );
    expect(publishCalls).toBe(4);
  });

  it('pauses and resumes a tournament with an auditable previous lifecycle state', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(pool, 'admin-pause-resume', 0);
    const pauseTournament = (tournamentService as Record<string, unknown>).pauseTournament as (
      pool: Pool,
      input: Record<string, unknown>,
    ) => Promise<{ status: string }>;
    const resumeTournament = (tournamentService as Record<string, unknown>).resumeTournament as (
      pool: Pool,
      input: Record<string, unknown>,
    ) => Promise<{ status: string }>;

    await expect(
      pauseTournament(pool, {
        tournamentId: tournament.id,
        reason: 'Проверка инцидента',
        adminUserId: ADMIN_ID,
      }),
    ).resolves.toMatchObject({ status: 'paused', previousStatus: 'registration' });
    await expect(
      resumeTournament(pool, {
        tournamentId: tournament.id,
        reason: 'Инцидент устранён',
        adminUserId: ADMIN_ID,
      }),
    ).resolves.toMatchObject({ status: 'registration' });

    const audit = await pool.query<{ action: string; previous_status: string; reason: string }>(
      `select payload->>'action' as action,
              payload->>'previousStatus' as previous_status,
              reason
         from tournament_adjustment
        where tournament_id = $1 and kind = 'incident_resolution'
        order by created_at`,
      [tournament.id],
    );
    expect(audit.rows).toEqual([
      { action: 'pause', previous_status: 'registration', reason: 'Проверка инцидента' },
      { action: 'resume', previous_status: 'registration', reason: 'Инцидент устранён' },
    ]);
  });

  it('renders a tournament-specific push override ahead of the global template', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'push-template-override',
      0,
      playoffTournamentRules(2, {
        notificationOverrides: {
          'tournament.application_approved': {
            title: 'Вы в {{tournamentTitle}}',
            body: 'Персональный текст турнира',
            url: '/?view=amateur&section=tournaments',
          },
        },
      }),
    );
    await pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ($1, 'https://push.example.test/override', 'p256dh', 'auth')`,
      [PLAYER_IDS[0]],
    );

    await enqueueTournamentPush(pool, {
      tournamentId: tournament.id,
      userId: PLAYER_IDS[0],
      eventType: 'tournament.application_approved',
      eventKey: `${tournament.id}:override`,
      variables: { tournamentTitle: 'Кубок override' },
      fallback: { title: 'Fallback', body: 'Fallback', url: '/' },
    } as never);

    const delivery = await pool.query<{ title: string; body: string; url: string }>(
      `select payload->>'title' as title, payload->>'body' as body, payload->>'url' as url
         from push_delivery_log
        where event_key = $1`,
      [`${tournament.id}:override`],
    );
    expect(delivery.rows).toEqual([
      {
        title: 'Вы в Кубок override',
        body: 'Персональный текст турнира',
        url: '/?view=amateur&section=tournaments',
      },
    ]);
  });

  it('serializes a double no-show behind an in-flight opening at tournament scope', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'technical-playoff-pause-open-race',
      0,
      playoffTournamentRules(4),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const fixtures = await pool.query<{
      key: string;
      fixture_id: string;
      home_user_id: string;
      away_user_id: string;
      scheduled_starts_at: Date;
    }>(
      `select s.depends_on->>'key' as key, f.id as fixture_id,
              home_participant.user_id as home_user_id, away_participant.user_id as away_user_id,
              f.scheduled_starts_at
         from tournament_playoff_series s
         join tournament_fixture f on f.series_id = s.id
         join tournament_participant home_participant on home_participant.id = f.home_participant_id
         join tournament_participant away_participant on away_participant.id = f.away_participant_id
        where s.tournament_id = $1 and s.depends_on->>'key' in ('R1S1', 'R1S2')
        order by s.depends_on->>'key'`,
      [tournament.id],
    );
    const pausedFixture = fixtures.rows[0]!;
    const openingFixture = fixtures.rows[1]!;
    let releaseFactory: (() => void) | undefined;
    const factoryRelease = new Promise<void>((resolve) => {
      releaseFactory = resolve;
    });
    let signalFactoryStarted: (() => void) | undefined;
    const factoryStarted = new Promise<void>((resolve) => {
      signalFactoryStarted = resolve;
    });
    const opening = openTournamentFixtureSegment(
      pool,
      {
        fixtureId: openingFixture.fixture_id,
        tournamentId: tournament.id,
        userId: openingFixture.home_user_id,
        now: openingFixture.scheduled_starts_at,
      },
      async (client, input) => {
        signalFactoryStarted!();
        await factoryRelease;
        const duel = await client.query<{ id: string }>(
          `insert into amateur_duel_match
             (challenger_user_id, opponent_user_id, status, source, rules_snapshot,
              match_seed, starts_at, ends_at, game_core_version)
           values ($1, $2, 'active', 'tournament', '{}'::jsonb,
                   'pause-open-race', $3, $4, 1)
           returning id`,
          [input.homeUserId, input.awayUserId, input.startsAt, input.endsAt],
        );
        return { matchId: duel.rows[0]!.id };
      },
    );
    await factoryStarted;
    const pausing = resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: pausedFixture.fixture_id,
      absent: 'both',
      reason: 'integration pause/open race',
      adminUserId: ADMIN_ID,
    });

    try {
      const pauseCompletedBeforeFactoryRelease = await Promise.race([
        pausing.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
      ]);
      expect(pauseCompletedBeforeFactoryRelease).toBe(false);
    } finally {
      releaseFactory!();
    }
    await Promise.all([opening, pausing]);
  });

  it('serializes a normal tournament duel settlement before an administrative playoff pause', async () => {
    await seedUsers(pool, 0);
    const template = await pool.query<{ id: string }>(
      `select id from amateur_duel_template
        where duel_kind = 'classic' and is_active and deleted_at is null
        limit 1`,
    );
    const templateId = template.rows[0]!.id;
    const tournament = await createPublishedTournament(
      pool,
      'technical-playoff-settle-pause-race',
      0,
      playoffTournamentRules(4, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 2,
            homeSequence: ['H', 'A', 'H'],
            duelTemplateId: templateId,
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T13:00:00.000Z',
          },
          {
            roundNumber: 2,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: templateId,
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T17:00:00.000Z',
          },
        ],
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const fixtures = await pool.query<{
      key: string;
      fixture_id: string;
      home_user_id: string;
      away_user_id: string;
      scheduled_starts_at: Date;
    }>(
      `select s.depends_on->>'key' as key, f.id as fixture_id,
              home_participant.user_id as home_user_id, away_participant.user_id as away_user_id,
              f.scheduled_starts_at
         from tournament_playoff_series s
         join tournament_fixture f on f.series_id = s.id
         join tournament_participant home_participant on home_participant.id = f.home_participant_id
         join tournament_participant away_participant on away_participant.id = f.away_participant_id
        where s.tournament_id = $1 and s.depends_on->>'key' in ('R1S1', 'R1S2')
        order by s.depends_on->>'key'`,
      [tournament.id],
    );
    const pausedFixture = fixtures.rows[0]!;
    const settledFixture = fixtures.rows[1]!;
    const inventoryItem = await pool.query<{ id: string }>(
      `select id from admin_inventory_items
        where item_kind = 'stick' and rarity = 'common' and deleted_at is null
        limit 1`,
    );
    const inventoryItemId = inventoryItem.rows[0]!.id;
    await pool.query(
      `update admin_inventory_items
          set duel_period_cost = 1, resource_unit = 'period'
        where id = $1`,
      [inventoryItemId],
    );
    for (const userId of [settledFixture.home_user_id, settledFixture.away_user_id]) {
      await pool.query(
        `insert into user_inventory_instance (user_id, inventory_item_id, charges_available)
         values ($1, $2, 4)`,
        [userId, inventoryItemId],
      );
    }

    const opened = await openTournamentFixtureSegment(
      pool,
      {
        fixtureId: settledFixture.fixture_id,
        tournamentId: tournament.id,
        userId: settledFixture.home_user_id,
        now: settledFixture.scheduled_starts_at,
      },
      createTournamentDuelMatch,
    );
    await pool.query(
      `update amateur_duel_match
          set starts_at = now() - interval '1 minute', ends_at = now() + interval '1 hour'
        where id = $1`,
      [opened.duelMatchId],
    );
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'true'::jsonb, 'Турниры включены', 'test')
       on conflict (key) do update set value = excluded.value`,
    );

    const { databaseUrl, redisUrl } = getTestUrls();
    let app: FastifyInstance | undefined;
    const blocker = await pool.connect();
    let blockerTransactionOpen = false;
    let settlePromise: ReturnType<FastifyInstance['inject']> | undefined;
    let pausing: ReturnType<typeof resolveTournamentNoShow> | undefined;
    try {
      app = await buildApp({
        config: {
          NODE_ENV: 'test',
          HOST: '0.0.0.0',
          PORT: 3000,
          LOG_LEVEL: 'warn',
          DATABASE_URL: databaseUrl,
          REDIS_URL: redisUrl,
          JWT_SECRET,
          REFRESH_SECRET,
          TELEGRAM_BOT_TOKEN: 'test-bot-token',
          DAILY_SEED_SECRET,
        },
        pushSchedulerEnabled: false,
        pushWorkerEnabled: false,
      });
      const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
      const homeToken = await jwt.issueAccessToken({ sub: settledFixture.home_user_id });
      const awayToken = await jwt.issueAccessToken({ sub: settledFixture.away_user_id });
      const auth = (token: string) => ({ authorization: `Bearer ${token}` });
      const homeReady = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: auth(homeToken),
        payload: { loadout: { stick: inventoryItemId } },
      });
      expect(homeReady.statusCode).toBe(200);
      const awayReady = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: auth(awayToken),
        payload: { loadout: { stick: inventoryItemId } },
      });
      expect(awayReady.statusCode).toBe(200);

      await pool.query(
        `update amateur_duel_participant
            set state = 'completed', goals = case when user_id = $2 then 1 else 0 end,
                completed_at = now(), updated_at = now()
          where match_id = $1`,
        [opened.duelMatchId, settledFixture.home_user_id],
      );
      await blocker.query('begin');
      blockerTransactionOpen = true;
      const blockerBackend = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await blocker.query('select id from amateur_duel_match where id = $1 for update', [
        opened.duelMatchId,
      ]);
      settlePromise = app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/settle`,
        headers: auth(homeToken),
      });
      const blocked = await waitForBlockedWriter(
        pool,
        blockerBackend.rows[0]!.pid,
        /amateur_duel_match/i,
      );
      expect(blocked.query).toMatch(/amateur_duel_match/i);

      pausing = resolveTournamentNoShow(pool, {
        tournamentId: tournament.id,
        fixtureId: pausedFixture.fixture_id,
        absent: 'both',
        reason: 'integration settlement/pause race',
        adminUserId: ADMIN_ID,
      });
      const pauseCompletedBeforeDuelRelease = await Promise.race([
        pausing.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
      ]);

      await blocker.query('commit');
      blockerTransactionOpen = false;
      const [settled] = await Promise.all([settlePromise, pausing]);
      expect(pauseCompletedBeforeDuelRelease).toBe(false);
      expect(settled.statusCode).toBe(200);
      expect(settled.json().match.status).toBe('settled');
    } finally {
      if (blockerTransactionOpen) await blocker.query('rollback').catch(() => undefined);
      blocker.release();
      if (settlePromise !== undefined) await settlePromise.catch(() => undefined);
      if (pausing !== undefined) await pausing.catch(() => undefined);
      await app?.close();
    }
  });

  it('ignores a late duel callback for a technically cancelled playoff fixture', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'technical-playoff-late-callback',
      0,
      playoffTournamentRules(4, {
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 2,
            homeSequence: ['H', 'A', 'H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000812',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T13:00:00.000Z',
          },
          {
            roundNumber: 2,
            winsRequired: 1,
            homeSequence: ['H'],
            duelTemplateId: '00000000-0000-4000-8000-000000000813',
            gameWindowMs: 3_600_000,
            gameBreakMs: 0,
            roundBreakMs: 0,
            firstGameStartsAt: '2030-09-01T17:00:00.000Z',
          },
        ],
      }),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z'));

    const games = await pool.query<{
      fixture_id: string;
      home_participant_id: string;
      higher_seed_participant_id: string;
      home_user_id: string;
      away_user_id: string;
      series_id: string;
    }>(
      `select f.id as fixture_id, f.home_participant_id, s.higher_seed_participant_id,
              home_participant.user_id as home_user_id, away_participant.user_id as away_user_id,
              s.id as series_id
         from tournament_fixture f
         join tournament_playoff_series s on s.id = f.series_id
         join tournament_participant home_participant on home_participant.id = f.home_participant_id
         join tournament_participant away_participant on away_participant.id = f.away_participant_id
        where s.tournament_id = $1 and s.depends_on->>'key' = 'R1S1'
        order by f.fixture_number`,
      [tournament.id],
    );
    const delayedGame = games.rows[2]!;
    const inventoryItem = await pool.query<{ id: string }>(
      `select id from admin_inventory_items
        where item_kind = 'stick' and rarity = 'common' and deleted_at is null
        limit 1`,
    );
    const inventoryItemId = inventoryItem.rows[0]!.id;
    await pool.query(
      `update admin_inventory_items
          set duel_period_cost = 1, resource_unit = 'period'
        where id = $1`,
      [inventoryItemId],
    );
    const inventoryInstances = await pool.query<{ id: string; user_id: string }>(
      `insert into user_inventory_instance
         (user_id, inventory_item_id, charges_available, charges_reserved)
       values ($1, $3, 1, 2), ($2, $3, 1, 3)
       returning id, user_id`,
      [delayedGame.home_user_id, delayedGame.away_user_id, inventoryItemId],
    );
    const homeInventoryInstanceId = inventoryInstances.rows.find(
      (instance) => instance.user_id === delayedGame.home_user_id,
    )!.id;
    const awayInventoryInstanceId = inventoryInstances.rows.find(
      (instance) => instance.user_id === delayedGame.away_user_id,
    )!.id;
    const reservedLoadout = (instanceId: string) => ({
      items: [
        {
          id: instanceId,
          itemId: inventoryItemId,
          instanceId,
          kind: 'stick',
          title: 'Cancelled tournament reserve',
          duelPeriodCost: 1,
          chargesReserved: 3,
        },
      ],
      powerScore: 10,
      powerCap: 100,
    });
    const duel = await pool.query<{ id: string }>(
      `insert into amateur_duel_match
         (challenger_user_id, opponent_user_id, status, source, rules_snapshot,
          match_seed, starts_at, ends_at, game_core_version)
       values ($1, $2, 'active', 'tournament', '{}'::jsonb,
               'late-callback', $3, $4, 1)
       returning id`,
      [
        delayedGame.home_user_id,
        delayedGame.away_user_id,
        new Date('2030-09-01T15:00:00.000Z'),
        new Date('2030-09-01T16:00:00.000Z'),
      ],
    );
    await pool.query(
      `insert into amateur_duel_participant
         (match_id, user_id, side, state, loadout_snapshot,
          reserved_inventory_charges, consumed_inventory_charges)
       values
         ($1, $2, 'challenger', 'accepted', $4::jsonb, 3, 1),
         ($1, $3, 'opponent', 'accepted', $5::jsonb, 3, 0)`,
      [
        duel.rows[0]!.id,
        delayedGame.home_user_id,
        delayedGame.away_user_id,
        JSON.stringify(reservedLoadout(homeInventoryInstanceId)),
        JSON.stringify(reservedLoadout(awayInventoryInstanceId)),
      ],
    );
    await pool.query(
      `insert into tournament_fixture_segment
         (fixture_id, sequence_number, kind, duel_match_id, status, rules_snapshot)
       values ($1, 1, 'regulation', $2, 'scheduled', '{}'::jsonb)`,
      [delayedGame.fixture_id, duel.rows[0]!.id],
    );

    const higherAbsent = (game: (typeof games.rows)[number]) =>
      game.home_participant_id === game.higher_seed_participant_id ? 'away' : 'home';
    for (const game of games.rows.slice(0, 2)) {
      await resolveTournamentNoShow(pool, {
        tournamentId: tournament.id,
        fixtureId: game.fixture_id,
        absent: higherAbsent(game),
        reason: 'integration technical series close',
        adminUserId: ADMIN_ID,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      await settleTournamentSegmentForDuel(client, {
        duelMatchId: duel.rows[0]!.id,
        homeScore: 1,
        awayScore: 0,
        settledAt: new Date('2030-09-01T15:30:00.000Z'),
      });
      await client.query('commit');
    } finally {
      client.release();
    }

    const state = await pool.query<{
      fixture_status: string;
      home_score: number;
      away_score: number;
      segment_status: string;
      duel_status: string;
      higher_seed_wins: number;
      lower_seed_wins: number;
      series_status: string;
      winner_participant_id: string;
    }>(
      `select f.status as fixture_status, f.home_score, f.away_score,
              segment.status as segment_status, duel.status as duel_status,
              s.higher_seed_wins, s.lower_seed_wins,
              s.status as series_status, s.winner_participant_id
         from tournament_fixture f
         join tournament_fixture_segment segment on segment.fixture_id = f.id
         join amateur_duel_match duel on duel.id = segment.duel_match_id
         join tournament_playoff_series s on s.id = f.series_id
        where f.id = $1`,
      [delayedGame.fixture_id],
    );
    expect(state.rows[0]).toEqual({
      fixture_status: 'cancelled',
      home_score: 0,
      away_score: 0,
      segment_status: 'cancelled',
      duel_status: 'cancelled',
      higher_seed_wins: 2,
      lower_seed_wins: 0,
      series_status: 'completed',
      winner_participant_id: games.rows[0]!.higher_seed_participant_id,
    });
    const rating = await pool.query<{ count: string }>(
      `select count(*)::text as count from amateur_duel_rating
        where user_id = any($1::uuid[])`,
      [[delayedGame.home_user_id, delayedGame.away_user_id]],
    );
    expect(rating.rows[0]?.count).toBe('0');
    const duelEconomy = await pool.query<{ count: string }>(
      `select count(*)::text as count from currency_ledger
        where reason in ('duel_stake_hold', 'duel_entry_fee', 'duel_stake_refund',
                         'duel_stake_payout', 'duel_stake_burn', 'duel_reward')`,
    );
    expect(duelEconomy.rows[0]?.count).toBe('0');
    const cancelledParticipants = await pool.query<{
      user_id: string;
      state: string;
      consumed_inventory_charges: number;
      charges_available: number;
      charges_reserved: number;
    }>(
      `select participant.user_id, participant.state, participant.consumed_inventory_charges,
              instance.charges_available, instance.charges_reserved
         from amateur_duel_participant participant
        join user_inventory_instance instance on instance.id = case participant.user_id
          when $2::uuid then $3::uuid else $4::uuid end
        where participant.match_id = $1
        order by participant.side`,
      [
        duel.rows[0]!.id,
        delayedGame.home_user_id,
        homeInventoryInstanceId,
        awayInventoryInstanceId,
      ],
    );
    expect(cancelledParticipants.rows).toEqual([
      {
        user_id: delayedGame.home_user_id,
        state: 'forfeit',
        consumed_inventory_charges: 3,
        charges_available: 3,
        charges_reserved: 0,
      },
      {
        user_id: delayedGame.away_user_id,
        state: 'forfeit',
        consumed_inventory_charges: 3,
        charges_available: 4,
        charges_reserved: 0,
      },
    ]);
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

  it('does not start head-to-head playoffs while a regular fixture is unfinished', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'head-to-head-incomplete-regular',
      0,
      playoffTournamentRules(2),
    );
    await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 2, 1]);
    await pool.query(
      `update tournament_fixture fixture
          set status = 'scheduled', outcome = null, settled_at = null
         from tournament_round round
        where round.id = fixture.round_id and round.stage = 'regular'
          and fixture.tournament_id = $1`,
      [tournament.id],
    );

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T08:00:00.000Z')),
    ).rejects.toMatchObject({ code: 'conflict' });
    const state = await pool.query<{ status: string; series_count: string }>(
      `select tournament.status,
              (select count(*)::text from tournament_playoff_series series
                where series.tournament_id = tournament.id) as series_count
         from tournament where tournament.id = $1`,
      [tournament.id],
    );
    expect(state.rows[0]).toEqual({ status: 'regular', series_count: '0' });
  });

  it('starts head-to-head playoffs from the winner of a settled cutoff tie-break', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'head-to-head-resolved-cutoff-tie',
      0,
      playoffTournamentRules(2, {
        tieBreakDuelTemplateId: '00000000-0000-4000-8000-000000000803',
      }),
    );
    const participantIds = await prepareTournamentForPlayoffs(pool, tournament.id, [4, 3, 3, 1]);
    const required = await startTournamentPlayoffs(
      pool,
      tournament.id,
      new Date('2030-09-01T08:00:00.000Z'),
    );
    expect(required.status).toBe('tiebreak_required');
    expect(new Set(required.participantIds)).toEqual(
      new Set([participantIds[1]!, participantIds[2]!]),
    );
    const tieBreakFixture = await pool.query<{
      id: string;
      home_participant_id: string;
      away_participant_id: string;
    }>(
      `select fixture.id, fixture.home_participant_id, fixture.away_participant_id
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id and round.stage = 'tiebreak'
        where fixture.tournament_id = $1`,
      [tournament.id],
    );
    const fixture = tieBreakFixture.rows[0]!;
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: fixture.id,
      absent: fixture.home_participant_id === participantIds[2] ? 'away' : 'home',
      reason: 'settle head-to-head cutoff tie-break',
      adminUserId: ADMIN_ID,
    });

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-01T09:00:00.000Z')),
    ).resolves.toMatchObject({ status: 'playoff', seriesCount: 1 });
    const seeds = await pool.query<{ higher_participant_id: string; lower_participant_id: string }>(
      `select higher_seed_participant_id as higher_participant_id,
              lower_seed_participant_id as lower_participant_id
         from tournament_playoff_series
        where tournament_id = $1 and depends_on->>'key' = 'R1S1'`,
      [tournament.id],
    );
    expect(seeds.rows).toEqual([
      { higher_participant_id: participantIds[0], lower_participant_id: participantIds[2] },
    ]);
  });

  it('materializes a playable tie-break for a persisted daily cutoff tie before playoffs', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'daily-playoff-cutoff-tie',
      0,
      dailyPlayoffTournamentRules(),
    );
    const participantIds = await prepareDailyTournamentForPlayoffs(pool, tournament.id);

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-02T08:00:00.000Z')),
    ).resolves.toEqual({
      tournamentId: tournament.id,
      status: 'tiebreak_required',
      participantIds: [participantIds[1], participantIds[2]],
    });

    const rounds = await pool.query<{ stage: string; status: string }>(
      `select stage, status from tournament_round where tournament_id = $1 order by stage`,
      [tournament.id],
    );
    expect(rounds.rows).toEqual([{ stage: 'tiebreak', status: 'scheduled' }]);
    const fixtures = await pool.query<{
      home_participant_id: string;
      away_participant_id: string;
      scheduled_starts_at: Date;
      window_ends_at: Date;
      status: string;
      result_snapshot: { duelTemplateId: string };
    }>(
      `select home_participant_id, away_participant_id, scheduled_starts_at,
              window_ends_at, status, result_snapshot
         from tournament_fixture where tournament_id = $1`,
      [tournament.id],
    );
    expect(fixtures.rows).toEqual([
      {
        home_participant_id: participantIds[1],
        away_participant_id: participantIds[2],
        scheduled_starts_at: new Date('2030-09-02T08:00:00.000Z'),
        window_ends_at: new Date('2030-09-02T08:30:00.000Z'),
        status: 'scheduled',
        result_snapshot: { gameNumber: 1, duelTemplateId: '00000000-0000-4000-8000-000000000803' },
      },
    ]);
  });

  it('seeds playoffs from a settled daily cutoff tie-break without changing daily metrics', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'daily-playoff-resolved-cutoff-tie',
      0,
      dailyPlayoffTournamentRules(),
    );
    const participantIds = await prepareDailyTournamentForPlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-02T08:00:00.000Z'));
    const tieBreakFixture = await pool.query<{
      id: string;
      home_participant_id: string;
      away_participant_id: string;
    }>(
      `select fixture.id, fixture.home_participant_id, fixture.away_participant_id
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id and round.stage = 'tiebreak'
        where fixture.tournament_id = $1`,
      [tournament.id],
    );
    const fixture = tieBreakFixture.rows[0]!;
    await resolveTournamentNoShow(pool, {
      tournamentId: tournament.id,
      fixtureId: fixture.id,
      absent: fixture.home_participant_id === participantIds[2] ? 'away' : 'home',
      reason: 'settle daily cutoff tie-break',
      adminUserId: ADMIN_ID,
    });

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-02T09:00:00.000Z')),
    ).resolves.toMatchObject({ tournamentId: tournament.id, status: 'playoff', seriesCount: 1 });

    const playoffSeed = await pool.query<{
      higher_user_id: string;
      lower_user_id: string;
    }>(
      `select higher.user_id as higher_user_id, lower.user_id as lower_user_id
         from tournament_playoff_series series
         join tournament_participant higher on higher.id = series.higher_seed_participant_id
         join tournament_participant lower on lower.id = series.lower_seed_participant_id
        where series.tournament_id = $1 and series.depends_on->>'key' = 'R1S1'`,
      [tournament.id],
    );
    expect(playoffSeed.rows).toEqual([
      { higher_user_id: PLAYER_IDS[0], lower_user_id: PLAYER_IDS[2] },
    ]);
    const standings = await pool.query<{
      user_id: string;
      rank: number;
      points: number;
      metrics: { metric: string; countedDays: number[] };
      tie_key: number[];
    }>(
      `select participant.user_id, standing.rank, standing.points::float8 as points,
              standing.metrics, standing.tie_key
         from tournament_standing standing
         join tournament_participant participant on participant.id = standing.participant_id
        where standing.tournament_id = $1 order by standing.rank`,
      [tournament.id],
    );
    expect(standings.rows).toEqual([
      {
        user_id: PLAYER_IDS[0],
        rank: 1,
        points: 0.9,
        metrics: { metric: 'accuracy_average', countedDays: [1] },
        tie_key: [0.9],
      },
      {
        user_id: PLAYER_IDS[2],
        rank: 2,
        points: 0.5,
        metrics: { metric: 'accuracy_average', countedDays: [1] },
        tie_key: [0.5],
      },
      {
        user_id: PLAYER_IDS[1],
        rank: 3,
        points: 0.5,
        metrics: { metric: 'accuracy_average', countedDays: [1] },
        tie_key: [0.5],
      },
      {
        user_id: PLAYER_IDS[3],
        rank: 4,
        points: 0.1,
        metrics: { metric: 'accuracy_average', countedDays: [1] },
        tie_key: [0.1],
      },
    ]);
  });

  it('iterates playable daily tie-break rounds until a cyclic cutoff subset resolves', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(
      pool,
      'daily-playoff-cyclic-cutoff-tie',
      0,
      dailyPlayoffTournamentRules(),
    );
    const participantIds = await prepareDailyTournamentForPlayoffs(
      pool,
      tournament.id,
      [0.9, 0.5, 0.5, 0.5],
    );
    const firstTied = participantIds[1]!;
    const secondTied = participantIds[2]!;
    const thirdTied = participantIds[3]!;
    const cyclicOutcomes = [
      { pair: [firstTied, secondTied] as const, winnerParticipantId: firstTied },
      { pair: [firstTied, thirdTied] as const, winnerParticipantId: thirdTied },
      { pair: [secondTied, thirdTied] as const, winnerParticipantId: secondTied },
    ];

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-02T08:00:00.000Z')),
    ).resolves.toEqual({
      tournamentId: tournament.id,
      status: 'tiebreak_required',
      participantIds: [firstTied, secondTied, thirdTied],
    });
    await settleExpectedTieBreakRound(pool, {
      tournamentId: tournament.id,
      roundNumber: 1,
      outcomes: cyclicOutcomes,
    });

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-02T10:00:00.000Z')),
    ).resolves.toEqual({
      tournamentId: tournament.id,
      status: 'tiebreak_required',
      participantIds: [firstTied, secondTied, thirdTied],
    });
    const afterFirstCycle = await pool.query<{
      number: number;
      participant_ids: string[];
      fixture_count: string;
    }>(
      `select round.number, round.rules_snapshot->'participantIds' as participant_ids,
              count(fixture.id)::text as fixture_count
         from tournament_round round
         left join tournament_fixture fixture on fixture.round_id = round.id
        where round.tournament_id = $1 and round.stage = 'tiebreak'
        group by round.id order by round.number`,
      [tournament.id],
    );
    expect(afterFirstCycle.rows).toEqual([
      { number: 1, participant_ids: [firstTied, secondTied, thirdTied], fixture_count: '3' },
      { number: 2, participant_ids: [firstTied, secondTied, thirdTied], fixture_count: '3' },
    ]);

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-02T10:01:00.000Z')),
    ).resolves.toMatchObject({ status: 'tiebreak_required' });
    const idempotentSecondRound = await pool.query<{ rounds: string; fixtures: string }>(
      `select
         (select count(*) from tournament_round
           where tournament_id = $1 and stage = 'tiebreak')::text as rounds,
         (select count(*) from tournament_fixture fixture
           join tournament_round round on round.id = fixture.round_id
          where fixture.tournament_id = $1 and round.stage = 'tiebreak')::text as fixtures`,
      [tournament.id],
    );
    expect(idempotentSecondRound.rows[0]).toEqual({ rounds: '2', fixtures: '6' });
    await settleExpectedTieBreakRound(pool, {
      tournamentId: tournament.id,
      roundNumber: 2,
      outcomes: cyclicOutcomes,
    });

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-02T12:00:00.000Z')),
    ).resolves.toEqual({
      tournamentId: tournament.id,
      status: 'tiebreak_required',
      participantIds: [firstTied, secondTied, thirdTied],
    });
    const thirdRound = await pool.query<{ number: number; fixture_count: string }>(
      `select round.number, count(fixture.id)::text as fixture_count
         from tournament_round round
         left join tournament_fixture fixture on fixture.round_id = round.id
        where round.tournament_id = $1 and round.stage = 'tiebreak'
        group by round.id order by round.number`,
      [tournament.id],
    );
    expect(thirdRound.rows).toEqual([
      { number: 1, fixture_count: '3' },
      { number: 2, fixture_count: '3' },
      { number: 3, fixture_count: '3' },
    ]);
    await settleExpectedTieBreakRound(pool, {
      tournamentId: tournament.id,
      roundNumber: 3,
      outcomes: [
        { pair: [firstTied, secondTied], winnerParticipantId: secondTied },
        { pair: [firstTied, thirdTied], winnerParticipantId: thirdTied },
        { pair: [secondTied, thirdTied], winnerParticipantId: thirdTied },
      ],
    });

    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-02T14:00:00.000Z')),
    ).resolves.toMatchObject({ tournamentId: tournament.id, status: 'playoff', seriesCount: 1 });
    const playoffSeed = await pool.query<{
      higher_user_id: string;
      lower_user_id: string;
    }>(
      `select higher.user_id as higher_user_id, lower.user_id as lower_user_id
         from tournament_playoff_series series
         join tournament_participant higher on higher.id = series.higher_seed_participant_id
         join tournament_participant lower on lower.id = series.lower_seed_participant_id
        where series.tournament_id = $1 and series.depends_on->>'key' = 'R1S1'`,
      [tournament.id],
    );
    expect(playoffSeed.rows).toEqual([
      { higher_user_id: PLAYER_IDS[0], lower_user_id: PLAYER_IDS[3] },
    ]);
    const standings = await pool.query<{
      user_id: string;
      rank: number;
      points: number;
      metrics: { metric: string; countedDays: number[] };
      tie_key: number[];
    }>(
      `select participant.user_id, standing.rank, standing.points::float8 as points,
              standing.metrics, standing.tie_key
         from tournament_standing standing
         join tournament_participant participant on participant.id = standing.participant_id
        where standing.tournament_id = $1 order by standing.rank`,
      [tournament.id],
    );
    expect(standings.rows).toEqual([
      {
        user_id: PLAYER_IDS[0],
        rank: 1,
        points: 0.9,
        metrics: { metric: 'accuracy_average', countedDays: [1] },
        tie_key: [0.9],
      },
      {
        user_id: PLAYER_IDS[3],
        rank: 2,
        points: 0.5,
        metrics: { metric: 'accuracy_average', countedDays: [1] },
        tie_key: [0.5],
      },
      {
        user_id: PLAYER_IDS[2],
        rank: 3,
        points: 0.5,
        metrics: { metric: 'accuracy_average', countedDays: [1] },
        tie_key: [0.5],
      },
      {
        user_id: PLAYER_IDS[1],
        rank: 4,
        points: 0.5,
        metrics: { metric: 'accuracy_average', countedDays: [1] },
        tie_key: [0.5],
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
