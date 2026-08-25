import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTournamentDuelMatch } from '../../src/duel/amateur/routes.js';
import { enqueueTournamentAudiencePush, enqueueTournamentPush } from '../../src/push/tournament.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import { finalizeDueTournamentDailyDays } from '../../src/tournament/dailyAggregate.js';
import { openTournamentFixtureSegment } from '../../src/tournament/fixtureLifecycle.js';
import { grantTournamentStageRewards } from '../../src/tournament/rewards.js';
import {
  applyToTournament,
  approveTournamentParticipant,
  createTournamentDraft,
  generateRegularSchedule,
  isTournamentFeatureEnabled,
  publishRegularSchedule,
  publishTournament,
  resolveTournamentNoShow,
  startTournamentPlayoffs,
  type TournamentRulesSnapshot,
} from '../../src/tournament/service.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const LOCAL_GIT_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const ADMIN_ID = '00000000-0000-4000-8000-000000000901';
const PLAYER_IDS = [
  '00000000-0000-4000-8000-000000000911',
  '00000000-0000-4000-8000-000000000912',
  '00000000-0000-4000-8000-000000000913',
  '00000000-0000-4000-8000-000000000914',
] as const;
const PLAYER_TIMEZONES = ['UTC', 'America/Los_Angeles', 'Europe/Moscow', 'Asia/Tokyo'] as const;
const JWT_SECRET = 'synthetic-access-secret-at-least-16';
const REFRESH_SECRET = 'synthetic-refresh-secret-at-least-16';
const DAILY_SEED_SECRET = 'synthetic-daily-seed-at-least-16';
const ENTRY_FEE = 5;

const REGULAR_REWARDS = [
  { place: 1, coins: 40, stars: 4, experience: 400 },
  { place: 2, coins: 30, stars: 3, experience: 300 },
  { place: 3, coins: 20, stars: 2, experience: 200 },
  { place: 4, coins: 10, stars: 1, experience: 100 },
];
const PLAYOFF_REWARDS = [
  { place: 1, coins: 100, stars: 10, experience: 1_000 },
  { place: 2, coins: 70, stars: 7, experience: 700 },
  { place: 3, coins: 40, stars: 4, experience: 400 },
  { place: 4, coins: 20, stars: 2, experience: 200 },
];

interface FixtureRow {
  id: string;
  home_participant_id: string;
  away_participant_id: string;
  home_user_id: string;
  away_user_id: string;
  scheduled_starts_at: Date;
}

function tournamentRules(
  regularSource: 'head_to_head' | 'daily_aggregate',
  duelTemplateId: string,
): TournamentRulesSnapshot {
  const config =
    regularSource === 'head_to_head'
      ? parseTournamentConfig({
          regularSource,
          participantLimit: 4,
          playoffSize: 4,
          timezone: 'UTC',
          registrationMode: 'approval',
          visibility: 'public',
          entryFeeCoins: ENTRY_FEE,
          roundRobinCycles: 1,
          roundsPerDay: 3,
          firstRoundLocalTime: '10:00',
          fixtureWindowMs: 3_600_000,
          roundBreakMs: 900_000,
          dailyDays: null,
          dailyMetric: null,
          bestDays: null,
        })
      : parseTournamentConfig({
          regularSource,
          participantLimit: 4,
          playoffSize: 4,
          timezone: 'UTC',
          registrationMode: 'approval',
          visibility: 'public',
          entryFeeCoins: ENTRY_FEE,
          roundRobinCycles: null,
          roundsPerDay: null,
          firstRoundLocalTime: null,
          fixtureWindowMs: null,
          roundBreakMs: null,
          dailyDays: 3,
          dailyMetric: 'accuracy_average',
          bestDays: 2,
        });
  return {
    config,
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
    regularDuelTemplateId: duelTemplateId,
    regularScoring: {
      regulationWin: 3,
      overtimeWin: 2,
      overtimeLoss: 1,
      draw: 1,
      loss: 0,
      technicalLoss: 0,
    },
    tieBreakCriteria: ['points', 'wins', 'goal_difference', 'goals_for'],
    dailyPlacePoints: [4, 3, 2, 1],
    playoffRounds: [
      {
        roundNumber: 1,
        winsRequired: 1,
        homeSequence: ['H'],
        duelTemplateId,
        gameWindowMs: 3_600_000,
        gameBreakMs: 0,
        roundBreakMs: 900_000,
      },
      {
        roundNumber: 2,
        winsRequired: 1,
        homeSequence: ['H'],
        duelTemplateId,
        gameWindowMs: 3_600_000,
        gameBreakMs: 0,
        roundBreakMs: 0,
      },
    ],
    stageRewards: {
      regular: REGULAR_REWARDS,
      playoff: PLAYOFF_REWARDS,
    },
  };
}

async function seedUsersAndPush(pool: Pool): Promise<void> {
  await pool.query(
    `insert into users
       (id, display_name, timezone, role, level, lifetime_goals_total, experience)
     values ($1, 'Synthetic Tournament Admin', 'UTC', 'admin', 10, 1000, 1000)`,
    [ADMIN_ID],
  );
  for (const [index, playerId] of PLAYER_IDS.entries()) {
    await pool.query(
      `insert into users
         (id, display_name, timezone, level, lifetime_goals_total, experience)
       values ($1, $2, $3, 5, 500, 1000)`,
      [playerId, `Synthetic Player ${index + 1}`, PLAYER_TIMEZONES[index]],
    );
    await pool.query(`insert into user_currency_account (user_id, balance) values ($1, 100)`, [
      playerId,
    ]);
    await pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ($1, $2, 'synthetic-p256dh', 'synthetic-auth')`,
      [playerId, `https://push.synthetic.test/${playerId}`],
    );
  }
}

async function configureRewardingDuelTemplate(pool: Pool): Promise<string> {
  const template = await pool.query<{ id: string }>(
    `select id from amateur_duel_template
      where duel_kind = 'classic' and deleted_at is null
      order by created_at, id limit 1`,
  );
  const templateId = template.rows[0]!.id;
  await pool.query(
    `update amateur_duel_template
        set is_active = true,
            ranked_enabled = true,
            starts_at = '2030-01-01T00:00:00.000Z',
            ends_at = '2040-01-01T00:00:00.000Z',
            stake_amount = 7,
            entry_fee_amount = 3,
            win_currency_reward = 11,
            draw_currency_reward = 5,
            win_star_reward = 6,
            required_inventory_item_id = null,
            inventory_charges_per_period = 0
      where id = $1`,
    [templateId],
  );
  return templateId;
}

async function createRegisteredTournament(
  pool: Pool,
  input: {
    slug: string;
    title: string;
    startsAt: Date;
    regularSource: 'head_to_head' | 'daily_aggregate';
    duelTemplateId: string;
  },
): Promise<{ id: string; revision: number }> {
  const tournament = await createTournamentDraft(pool, {
    slug: input.slug,
    title: input.title,
    description: 'Deterministic synthetic acceptance season',
    rules: tournamentRules(input.regularSource, input.duelTemplateId),
    createdBy: ADMIN_ID,
    registrationOpensAt: null,
    registrationClosesAt: null,
    startsAt: input.startsAt,
  });
  await publishTournament(pool, tournament.id, tournament.revision, ADMIN_ID);
  for (const playerId of PLAYER_IDS) {
    const application = await applyToTournament(pool, tournament.id, playerId);
    expect(application.state).toBe('applied');
    await approveTournamentParticipant(pool, tournament.id, application.participantId, ADMIN_ID);
    const pushInput = {
      userId: playerId,
      eventType: 'tournament.application_approved' as const,
      eventKey: `${tournament.id}:application-approved:${playerId}`,
      variables: { tournamentTitle: input.title },
      fallback: {
        title: 'Заявка подтверждена',
        body: `${input.title}: вы участвуете.`,
        url: '/?view=amateur&section=tournaments',
      },
    };
    expect(await enqueueTournamentPush(pool, pushInput)).toBe(false);
    expect(await enqueueTournamentPush(pool, pushInput)).toBe(false);
  }
  const participants = await pool.query<{
    state: string;
    entry_fee_state: string;
    entry_fee_coins: number;
  }>(
    `select state, entry_fee_state, entry_fee_coins from tournament_participant
      where tournament_id = $1 order by user_id`,
    [tournament.id],
  );
  expect(participants.rows).toEqual(
    PLAYER_IDS.map(() => ({
      state: 'approved',
      entry_fee_state: 'paid',
      entry_fee_coins: ENTRY_FEE,
    })),
  );
  return { id: tournament.id, revision: tournament.revision };
}

async function enqueueAudienceLifecyclePush(
  pool: Pool,
  input: {
    tournamentId: string;
    eventType:
      | 'tournament.schedule_published'
      | 'tournament.playoff_started'
      | 'tournament.completed';
    eventKey: string;
    tournamentTitle: string;
  },
): Promise<void> {
  const pushInput = {
    tournamentId: input.tournamentId,
    eventType: input.eventType,
    eventKey: input.eventKey,
    variables: { tournamentTitle: input.tournamentTitle },
    fallback: {
      title: input.tournamentTitle,
      body: input.tournamentTitle,
      url: '/?view=amateur&section=tournaments',
    },
  };
  expect(await enqueueTournamentAudiencePush(pool, pushInput)).toBe(0);
  expect(await enqueueTournamentAudiencePush(pool, pushInput)).toBe(0);
}

async function publishSyntheticSchedule(
  pool: Pool,
  tournament: { id: string; revision: number },
  title: string,
): Promise<void> {
  await generateRegularSchedule(pool, tournament.id, tournament.revision);
  await publishRegularSchedule(pool, tournament.id);
  await enqueueAudienceLifecyclePush(pool, {
    tournamentId: tournament.id,
    eventType: 'tournament.schedule_published',
    eventKey: `${tournament.id}:schedule-published:${tournament.revision}`,
    tournamentTitle: title,
  });
}

async function settleRealTournamentDuel(
  pool: Pool,
  tournamentId: string,
  fixture: FixtureRow,
  winnerUserId: string,
): Promise<string> {
  const settlementTime = new Date(fixture.scheduled_starts_at.getTime() + 60_000);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(settlementTime);
  let app: FastifyInstance | undefined;
  try {
    const opened = await openTournamentFixtureSegment(
      pool,
      {
        fixtureId: fixture.id,
        tournamentId,
        userId: fixture.home_user_id,
        now: fixture.scheduled_starts_at,
      },
      createTournamentDuelMatch,
    );
    const { databaseUrl, redisUrl } = getTestUrls();
    await pool.query(
      `update game_settings set value = 'true'::jsonb where key = 'tournaments.enabled'`,
    );
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
        TELEGRAM_BOT_TOKEN: 'synthetic-bot-token',
        DAILY_SEED_SECRET,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);
    }
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed', current_period = 3, completed_at = $3,
              shots_taken = 90, goals = case when user_id = $2 then 2 else 0 end,
              active_duration_ms = case when user_id = $2 then 1000 else 2000 end,
              updated_at = $3
        where match_id = $1`,
      [opened.duelMatchId, winnerUserId, settlementTime],
    );
    const token = await jwt.issueAccessToken({ sub: winnerUserId });
    const settled = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/settle`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(settled.statusCode).toBe(200);
    const settledMatch = settled.json().match as {
      id: string;
      source: string;
      status: string;
      winner_user_id: string | null;
      outcome: string | null;
      settled_at: string | null;
    };
    expect(settledMatch).toMatchObject({
      id: opened.duelMatchId,
      source: 'tournament',
      status: 'settled',
      winner_user_id: winnerUserId,
    });
    expect(settledMatch.outcome).toMatch(/^(challenger|opponent)_win$/);
    expect(settledMatch.settled_at).toBe(settlementTime.toISOString());
    const terminalRetry = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/settle`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(terminalRetry.statusCode).toBe(200);
    expect(terminalRetry.json().match).toMatchObject({
      id: opened.duelMatchId,
      source: 'tournament',
      status: 'settled',
      winner_user_id: winnerUserId,
      outcome: settledMatch.outcome,
      settled_at: settledMatch.settled_at,
    });
    return opened.duelMatchId;
  } finally {
    await app?.close();
    await pool.query(
      `update game_settings set value = 'false'::jsonb where key = 'tournaments.enabled'`,
    );
    vi.useRealTimers();
  }
}

function desiredRegularWinner(homeUserId: string, awayUserId: string): string {
  const pair = new Set([homeUserId, awayUserId]);
  if (pair.has(PLAYER_IDS[0])) return PLAYER_IDS[0];
  if (pair.has(PLAYER_IDS[1])) return PLAYER_IDS[1];
  return PLAYER_IDS[2];
}

async function settleFixtureTechnically(
  pool: Pool,
  tournamentId: string,
  fixture: Pick<FixtureRow, 'id' | 'home_user_id' | 'away_user_id'>,
  winnerUserId: string,
): Promise<void> {
  const absent = fixture.home_user_id === winnerUserId ? 'away' : 'home';
  const input = {
    tournamentId,
    fixtureId: fixture.id,
    absent,
    reason: 'deterministic synthetic settlement',
    adminUserId: ADMIN_ID,
  } as const;
  await resolveTournamentNoShow(pool, input);
  await resolveTournamentNoShow(pool, input);
}

async function startAndCompletePlayoffs(
  pool: Pool,
  input: {
    tournamentId: string;
    tournamentTitle: string;
    startsAt: Date;
    expectedFinalUserIds: readonly [string, string, string, string];
  },
): Promise<void> {
  const started = await startTournamentPlayoffs(pool, input.tournamentId, input.startsAt);
  expect(started).toMatchObject({ status: 'playoff', seriesCount: 4 });
  await enqueueAudienceLifecyclePush(pool, {
    tournamentId: input.tournamentId,
    eventType: 'tournament.playoff_started',
    eventKey: `${input.tournamentId}:playoff-started`,
    tournamentTitle: input.tournamentTitle,
  });
  for (const [seriesKey, winnerUserId] of [
    ['R1S1', input.expectedFinalUserIds[1]],
    ['R1S2', input.expectedFinalUserIds[0]],
    ['R2S1', input.expectedFinalUserIds[0]],
    ['BRONZE', input.expectedFinalUserIds[2]],
  ] as const) {
    const fixture = await pool.query<
      FixtureRow & {
        higher_seed_participant_id: string;
        lower_seed_participant_id: string;
      }
    >(
      `select f.id, f.home_participant_id, f.away_participant_id,
              home_participant.user_id as home_user_id,
              away_participant.user_id as away_user_id,
              f.scheduled_starts_at,
              series.higher_seed_participant_id,
              series.lower_seed_participant_id
         from tournament_playoff_series series
         join tournament_fixture f on f.series_id = series.id and f.status = 'scheduled'
         join tournament_participant home_participant on home_participant.id = f.home_participant_id
         join tournament_participant away_participant on away_participant.id = f.away_participant_id
        where series.tournament_id = $1 and series.depends_on->>'key' = $2`,
      [input.tournamentId, seriesKey],
    );
    const game = fixture.rows[0]!;
    expect([game.home_user_id, game.away_user_id]).toContain(winnerUserId);
    await settleFixtureTechnically(pool, input.tournamentId, game, winnerUserId);
  }
  const placements = await finalPlacementUserIds(pool, input.tournamentId);
  expect(placements).toEqual(input.expectedFinalUserIds);
}

async function finalPlacementUserIds(pool: Pool, tournamentId: string): Promise<string[]> {
  const series = await pool.query<{
    kind: 'championship' | 'third_place';
    higher_user_id: string;
    lower_user_id: string;
    winner_user_id: string;
    round_number: number;
  }>(
    `select series.kind, higher.user_id as higher_user_id, lower.user_id as lower_user_id,
            winner.user_id as winner_user_id, round.number as round_number
       from tournament_playoff_series series
       join tournament_round round on round.id = series.round_id
       join tournament_participant higher on higher.id = series.higher_seed_participant_id
       join tournament_participant lower on lower.id = series.lower_seed_participant_id
       join tournament_participant winner on winner.id = series.winner_participant_id
      where series.tournament_id = $1 and series.status = 'completed'
      order by round.number desc, series.kind`,
    [tournamentId],
  );
  const final = series.rows.find((row) => row.kind === 'championship' && row.round_number === 2)!;
  const bronze = series.rows.find((row) => row.kind === 'third_place')!;
  return [
    final.winner_user_id,
    final.higher_user_id === final.winner_user_id ? final.lower_user_id : final.higher_user_id,
    bronze.winner_user_id,
    bronze.higher_user_id === bronze.winner_user_id ? bronze.lower_user_id : bronze.higher_user_id,
  ];
}

async function assertTerminalInvariants(
  pool: Pool,
  input: {
    tournamentId: string;
    expectedStandingUserIds: string[];
    expectedResultPushes: number;
    expectedStageRewards: Array<{
      user_id: string;
      stage: string;
      place: number;
      coins: number;
      stars: number;
      experience: number;
    }>;
    expectedBalances: Array<{
      user_id: string;
      balance: number;
      stars: number;
      experience: number;
    }>;
  },
): Promise<void> {
  expect(await isTournamentFeatureEnabled(pool)).toBe(false);
  const terminal = await pool.query<{
    status: string;
    completed: boolean;
    unresolved_fixtures: string;
    unresolved_series: string;
  }>(
    `select t.status, t.completed_at is not null as completed,
            (select count(*)::text from tournament_fixture fixture
              where fixture.tournament_id = t.id
                and fixture.status not in ('settled', 'forfeit', 'cancelled')) as unresolved_fixtures,
            (select count(*)::text from tournament_playoff_series series
              where series.tournament_id = t.id and series.status <> 'completed') as unresolved_series
       from tournament t where t.id = $1`,
    [input.tournamentId],
  );
  expect(terminal.rows[0]).toEqual({
    status: 'completed',
    completed: true,
    unresolved_fixtures: '0',
    unresolved_series: '0',
  });
  const economy = await pool.query<{
    kind: string;
    stage: string | null;
    count: string;
    distinct_keys: string;
  }>(
    `select kind, metadata->>'stage' as stage, count(*)::text as count,
            count(distinct idempotency_key)::text as distinct_keys
       from tournament_economy_event
      where tournament_id = $1 and status = 'applied'
      group by kind, metadata->>'stage'
      order by kind, stage nulls first`,
    [input.tournamentId],
  );
  expect(economy.rows).toEqual([
    { kind: 'entry_fee', stage: null, count: '4', distinct_keys: '4' },
    { kind: 'stage_reward', stage: 'playoff', count: '4', distinct_keys: '4' },
    { kind: 'stage_reward', stage: 'regular', count: '4', distinct_keys: '4' },
  ]);
  const stageRewards = await pool.query<{
    user_id: string;
    stage: string;
    place: number;
    coins: number;
    stars: number;
    experience: number;
  }>(
    `select participant.user_id, event.metadata->>'stage' as stage,
            (event.metadata->>'place')::int as place,
            event.coins, event.stars, event.experience
       from tournament_economy_event event
       join tournament_participant participant on participant.id = event.participant_id
      where event.tournament_id = $1 and event.kind = 'stage_reward'
        and event.status = 'applied'
      order by event.metadata->>'stage', (event.metadata->>'place')::int`,
    [input.tournamentId],
  );
  expect(stageRewards.rows).toEqual(input.expectedStageRewards);
  const standings = await pool.query<{ user_id: string; rank: number }>(
    `select participant.user_id, standing.rank
       from tournament_standing standing
       join tournament_participant participant on participant.id = standing.participant_id
      where standing.tournament_id = $1 order by standing.rank`,
    [input.tournamentId],
  );
  expect(standings.rows.map((row) => row.user_id)).toEqual(input.expectedStandingUserIds);
  const balances = await pool.query<{
    user_id: string;
    balance: number;
    stars: number;
    experience: number;
  }>(
    `select participant.user_id, account.balance, users.stars, users.experience
       from tournament_standing standing
       join tournament_participant participant on participant.id = standing.participant_id
       join users on users.id = participant.user_id
       join user_currency_account account on account.user_id = participant.user_id
      where standing.tournament_id = $1 order by participant.user_id`,
    [input.tournamentId],
  );
  expect(balances.rows).toEqual(input.expectedBalances);
  const pushes = await pool.query<{
    event_type: string;
    count: string;
    distinct_deliveries: string;
  }>(
    `select event_type, count(*)::text as count,
            count(distinct user_id::text || ':' || event_key)::text as distinct_deliveries
       from push_delivery_log
      where event_type like 'tournament.%'
      group by event_type order by event_type`,
  );
  expect(pushes.rows).toEqual([
    { event_type: 'tournament.application_approved', count: '4', distinct_deliveries: '4' },
    { event_type: 'tournament.completed', count: '4', distinct_deliveries: '4' },
    {
      event_type: 'tournament.playoff_started',
      count: '4',
      distinct_deliveries: '4',
    },
    {
      event_type: 'tournament.result_ready',
      count: String(input.expectedResultPushes),
      distinct_deliveries: String(input.expectedResultPushes),
    },
    { event_type: 'tournament.schedule_published', count: '4', distinct_deliveries: '4' },
    { event_type: 'tournament.series_next_game', count: '4', distinct_deliveries: '4' },
  ]);
}

async function seedDailySourceRows(pool: Pool): Promise<void> {
  const goalsByPlayerAndDay = [
    [27, 54, 45],
    [36, 40, 72],
    [18, 63, 9],
    [45, 9, 27],
  ];
  for (const [playerIndex, userId] of PLAYER_IDS.entries()) {
    for (let tournamentDay = 1; tournamentDay <= 3; tournamentDay += 1) {
      const incomplete = userId === PLAYER_IDS[1] && tournamentDay === 2;
      const localDate = await pool.query<{ local_date: string }>(
        `select (($2::timestamptz at time zone timezone)::date + ($3::int - 1))::text
                  as local_date
           from users where id = $1`,
        [userId, new Date('2032-06-01T12:00:00.000Z'), tournamentDay],
      );
      const dayPool = await pool.query<{ id: string }>(
        `insert into day_pool
           (user_id, day_date, state, current_period, closed_at, game_core_version, daily_seed)
         values ($1, $2, 'closed', $3, $4, 1, $5) returning id`,
        [
          userId,
          localDate.rows[0]!.local_date,
          incomplete ? 2 : 3,
          new Date(`2032-06-0${tournamentDay}T20:00:00.000Z`),
          `synthetic:${userId}:${tournamentDay}`,
        ],
      );
      const periodCount = incomplete ? 2 : 3;
      const goals = goalsByPlayerAndDay[playerIndex]![tournamentDay - 1]!;
      for (let period = 1; period <= periodCount; period += 1) {
        await pool.query(
          `insert into period_log
             (day_pool_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
           values ($1, $2, $3, $4, 30, $5, 'quota')`,
          [
            dayPool.rows[0]!.id,
            period,
            new Date(`2032-06-0${tournamentDay}T1${period}:00:00.000Z`),
            new Date(`2032-06-0${tournamentDay}T1${period}:10:00.000Z`),
            incomplete ? 20 : goals / 3,
          ],
        );
      }
    }
  }
}

describe.skipIf(!hasIntegrationEnv)('synthetic tournament seasons', () => {
  let pool: Pool;

  beforeAll(() => {
    process.stdout.write(`[synthetic tournament seasons] local HEAD ${LOCAL_GIT_SHA}\n`);
    pool = createTestPool();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await pool.query(
      `update game_settings set value = 'false'::jsonb where key = 'tournaments.enabled'`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('runs a complete head-to-head season through a real tournament duel and fixed playoffs', async () => {
    await seedUsersAndPush(pool);
    const duelTemplateId = await configureRewardingDuelTemplate(pool);
    const title = 'Synthetic Head-to-Head Cup';
    const tournament = await createRegisteredTournament(pool, {
      slug: 'synthetic-head-to-head-season',
      title,
      startsAt: new Date('2032-05-01T10:00:00.000Z'),
      regularSource: 'head_to_head',
      duelTemplateId,
    });
    expect(await isTournamentFeatureEnabled(pool)).toBe(true);
    await publishSyntheticSchedule(pool, tournament, title);

    const fixtures = await pool.query<FixtureRow>(
      `select fixture.id, fixture.home_participant_id, fixture.away_participant_id,
              home.user_id as home_user_id, away.user_id as away_user_id,
              fixture.scheduled_starts_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id and round.stage = 'regular'
         join tournament_participant home on home.id = fixture.home_participant_id
         join tournament_participant away on away.id = fixture.away_participant_id
        where fixture.tournament_id = $1 order by fixture.fixture_number`,
      [tournament.id],
    );
    expect(fixtures.rows).toHaveLength(6);
    const playedFixture = fixtures.rows.find(
      (fixture) =>
        new Set([fixture.home_user_id, fixture.away_user_id]).has(PLAYER_IDS[0]) &&
        new Set([fixture.home_user_id, fixture.away_user_id]).has(PLAYER_IDS[1]),
    )!;
    const duelMatchId = await settleRealTournamentDuel(
      pool,
      tournament.id,
      playedFixture,
      PLAYER_IDS[0],
    );
    for (const fixture of fixtures.rows) {
      if (fixture.id === playedFixture.id) continue;
      await settleFixtureTechnically(
        pool,
        tournament.id,
        fixture,
        desiredRegularWinner(fixture.home_user_id, fixture.away_user_id),
      );
    }

    const standings = await pool.query<{
      user_id: string;
      rank: number;
      points: number;
      wins: number;
      goal_difference: number;
    }>(
      `select participant.user_id, standing.rank, standing.points::float8 as points,
              standing.wins,
              (standing.goals_for - standing.goals_against)::int as goal_difference
         from tournament_standing standing
         join tournament_participant participant on participant.id = standing.participant_id
        where standing.tournament_id = $1 order by standing.rank`,
      [tournament.id],
    );
    expect(standings.rows.slice(0, 2)).toEqual([
      { user_id: PLAYER_IDS[0], rank: 1, points: 9, wins: 3, goal_difference: 4 },
      { user_id: PLAYER_IDS[1], rank: 2, points: 6, wins: 2, goal_difference: 0 },
    ]);
    const expectedStandingUserIds = standings.rows.map((row) => row.user_id);
    expect(expectedStandingUserIds).toEqual([
      PLAYER_IDS[0],
      PLAYER_IDS[1],
      PLAYER_IDS[2],
      PLAYER_IDS[3],
    ]);

    const tournamentDuel = await pool.query<{
      source: string;
      ranked: boolean;
      stake_amount: number;
      entry_fee_amount: number;
      win_currency_reward: number;
      win_star_reward: number;
    }>(
      `select source, ranked, stake_amount, entry_fee_amount,
              (rules_snapshot->>'winCurrencyReward')::int as win_currency_reward,
              (rules_snapshot->>'winStarReward')::int as win_star_reward
         from amateur_duel_match where id = $1`,
      [duelMatchId],
    );
    expect(tournamentDuel.rows[0]).toEqual({
      source: 'tournament',
      ranked: false,
      stake_amount: 0,
      entry_fee_amount: 0,
      win_currency_reward: 0,
      win_star_reward: 0,
    });
    const ordinarySideEffects = await pool.query<{
      ratings: string;
      stake_or_template_ledgers: string;
      template_star_events: string;
    }>(
      `select
         (select count(*) from amateur_duel_rating)::text as ratings,
         (select count(*) from currency_ledger
           where duel_match_id = $1
             and reason in (
               'duel_stake_hold', 'duel_entry_fee', 'duel_stake_refund',
               'duel_stake_payout', 'duel_stake_burn', 'duel_reward'
             ))::text as stake_or_template_ledgers,
         (select count(*) from event_log
           where type = 'amateur_duel_star_reward'
             and payload->>'match_id' = $1::text)::text
           as template_star_events`,
      [duelMatchId],
    );
    expect(ordinarySideEffects.rows[0]).toEqual({
      ratings: '0',
      stake_or_template_ledgers: '0',
      template_star_events: '0',
    });

    expect(await grantTournamentStageRewards(pool, tournament.id, 'regular')).toMatchObject({
      granted: 4,
    });
    expect(await grantTournamentStageRewards(pool, tournament.id, 'regular')).toMatchObject({
      granted: 0,
    });
    await startAndCompletePlayoffs(pool, {
      tournamentId: tournament.id,
      tournamentTitle: title,
      startsAt: new Date('2032-05-02T11:00:00.000Z'),
      expectedFinalUserIds: [PLAYER_IDS[2], PLAYER_IDS[3], PLAYER_IDS[1], PLAYER_IDS[0]],
    });
    expect(await grantTournamentStageRewards(pool, tournament.id, 'playoff')).toMatchObject({
      granted: 4,
    });
    expect(await grantTournamentStageRewards(pool, tournament.id, 'playoff')).toMatchObject({
      granted: 0,
    });
    await enqueueAudienceLifecyclePush(pool, {
      tournamentId: tournament.id,
      eventType: 'tournament.completed',
      eventKey: `${tournament.id}:completed`,
      tournamentTitle: title,
    });
    await assertTerminalInvariants(pool, {
      tournamentId: tournament.id,
      expectedStandingUserIds,
      expectedResultPushes: 20,
      expectedStageRewards: [
        {
          user_id: PLAYER_IDS[2],
          stage: 'playoff',
          place: 1,
          coins: 100,
          stars: 10,
          experience: 1_000,
        },
        {
          user_id: PLAYER_IDS[3],
          stage: 'playoff',
          place: 2,
          coins: 70,
          stars: 7,
          experience: 700,
        },
        {
          user_id: PLAYER_IDS[1],
          stage: 'playoff',
          place: 3,
          coins: 40,
          stars: 4,
          experience: 400,
        },
        {
          user_id: PLAYER_IDS[0],
          stage: 'playoff',
          place: 4,
          coins: 20,
          stars: 2,
          experience: 200,
        },
        {
          user_id: PLAYER_IDS[0],
          stage: 'regular',
          place: 1,
          coins: 40,
          stars: 4,
          experience: 400,
        },
        {
          user_id: PLAYER_IDS[1],
          stage: 'regular',
          place: 2,
          coins: 30,
          stars: 3,
          experience: 300,
        },
        {
          user_id: PLAYER_IDS[2],
          stage: 'regular',
          place: 3,
          coins: 20,
          stars: 2,
          experience: 200,
        },
        {
          user_id: PLAYER_IDS[3],
          stage: 'regular',
          place: 4,
          coins: 10,
          stars: 1,
          experience: 100,
        },
      ],
      expectedBalances: [
        { user_id: PLAYER_IDS[0], balance: 155, stars: 6, experience: 1_600 },
        { user_id: PLAYER_IDS[1], balance: 165, stars: 7, experience: 1_700 },
        { user_id: PLAYER_IDS[2], balance: 215, stars: 12, experience: 2_200 },
        { user_id: PLAYER_IDS[3], balance: 175, stars: 8, experience: 1_800 },
      ],
    });
  });

  it('runs a complete multi-timezone daily season and preserves its standings into playoffs', async () => {
    await seedUsersAndPush(pool);
    const duelTemplateId = await configureRewardingDuelTemplate(pool);
    const title = 'Synthetic Daily Aggregate Cup';
    const tournament = await createRegisteredTournament(pool, {
      slug: 'synthetic-daily-season',
      title,
      startsAt: new Date('2032-06-01T12:00:00.000Z'),
      regularSource: 'daily_aggregate',
      duelTemplateId,
    });
    expect(await isTournamentFeatureEnabled(pool)).toBe(true);
    await publishSyntheticSchedule(pool, tournament, title);
    await seedDailySourceRows(pool);

    expect(
      await finalizeDueTournamentDailyDays(pool, new Date('2032-06-02T06:59:59.000Z')),
    ).toEqual({ finalizedDays: 0, finalizedParticipants: 0 });
    expect(
      await finalizeDueTournamentDailyDays(pool, new Date('2032-06-02T07:00:00.000Z')),
    ).toEqual({ finalizedDays: 1, finalizedParticipants: 4 });
    expect(
      await finalizeDueTournamentDailyDays(pool, new Date('2032-06-02T07:00:00.000Z')),
    ).toEqual({ finalizedDays: 0, finalizedParticipants: 0 });
    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2032-06-02T08:00:00.000Z')),
    ).rejects.toMatchObject({ code: 'conflict', statusCode: 409 });
    const afterIncompleteDailyCoverage = await pool.query<{ status: string }>(
      `select status from tournament where id = $1`,
      [tournament.id],
    );
    expect(afterIncompleteDailyCoverage.rows[0]?.status).toBe('regular');
    expect(
      await finalizeDueTournamentDailyDays(pool, new Date('2032-06-03T07:00:00.000Z')),
    ).toEqual({ finalizedDays: 1, finalizedParticipants: 4 });
    expect(
      await finalizeDueTournamentDailyDays(pool, new Date('2032-06-04T07:00:00.000Z')),
    ).toEqual({ finalizedDays: 1, finalizedParticipants: 4 });
    expect(
      await finalizeDueTournamentDailyDays(pool, new Date('2032-06-04T07:01:00.000Z')),
    ).toEqual({ finalizedDays: 0, finalizedParticipants: 0 });

    const incomplete = await pool.query<{
      completed: boolean;
      goals: number;
      shots: number;
      accuracy: number;
      place: number | null;
      place_points: number;
    }>(
      `select result.completed, result.goals, result.shots,
              result.accuracy::float8 as accuracy, result.place,
              result.place_points::float8 as place_points
         from tournament_daily_result result
         join tournament_participant participant on participant.id = result.participant_id
        where result.tournament_id = $1 and participant.user_id = $2
          and result.tournament_day = 2`,
      [tournament.id, PLAYER_IDS[1]],
    );
    expect(incomplete.rows[0]).toEqual({
      completed: false,
      goals: 0,
      shots: 0,
      accuracy: 0,
      place: null,
      place_points: 0,
    });
    const dailyStandings = await pool.query<{
      user_id: string;
      rank: number;
      points: number;
      metrics: { metric: string; countedDays: number[] };
    }>(
      `select participant.user_id, standing.rank, standing.points::float8 as points,
              standing.metrics
         from tournament_standing standing
         join tournament_participant participant on participant.id = standing.participant_id
        where standing.tournament_id = $1 order by standing.rank`,
      [tournament.id],
    );
    expect(dailyStandings.rows).toEqual([
      {
        user_id: PLAYER_IDS[1],
        rank: 1,
        points: 0.6,
        metrics: { metric: 'accuracy_average', countedDays: [3, 1] },
      },
      {
        user_id: PLAYER_IDS[0],
        rank: 2,
        points: 0.55,
        metrics: { metric: 'accuracy_average', countedDays: [2, 3] },
      },
      {
        user_id: PLAYER_IDS[2],
        rank: 3,
        points: 0.45,
        metrics: { metric: 'accuracy_average', countedDays: [2, 1] },
      },
      {
        user_id: PLAYER_IDS[3],
        rank: 4,
        points: 0.4,
        metrics: { metric: 'accuracy_average', countedDays: [1, 3] },
      },
    ]);
    const standingsBeforePlayoffs = JSON.stringify(dailyStandings.rows);
    const expectedStandingUserIds = dailyStandings.rows.map((row) => row.user_id);

    expect(await grantTournamentStageRewards(pool, tournament.id, 'regular')).toMatchObject({
      granted: 4,
    });
    expect(await grantTournamentStageRewards(pool, tournament.id, 'regular')).toMatchObject({
      granted: 0,
    });
    await startAndCompletePlayoffs(pool, {
      tournamentId: tournament.id,
      tournamentTitle: title,
      startsAt: new Date('2032-06-04T08:00:00.000Z'),
      expectedFinalUserIds: [PLAYER_IDS[2], PLAYER_IDS[3], PLAYER_IDS[0], PLAYER_IDS[1]],
    });
    const standingsAfterPlayoffs = await pool.query<{
      user_id: string;
      rank: number;
      points: number;
      metrics: { metric: string; countedDays: number[] };
    }>(
      `select participant.user_id, standing.rank, standing.points::float8 as points,
              standing.metrics
         from tournament_standing standing
         join tournament_participant participant on participant.id = standing.participant_id
        where standing.tournament_id = $1 order by standing.rank`,
      [tournament.id],
    );
    expect(JSON.stringify(standingsAfterPlayoffs.rows)).toBe(standingsBeforePlayoffs);

    expect(await grantTournamentStageRewards(pool, tournament.id, 'playoff')).toMatchObject({
      granted: 4,
    });
    expect(await grantTournamentStageRewards(pool, tournament.id, 'playoff')).toMatchObject({
      granted: 0,
    });
    await enqueueAudienceLifecyclePush(pool, {
      tournamentId: tournament.id,
      eventType: 'tournament.completed',
      eventKey: `${tournament.id}:completed`,
      tournamentTitle: title,
    });
    await assertTerminalInvariants(pool, {
      tournamentId: tournament.id,
      expectedStandingUserIds,
      expectedResultPushes: 8,
      expectedStageRewards: [
        {
          user_id: PLAYER_IDS[2],
          stage: 'playoff',
          place: 1,
          coins: 100,
          stars: 10,
          experience: 1_000,
        },
        {
          user_id: PLAYER_IDS[3],
          stage: 'playoff',
          place: 2,
          coins: 70,
          stars: 7,
          experience: 700,
        },
        {
          user_id: PLAYER_IDS[0],
          stage: 'playoff',
          place: 3,
          coins: 40,
          stars: 4,
          experience: 400,
        },
        {
          user_id: PLAYER_IDS[1],
          stage: 'playoff',
          place: 4,
          coins: 20,
          stars: 2,
          experience: 200,
        },
        {
          user_id: PLAYER_IDS[1],
          stage: 'regular',
          place: 1,
          coins: 40,
          stars: 4,
          experience: 400,
        },
        {
          user_id: PLAYER_IDS[0],
          stage: 'regular',
          place: 2,
          coins: 30,
          stars: 3,
          experience: 300,
        },
        {
          user_id: PLAYER_IDS[2],
          stage: 'regular',
          place: 3,
          coins: 20,
          stars: 2,
          experience: 200,
        },
        {
          user_id: PLAYER_IDS[3],
          stage: 'regular',
          place: 4,
          coins: 10,
          stars: 1,
          experience: 100,
        },
      ],
      expectedBalances: [
        { user_id: PLAYER_IDS[0], balance: 165, stars: 7, experience: 1_700 },
        { user_id: PLAYER_IDS[1], balance: 155, stars: 6, experience: 1_600 },
        { user_id: PLAYER_IDS[2], balance: 215, stars: 12, experience: 2_200 },
        { user_id: PLAYER_IDS[3], balance: 175, stars: 8, experience: 1_800 },
      ],
    });
  });
});
