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
import { reconcileTournamentLifecycle } from '../../src/tournament/automaticLifecycle.js';
import {
  finalizeDueClassicTournamentDays,
  startClassicGamePeriod,
  submitClassicGameShot,
} from '../../src/tournament/classicGame.js';
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
const AUTOMATIC_REGISTRATION_OPENS_AT = new Date('2032-05-30T00:00:00.000Z');
const AUTOMATIC_REGISTRATION_CLOSES_AT = new Date('2032-05-31T00:00:00.000Z');
const AUTOMATIC_STARTS_AT = new Date('2032-06-01T12:00:00.000Z');
const AUTOMATIC_PLAYOFF_STARTS_AT = new Date('2032-06-04T13:00:00.000Z');
const CLASSIC_SEED_SECRET = 'synthetic-classic-seed-at-least-16';

type RegularSource = 'head_to_head' | 'daily_aggregate' | 'classic';

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
  regularSource: RegularSource,
  duelTemplateId: string,
  options: { automatic?: boolean; playoffStartsAt?: Date } = {},
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
          ...(regularSource === 'classic'
            ? {
                classicRules: {
                  goalieId: 'rookie',
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
    ...(options.automatic ? { automaticLifecycleVersion: 1 } : {}),
    ...(options.automatic && regularSource === 'head_to_head' ? { duelLifecycleVersion: 2 } : {}),
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
        ...(options.playoffStartsAt
          ? { firstGameStartsAt: options.playoffStartsAt.toISOString() }
          : {}),
      },
      {
        roundNumber: 2,
        winsRequired: 1,
        homeSequence: ['H'],
        duelTemplateId,
        gameWindowMs: 3_600_000,
        gameBreakMs: 0,
        roundBreakMs: 0,
        ...(options.playoffStartsAt
          ? {
              firstGameStartsAt: new Date(
                options.playoffStartsAt.getTime() + 86_400_000,
              ).toISOString(),
            }
          : {}),
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
  await pool.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
     values ($1, $2, 'synthetic-p256dh', 'synthetic-auth')`,
    [ADMIN_ID, `https://push.synthetic.test/${ADMIN_ID}`],
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
    registrationOpensAt?: Date;
    registrationClosesAt?: Date;
    playoffStartsAt?: Date;
    approvedCount?: number;
    automatic?: boolean;
    regularSource: RegularSource;
    duelTemplateId: string;
  },
): Promise<{ id: string; revision: number }> {
  const tournament = await createTournamentDraft(pool, {
    slug: input.slug,
    title: input.title,
    description: 'Deterministic synthetic acceptance season',
    rules: tournamentRules(input.regularSource, input.duelTemplateId, {
      automatic: input.automatic,
      playoffStartsAt: input.playoffStartsAt,
    }),
    createdBy: ADMIN_ID,
    registrationOpensAt: input.registrationOpensAt ?? new Date('2020-01-01T00:00:00.000Z'),
    registrationClosesAt:
      input.registrationClosesAt ?? new Date(input.startsAt.getTime() - 86_400_000),
    startsAt: input.startsAt,
  });
  await publishTournament(pool, tournament.id, tournament.revision, ADMIN_ID);
  const approvedPlayerIds = PLAYER_IDS.slice(0, input.approvedCount ?? PLAYER_IDS.length);
  if (input.registrationOpensAt !== undefined) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(input.registrationOpensAt.getTime() + 1));
  }
  try {
    for (const playerId of approvedPlayerIds) {
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
  } finally {
    if (input.registrationOpensAt !== undefined) vi.useRealTimers();
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
    approvedPlayerIds.map(() => ({
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

async function tournamentStatus(pool: Pool, tournamentId: string): Promise<string> {
  const status = await pool.query<{ status: string }>(
    `select status from tournament where id = $1`,
    [tournamentId],
  );
  return status.rows[0]!.status;
}

async function settleAutomaticRegularSeason(
  pool: Pool,
  tournamentId: string,
  regularSource: RegularSource,
): Promise<void> {
  if (regularSource === 'daily_aggregate') {
    await seedDailySourceRows(pool);
    expect(await finalizeDueTournamentDailyDays(pool, AUTOMATIC_PLAYOFF_STARTS_AT)).toEqual({
      finalizedDays: 3,
      finalizedParticipants: 12,
    });
    await assertFinalAggregateResults(pool, tournamentId, {
      completed: 11,
      played: 11,
      source: 'daily_aggregate',
    });
    return;
  }
  if (regularSource === 'classic') {
    await playCompletedClassicOpeningDay(pool, tournamentId);
    expect(
      await finalizeDueClassicTournamentDays(pool, {
        now: AUTOMATIC_PLAYOFF_STARTS_AT,
        seedSecret: CLASSIC_SEED_SECRET,
      }),
    ).toEqual({ finalizedDays: 2, finalizedParticipants: 8 });
    await assertFinalAggregateResults(pool, tournamentId, {
      completed: 4,
      played: 4,
      source: 'classic',
    });
    return;
  }
  const fixtures = await pool.query<FixtureRow>(
    `select fixture.id, fixture.home_participant_id, fixture.away_participant_id,
            home.user_id as home_user_id, away.user_id as away_user_id,
            fixture.scheduled_starts_at
       from tournament_fixture fixture
       join tournament_round round on round.id = fixture.round_id and round.stage = 'regular'
       join tournament_participant home on home.id = fixture.home_participant_id
       join tournament_participant away on away.id = fixture.away_participant_id
      where fixture.tournament_id = $1 order by fixture.fixture_number`,
    [tournamentId],
  );
  expect(fixtures.rows).toHaveLength(6);
  for (const fixture of fixtures.rows) {
    await settleFixtureTechnically(
      pool,
      tournamentId,
      fixture,
      desiredRegularWinner(fixture.home_user_id, fixture.away_user_id),
    );
  }
}

async function playCompletedClassicOpeningDay(pool: Pool, tournamentId: string): Promise<void> {
  const matchday = await pool.query<{ starts_at: Date }>(
    `select starts_at from tournament_matchday
      where tournament_id = $1 and number = 1`,
    [tournamentId],
  );
  const startsAt = matchday.rows[0]!.starts_at;
  for (const userId of PLAYER_IDS) {
    let now = startsAt;
    for (let period = 1; period <= 3; period += 1) {
      const started = await startClassicGamePeriod(pool, {
        userId,
        tournamentId,
        now,
        seedSecret: CLASSIC_SEED_SECRET,
      });
      expect(started.current_period).toBe(period);
      const submitted = await submitClassicGameShot(pool, {
        userId,
        tournamentId,
        now,
        seedSecret: CLASSIC_SEED_SECRET,
        shotIndex: 1,
        input: { tapTime: 0 },
        claimedResult: 'miss',
      });
      expect(submitted.state.current_period).toBe(period);
      now = new Date(now.getTime() + 1);
    }
  }
}

async function assertFinalAggregateResults(
  pool: Pool,
  tournamentId: string,
  expected: { completed: number; played: number; source: 'daily_aggregate' | 'classic' },
): Promise<void> {
  const result = await pool.query<{
    total: number;
    finalized: number;
    completed: number;
    distinct_days: number;
  }>(
    `select count(*)::int as total,
            count(*) filter (where finalized_at is not null)::int as finalized,
            count(*) filter (where completed)::int as completed,
            count(distinct tournament_day)::int as distinct_days
       from tournament_daily_result where tournament_id = $1`,
    [tournamentId],
  );
  expect(result.rows[0], `${expected.source} finalized results`).toEqual({
    total: 12,
    finalized: 12,
    completed: expected.completed,
    distinct_days: 3,
  });
  const standings = await pool.query<{
    standings: number;
    played: number;
    source_versions: number[];
  }>(
    `select count(*)::int as standings,
            coalesce(sum(played), 0)::int as played,
            array_agg(distinct source_version::int order by source_version::int) as source_versions
       from tournament_standing where tournament_id = $1`,
    [tournamentId],
  );
  expect(standings.rows[0], `${expected.source} standings use final results`).toEqual({
    standings: 4,
    played: expected.played,
    source_versions: [12],
  });
}

async function assertPlayoffSeedsUseStandings(pool: Pool, tournamentId: string): Promise<void> {
  const seeded = await pool.query<{ matched: number }>(
    `select count(*)::int as matched
       from tournament_playoff_series series
       join tournament_round round on round.id = series.round_id and round.number = 1
       join tournament_standing higher
         on higher.tournament_id = series.tournament_id
        and higher.participant_id = series.higher_seed_participant_id
       join tournament_standing lower
         on lower.tournament_id = series.tournament_id
        and lower.participant_id = series.lower_seed_participant_id
      where series.tournament_id = $1
        and ((series.depends_on->>'key' = 'R1S1' and higher.rank = 1 and lower.rank = 4)
          or (series.depends_on->>'key' = 'R1S2' and higher.rank = 2 and lower.rank = 3))`,
    [tournamentId],
  );
  expect(seeded.rows[0]).toEqual({ matched: 2 });
}

async function settleEveryAutomaticPlayoffSeries(pool: Pool, tournamentId: string): Promise<void> {
  let realDuelMatchId: string | null = null;
  for (let completedSeries = 0; completedSeries < 4; completedSeries += 1) {
    const next = await pool.query<FixtureRow>(
      `select fixture.id, fixture.home_participant_id, fixture.away_participant_id,
              home.user_id as home_user_id, away.user_id as away_user_id,
              fixture.scheduled_starts_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_participant home on home.id = fixture.home_participant_id
         join tournament_participant away on away.id = fixture.away_participant_id
        where fixture.tournament_id = $1 and fixture.series_id is not null
          and fixture.status = 'scheduled'
        order by fixture.fixture_number limit 1`,
      [tournamentId],
    );
    const fixture = next.rows[0];
    expect(fixture, `scheduled playoff fixture ${completedSeries + 1}`).toBeDefined();
    if (completedSeries === 0) {
      realDuelMatchId = await settleRealTournamentDuel(
        pool,
        tournamentId,
        fixture!,
        fixture!.home_user_id,
      );
    } else {
      await settleFixtureTechnically(pool, tournamentId, fixture!, fixture!.home_user_id);
    }
  }
  expect(realDuelMatchId).not.toBeNull();
  const backingDuel = await pool.query<{
    source: string;
    duel_status: string;
    segment_fixture_id: string;
    segment_status: string;
    fixture_status: string;
    has_series: boolean;
  }>(
    `select duel.source, duel.status as duel_status,
            segment.fixture_id as segment_fixture_id, segment.status as segment_status,
            fixture.status as fixture_status,
            fixture.series_id is not null as has_series
       from amateur_duel_match duel
       join tournament_fixture_segment segment on segment.duel_match_id = duel.id
       join tournament_fixture fixture on fixture.id = segment.fixture_id
      where duel.id = $1`,
    [realDuelMatchId],
  );
  expect(backingDuel.rows[0]).toEqual({
    source: 'tournament',
    duel_status: 'settled',
    segment_fixture_id: expect.any(String),
    segment_status: 'settled',
    fixture_status: 'settled',
    has_series: true,
  });
  expect(await tournamentStatus(pool, tournamentId)).toBe('completed');
}

const TOURNAMENT_NOTIFICATION_TYPES = [
  'tournament.application_approved',
  'tournament.completed',
  'tournament.opponent_ready',
  'tournament.playoff_blocked',
  'tournament.playoff_schedule_missing',
  'tournament.playoff_started',
  'tournament.registration_blocked',
  'tournament.result_ready',
  'tournament.schedule_published',
  'tournament.series_next_game',
] as const;

type TournamentNotificationType = (typeof TOURNAMENT_NOTIFICATION_TYPES)[number];

interface AutomaticLifecycleCounts {
  matchdays: number;
  rounds: number;
  fixtures: number;
  series: number;
  entryFees: number;
  regularRewards: number;
  playoffRewards: number;
  notifications: Record<TournamentNotificationType, number>;
}

function expectedAutomaticNotifications(
  overrides: Partial<Record<TournamentNotificationType, number>> = {},
): Record<TournamentNotificationType, number> {
  return {
    'tournament.application_approved': 4,
    'tournament.completed': 0,
    'tournament.opponent_ready': 0,
    'tournament.playoff_blocked': 0,
    'tournament.playoff_schedule_missing': 0,
    'tournament.playoff_started': 0,
    'tournament.registration_blocked': 0,
    'tournament.result_ready': 0,
    'tournament.schedule_published': 0,
    'tournament.series_next_game': 0,
    ...overrides,
  };
}

async function automaticLifecycleCounts(
  pool: Pool,
  tournamentId: string,
): Promise<AutomaticLifecycleCounts> {
  const counts = await pool.query<{
    matchdays: number;
    rounds: number;
    fixtures: number;
    series: number;
    entry_fees: number;
    regular_rewards: number;
    playoff_rewards: number;
  }>(
    `select
       (select count(*)::int from tournament_matchday where tournament_id = $1) as matchdays,
       (select count(*)::int from tournament_round where tournament_id = $1) as rounds,
       (select count(*)::int from tournament_fixture where tournament_id = $1) as fixtures,
       (select count(*)::int from tournament_playoff_series where tournament_id = $1) as series,
       (select count(*)::int from tournament_economy_event
         where tournament_id = $1 and kind = 'entry_fee' and status = 'applied') as entry_fees,
       (select count(*)::int from tournament_economy_event
         where tournament_id = $1 and kind = 'stage_reward' and status = 'applied'
           and metadata->>'stage' = 'regular') as regular_rewards,
       (select count(*)::int from tournament_economy_event
         where tournament_id = $1 and kind = 'stage_reward' and status = 'applied'
           and metadata->>'stage' = 'playoff') as playoff_rewards`,
    [tournamentId],
  );
  const deliveryCounts = await pool.query<{
    event_type: TournamentNotificationType;
    count: number;
  }>(
    `select event_type, count(*)::int as count from push_delivery_log
      where event_type = any($1::text[])
        and (
          event_key like $2
          or exists (
            select 1 from tournament_fixture fixture
              where fixture.tournament_id = $3
                and push_delivery_log.event_key like fixture.id::text || ':%'
          )
          or exists (
            select 1 from tournament_fixture_segment segment
              join tournament_fixture fixture on fixture.id = segment.fixture_id
              where fixture.tournament_id = $3
                and push_delivery_log.event_key like segment.duel_match_id::text || ':%'
          )
        )
      group by event_type`,
    [TOURNAMENT_NOTIFICATION_TYPES, `${tournamentId}:%`, tournamentId],
  );
  const notifications = Object.fromEntries(
    TOURNAMENT_NOTIFICATION_TYPES.map((eventType) => [eventType, 0]),
  ) as Record<TournamentNotificationType, number>;
  for (const delivery of deliveryCounts.rows) notifications[delivery.event_type] = delivery.count;
  const row = counts.rows[0]!;
  return {
    matchdays: row.matchdays,
    rounds: row.rounds,
    fixtures: row.fixtures,
    series: row.series,
    entryFees: row.entry_fees,
    regularRewards: row.regular_rewards,
    playoffRewards: row.playoff_rewards,
    notifications,
  };
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

  it.each(['head_to_head', 'daily_aggregate', 'classic'] as const)(
    'runs the automatic lifecycle for %s through tournament completion',
    async (regularSource) => {
      await seedUsersAndPush(pool);
      const duelTemplateId = await configureRewardingDuelTemplate(pool);
      const title = `Synthetic Automatic ${regularSource}`;
      const tournament = await createRegisteredTournament(pool, {
        slug: `synthetic-automatic-${regularSource.replaceAll('_', '-')}`,
        title,
        startsAt: AUTOMATIC_STARTS_AT,
        registrationOpensAt: AUTOMATIC_REGISTRATION_OPENS_AT,
        registrationClosesAt: AUTOMATIC_REGISTRATION_CLOSES_AT,
        playoffStartsAt: AUTOMATIC_PLAYOFF_STARTS_AT,
        automatic: true,
        regularSource,
        duelTemplateId,
      });

      const beforeOpening = await reconcileTournamentLifecycle(pool, {
        now: new Date(AUTOMATIC_REGISTRATION_OPENS_AT.getTime() - 1),
        tournamentId: tournament.id,
        classicSeedSecret: CLASSIC_SEED_SECRET,
      });
      expect(beforeOpening.items[0]).toMatchObject({
        action: 'registration_waiting',
        after: 'registration',
        changed: false,
      });
      const registrationOpen = await reconcileTournamentLifecycle(pool, {
        now: AUTOMATIC_REGISTRATION_OPENS_AT,
        tournamentId: tournament.id,
        classicSeedSecret: CLASSIC_SEED_SECRET,
      });
      expect(registrationOpen.items[0]).toMatchObject({
        action: 'registration_open',
        after: 'registration',
        changed: false,
      });

      const registrationClosed = await reconcileTournamentLifecycle(pool, {
        now: AUTOMATIC_REGISTRATION_CLOSES_AT,
        tournamentId: tournament.id,
        classicSeedSecret: CLASSIC_SEED_SECRET,
      });
      expect(registrationClosed.items[0]).toMatchObject({
        action: 'generate_schedule',
        after: 'scheduling',
        changed: true,
      });
      expect(await tournamentStatus(pool, tournament.id)).toBe('scheduling');
      const schedulingCounts: AutomaticLifecycleCounts = {
        matchdays: regularSource === 'head_to_head' ? 1 : 3,
        rounds: regularSource === 'head_to_head' ? 3 : 0,
        fixtures: regularSource === 'head_to_head' ? 6 : 0,
        series: 0,
        entryFees: 4,
        regularRewards: 0,
        playoffRewards: 0,
        notifications: expectedAutomaticNotifications(),
      };
      expect(await automaticLifecycleCounts(pool, tournament.id)).toEqual(schedulingCounts);
      const repeatedClose = await reconcileTournamentLifecycle(pool, {
        now: AUTOMATIC_REGISTRATION_CLOSES_AT,
        tournamentId: tournament.id,
        classicSeedSecret: CLASSIC_SEED_SECRET,
      });
      expect(repeatedClose.items[0]).toMatchObject({
        action: 'await_manual_regular_start',
        after: 'scheduling',
        changed: false,
      });
      expect(await automaticLifecycleCounts(pool, tournament.id)).toEqual(schedulingCounts);

      const startsAtWhileScheduling = await reconcileTournamentLifecycle(pool, {
        now: AUTOMATIC_STARTS_AT,
        tournamentId: tournament.id,
        classicSeedSecret: CLASSIC_SEED_SECRET,
      });
      expect(startsAtWhileScheduling.items[0]).toMatchObject({
        action: 'await_manual_regular_start',
        after: 'scheduling',
        changed: false,
      });
      expect(await tournamentStatus(pool, tournament.id)).toBe('scheduling');
      expect(await automaticLifecycleCounts(pool, tournament.id)).toEqual(schedulingCounts);

      await publishRegularSchedule(pool, tournament.id);
      expect(await tournamentStatus(pool, tournament.id)).toBe('regular');
      expect(await automaticLifecycleCounts(pool, tournament.id)).toEqual({
        ...schedulingCounts,
        notifications: expectedAutomaticNotifications({
          'tournament.schedule_published': 4,
        }),
      });
      await settleAutomaticRegularSeason(pool, tournament.id, regularSource);
      const playoff = await reconcileTournamentLifecycle(pool, {
        now: AUTOMATIC_PLAYOFF_STARTS_AT,
        tournamentId: tournament.id,
        classicSeedSecret: CLASSIC_SEED_SECRET,
      });
      expect(playoff.items[0]).toMatchObject({
        action: 'start_playoff',
        after: 'playoff',
        changed: true,
      });
      expect(await tournamentStatus(pool, tournament.id)).toBe('playoff');
      await assertPlayoffSeedsUseStandings(pool, tournament.id);
      const playoffCounts: AutomaticLifecycleCounts = {
        matchdays: regularSource === 'head_to_head' ? 1 : 3,
        rounds: regularSource === 'head_to_head' ? 6 : 3,
        fixtures: regularSource === 'head_to_head' ? 10 : 4,
        series: 4,
        entryFees: 4,
        regularRewards: 4,
        playoffRewards: 0,
        notifications: expectedAutomaticNotifications({
          'tournament.playoff_started': 4,
          'tournament.result_ready': regularSource === 'head_to_head' ? 12 : 0,
          'tournament.schedule_published': 4,
        }),
      };
      expect(await automaticLifecycleCounts(pool, tournament.id)).toEqual(playoffCounts);
      const repeatedPlayoff = await reconcileTournamentLifecycle(pool, {
        now: new Date(AUTOMATIC_PLAYOFF_STARTS_AT.getTime() + 1),
        tournamentId: tournament.id,
        classicSeedSecret: CLASSIC_SEED_SECRET,
      });
      expect(repeatedPlayoff.items[0]).toMatchObject({
        action: 'playoff_active',
        after: 'playoff',
        changed: false,
      });
      expect(await automaticLifecycleCounts(pool, tournament.id)).toEqual(playoffCounts);

      await settleEveryAutomaticPlayoffSeries(pool, tournament.id);
      const terminalCounts: AutomaticLifecycleCounts = {
        ...playoffCounts,
        playoffRewards: 4,
        notifications: expectedAutomaticNotifications({
          'tournament.completed': 4,
          'tournament.playoff_started': 4,
          'tournament.result_ready': regularSource === 'head_to_head' ? 20 : 8,
          'tournament.schedule_published': 4,
          'tournament.series_next_game': 4,
        }),
      };
      expect(await automaticLifecycleCounts(pool, tournament.id)).toEqual(terminalCounts);
      const terminalRetry = await reconcileTournamentLifecycle(pool, {
        now: new Date(AUTOMATIC_PLAYOFF_STARTS_AT.getTime() + 172_800_000),
        tournamentId: tournament.id,
        classicSeedSecret: CLASSIC_SEED_SECRET,
      });
      expect(terminalRetry.items[0]).toMatchObject({
        action: 'terminal',
        after: 'completed',
        changed: false,
      });
      expect(await automaticLifecycleCounts(pool, tournament.id)).toEqual(terminalCounts);
    },
  );

  it.each(['head_to_head', 'daily_aggregate', 'classic'] as const)(
    'blocks automatic %s scheduling without shrinking playoffs or duplicating admin notice',
    async (regularSource) => {
      await seedUsersAndPush(pool);
      const duelTemplateId = await configureRewardingDuelTemplate(pool);
      const tournament = await createRegisteredTournament(pool, {
        slug: `synthetic-insufficient-${regularSource.replaceAll('_', '-')}`,
        title: `Synthetic Insufficient ${regularSource}`,
        startsAt: AUTOMATIC_STARTS_AT,
        registrationOpensAt: AUTOMATIC_REGISTRATION_OPENS_AT,
        registrationClosesAt: AUTOMATIC_REGISTRATION_CLOSES_AT,
        playoffStartsAt: AUTOMATIC_PLAYOFF_STARTS_AT,
        approvedCount: 3,
        automatic: true,
        regularSource,
        duelTemplateId,
      });

      await reconcileTournamentLifecycle(pool, {
        now: AUTOMATIC_REGISTRATION_CLOSES_AT,
        tournamentId: tournament.id,
        classicSeedSecret: CLASSIC_SEED_SECRET,
      });
      const blockedCounts: AutomaticLifecycleCounts = {
        matchdays: 0,
        rounds: 0,
        fixtures: 0,
        series: 0,
        entryFees: 3,
        regularRewards: 0,
        playoffRewards: 0,
        notifications: expectedAutomaticNotifications({
          'tournament.application_approved': 3,
          'tournament.registration_blocked': 1,
        }),
      };
      expect(await automaticLifecycleCounts(pool, tournament.id)).toEqual(blockedCounts);
      await reconcileTournamentLifecycle(pool, {
        now: new Date(AUTOMATIC_REGISTRATION_CLOSES_AT.getTime() + 1),
        tournamentId: tournament.id,
        classicSeedSecret: CLASSIC_SEED_SECRET,
      });
      expect(await automaticLifecycleCounts(pool, tournament.id)).toEqual(blockedCounts);

      const blocked = await pool.query<{
        status: string;
        playoff_size: number;
      }>(
        `select tournament.status,
                (revision.rules_snapshot->'config'->>'playoffSize')::int as playoff_size
           from tournament
           join tournament_revision revision on revision.id = tournament.published_revision_id
          where tournament.id = $1`,
        [tournament.id],
      );
      expect(blocked.rows[0]).toEqual({
        status: 'registration_blocked',
        playoff_size: 4,
      });
    },
  );

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

    await startAndCompletePlayoffs(pool, {
      tournamentId: tournament.id,
      tournamentTitle: title,
      startsAt: new Date('2032-05-02T11:00:00.000Z'),
      expectedFinalUserIds: [PLAYER_IDS[2], PLAYER_IDS[3], PLAYER_IDS[1], PLAYER_IDS[0]],
    });
    expect(await grantTournamentStageRewards(pool, tournament.id, 'regular')).toMatchObject({
      granted: 0,
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

    expect(await grantTournamentStageRewards(pool, tournament.id, 'regular')).toMatchObject({
      granted: 0,
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
