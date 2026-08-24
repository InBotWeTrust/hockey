import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { createTournamentDuelMatch } from '../../src/duel/amateur/routes.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import { openTournamentFixtureSegment } from '../../src/tournament/fixtureLifecycle.js';
import {
  applyToTournament,
  createTournamentDraft,
  generateRegularSchedule,
  publishRegularSchedule,
  publishTournament,
  type TournamentRulesSnapshot,
} from '../../src/tournament/service.js';
import {
  createTestPool,
  createTestRedis,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';
const ADMIN_ID = '00000000-0000-4000-8000-000000000701';
const PLAYER_A_ID = '00000000-0000-4000-8000-000000000711';
const PLAYER_B_ID = '00000000-0000-4000-8000-000000000712';

interface PublishedEvent {
  channel: string;
  event: {
    type: string;
    fixtureId: string;
    sequence: number;
    payload: Record<string, unknown>;
  };
}

interface FixtureDuel {
  fixtureId: string;
  duelMatchId: string;
  homeUserId: string;
  awayUserId: string;
}

function tournamentRules(templateId: string): TournamentRulesSnapshot {
  return {
    config: parseTournamentConfig({
      regularSource: 'head_to_head',
      participantLimit: 2,
      playoffSize: 2,
      timezone: 'Europe/Moscow',
      registrationMode: 'open',
      visibility: 'public',
      entryFeeCoins: 0,
      roundRobinCycles: 1,
      roundsPerDay: 1,
      firstRoundLocalTime: '10:00',
      fixtureWindowMs: 3_600_000,
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
    regularDuelTemplateId: templateId,
  };
}

function liveFrom(event: PublishedEvent): {
  status: string;
  score: { home: number; away: number };
  duelMatchId: string | null;
  participants: Array<{
    userId: string;
    state: string;
    currentPeriod: number;
    goals: number;
    shotsTaken: number;
  }>;
} {
  return event.event.payload.live as {
    status: string;
    score: { home: number; away: number };
    duelMatchId: string | null;
    participants: Array<{
      userId: string;
      state: string;
      currentPeriod: number;
      goals: number;
      shotsTaken: number;
    }>;
  };
}

describe.skipIf(!hasIntegrationEnv)('tournament duel realtime progress', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let homeToken: string;
  let awayToken: string;

  beforeAll(async () => {
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await (await import('../../src/db/migrations.js')).applyMigrations(initPool, MIGRATIONS_DIR);
    await initPool.end();
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();

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
    pool = app.pg;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await pool.query('truncate users restart identity cascade');
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'false'::jsonb, 'Турниры включены', 'Тестовый feature toggle')
       on conflict (key) do update set value = excluded.value`,
    );
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();
    await pool.query(
      `insert into users (id, display_name, timezone, role, level, lifetime_goals_total, experience)
       values
         ($1, 'Tournament Admin', 'Europe/Moscow', 'admin', 10, 1000, 1000),
         ($2, 'Home Player', 'Europe/Moscow', 'player', 5, 500, 500),
         ($3, 'Away Player', 'Europe/Moscow', 'player', 5, 500, 500)`,
      [ADMIN_ID, PLAYER_A_ID, PLAYER_B_ID],
    );
    await pool.query(
      `insert into user_currency_account (user_id, balance)
       values ($1, 100), ($2, 100)`,
      [PLAYER_A_ID, PLAYER_B_ID],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    homeToken = await jwt.issueAccessToken({ sub: PLAYER_A_ID });
    awayToken = await jwt.issueAccessToken({ sub: PLAYER_B_ID });
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function recordPublisher(onPublish?: (event: PublishedEvent['event']) => Promise<void> | void) {
    const events: PublishedEvent[] = [];
    vi.spyOn(app.realtime, 'publish').mockImplementation(async (channel, event) => {
      const entry = {
        channel,
        event: event as PublishedEvent['event'],
      };
      events.push(entry);
      await onPublish?.(entry.event);
    });
    return events;
  }

  function latestFixtureUpdate(events: PublishedEvent[], fixtureId: string): PublishedEvent {
    const event = events
      .filter(
        (entry) =>
          entry.channel === `tournament:fixture:${fixtureId}` &&
          entry.event.type === 'tournament:fixture_update',
      )
      .at(-1);
    expect(event).toBeDefined();
    return event!;
  }

  async function createFixtureDuel(): Promise<FixtureDuel> {
    const template = await pool.query<{ id: string }>(
      `select id from amateur_duel_template
        where duel_kind = 'classic' and is_active and deleted_at is null
        limit 1`,
    );
    const tournament = await createTournamentDraft(pool, {
      slug: `realtime-progress-${crypto.randomUUID()}`,
      title: 'Realtime Progress Cup',
      description: '',
      rules: tournamentRules(template.rows[0]!.id),
      createdBy: ADMIN_ID,
      registrationOpensAt: null,
      registrationClosesAt: null,
      startsAt: new Date('2030-09-01T07:00:00.000Z'),
    });
    await publishTournament(pool, tournament.id, tournament.revision, ADMIN_ID);
    await applyToTournament(pool, tournament.id, PLAYER_A_ID);
    await applyToTournament(pool, tournament.id, PLAYER_B_ID);
    await generateRegularSchedule(pool, tournament.id, tournament.revision);
    await publishRegularSchedule(pool, tournament.id);
    const fixture = await pool.query<{
      fixture_id: string;
      home_user_id: string;
      away_user_id: string;
      scheduled_starts_at: Date;
    }>(
      `select f.id as fixture_id, home.user_id as home_user_id, away.user_id as away_user_id,
              f.scheduled_starts_at
         from tournament_fixture f
         join tournament_participant home on home.id = f.home_participant_id
         join tournament_participant away on away.id = f.away_participant_id
        where f.tournament_id = $1
        order by f.fixture_number
        limit 1`,
      [tournament.id],
    );
    const opened = await openTournamentFixtureSegment(
      pool,
      {
        tournamentId: tournament.id,
        fixtureId: fixture.rows[0]!.fixture_id,
        userId: fixture.rows[0]!.home_user_id,
        now: fixture.rows[0]!.scheduled_starts_at,
      },
      createTournamentDuelMatch,
    );
    await pool.query(
      `update amateur_duel_match
          set starts_at = now() - interval '1 minute', ends_at = now() + interval '1 hour'
        where id = $1`,
      [opened.duelMatchId],
    );
    return {
      fixtureId: fixture.rows[0]!.fixture_id,
      duelMatchId: opened.duelMatchId,
      homeUserId: fixture.rows[0]!.home_user_id,
      awayUserId: fixture.rows[0]!.away_user_id,
    };
  }

  function tokenFor(userId: string): string {
    if (userId === PLAYER_A_ID) return homeToken;
    if (userId === PLAYER_B_ID) return awayToken;
    throw new Error(`unexpected tournament user ${userId}`);
  }

  async function readyBoth(duel: FixtureDuel): Promise<void> {
    const home = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/ready`,
      headers: auth(tokenFor(duel.homeUserId)),
      payload: { loadout: {} },
    });
    expect(home.statusCode).toBe(200);
    const away = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/ready`,
      headers: auth(tokenFor(duel.awayUserId)),
      payload: { loadout: {} },
    });
    expect(away.statusCode).toBe(200);
  }

  it('publishes canonical tournament readiness, period, and shot progress after the route commits', async () => {
    const duel = await createFixtureDuel();
    const readyStatesVisibleAtPublish: string[] = [];
    const events = recordPublisher(async () => {
      const persisted = await pool.query<{ state: string }>(
        `select state from amateur_duel_participant where match_id = $1 and user_id = $2`,
        [duel.duelMatchId, duel.homeUserId],
      );
      readyStatesVisibleAtPublish.push(persisted.rows[0]!.state);
    });

    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/ready`,
      headers: auth(tokenFor(duel.homeUserId)),
      payload: { loadout: {} },
    });
    expect(ready.statusCode).toBe(200);
    expect(liveFrom(latestFixtureUpdate(events, duel.fixtureId)).participants).toContainEqual(
      expect.objectContaining({ userId: duel.homeUserId, state: 'ready', currentPeriod: 0 }),
    );
    expect(readyStatesVisibleAtPublish).toEqual(['ready']);

    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/ready`,
      headers: auth(tokenFor(duel.awayUserId)),
      payload: { loadout: {} },
    });
    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/period/start`,
      headers: auth(tokenFor(duel.homeUserId)),
    });
    expect(started.statusCode).toBe(200);
    expect(liveFrom(latestFixtureUpdate(events, duel.fixtureId)).participants).toContainEqual(
      expect.objectContaining({
        userId: duel.homeUserId,
        state: 'period_active',
        currentPeriod: 1,
        shotsTaken: 0,
      }),
    );

    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/shot`,
      headers: auth(tokenFor(duel.homeUserId)),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(shot.statusCode).toBe(200);
    const persisted = await pool.query<{ goals: number; shots_taken: number }>(
      `select goals, shots_taken from amateur_duel_participant
        where match_id = $1 and user_id = $2`,
      [duel.duelMatchId, duel.homeUserId],
    );
    expect(liveFrom(latestFixtureUpdate(events, duel.fixtureId)).participants).toContainEqual({
      userId: duel.homeUserId,
      state: 'period_active',
      currentPeriod: 1,
      goals: Number(persisted.rows[0]!.goals),
      shotsTaken: Number(persisted.rows[0]!.shots_taken),
    });
  });

  it('does not publish fixture updates for an ordinary amateur duel', async () => {
    const template = await pool.query<{ id: string }>(
      `select id from amateur_duel_template
        where duel_kind = 'classic' and is_active and deleted_at is null
        limit 1`,
    );
    const events = recordPublisher();
    const challenge = await app.inject({
      method: 'POST',
      url: '/duel/amateur/challenge',
      headers: auth(homeToken),
      payload: { template_id: template.rows[0]!.id, opponent_user_id: PLAYER_B_ID },
    });
    expect(challenge.statusCode).toBe(200);
    const accepted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${challenge.json().match.id}/accept`,
      headers: auth(awayToken),
    });
    expect(accepted.statusCode).toBe(200);
    expect(events.filter((event) => event.event.type === 'tournament:fixture_update')).toEqual([]);
  });

  it('publishes a canonical snapshot after a lazy period transition commits', async () => {
    const duel = await createFixtureDuel();
    const events = recordPublisher();
    await readyBoth(duel);
    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/period/start`,
      headers: auth(tokenFor(duel.homeUserId)),
    });
    expect(started.statusCode).toBe(200);
    events.length = 0;
    await pool.query(
      `update amateur_duel_participant
          set period_started_at = now() - interval '2 hours'
        where match_id = $1 and user_id = $2`,
      [duel.duelMatchId, duel.homeUserId],
    );

    const state = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${duel.duelMatchId}`,
      headers: auth(tokenFor(duel.homeUserId)),
    });

    expect(state.statusCode).toBe(200);
    expect(liveFrom(latestFixtureUpdate(events, duel.fixtureId)).participants).toContainEqual(
      expect.objectContaining({
        userId: duel.homeUserId,
        state: expect.not.stringMatching('period_active'),
      }),
    );
  });

  it('publishes a canonical snapshot after the matches list lazily reconciles a tournament duel', async () => {
    const duel = await createFixtureDuel();
    const events = recordPublisher();
    await readyBoth(duel);
    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/period/start`,
      headers: auth(tokenFor(duel.homeUserId)),
    });
    expect(started.statusCode).toBe(200);
    events.length = 0;
    await pool.query(
      `update amateur_duel_participant
          set period_started_at = now() - interval '2 hours'
        where match_id = $1 and user_id = $2`,
      [duel.duelMatchId, duel.homeUserId],
    );

    const matches = await app.inject({
      method: 'GET',
      url: '/duel/amateur/matches',
      headers: auth(tokenFor(duel.homeUserId)),
    });

    expect(matches.statusCode).toBe(200);
    expect(liveFrom(latestFixtureUpdate(events, duel.fixtureId)).participants).toContainEqual(
      expect.objectContaining({
        userId: duel.homeUserId,
        state: expect.not.stringMatching('period_active'),
      }),
    );
  });

  it('publishes a canonical snapshot after the events list lazily reconciles a tournament duel', async () => {
    const duel = await createFixtureDuel();
    const events = recordPublisher();
    await readyBoth(duel);
    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/period/start`,
      headers: auth(tokenFor(duel.homeUserId)),
    });
    expect(started.statusCode).toBe(200);
    events.length = 0;
    await pool.query(
      `update amateur_duel_participant
          set period_started_at = now() - interval '2 hours'
        where match_id = $1 and user_id = $2`,
      [duel.duelMatchId, duel.homeUserId],
    );

    const eventsResponse = await app.inject({
      method: 'GET',
      url: '/duel/amateur/events',
      headers: auth(tokenFor(duel.homeUserId)),
    });

    expect(eventsResponse.statusCode).toBe(200);
    expect(liveFrom(latestFixtureUpdate(events, duel.fixtureId)).participants).toContainEqual(
      expect.objectContaining({
        userId: duel.homeUserId,
        state: expect.not.stringMatching('period_active'),
      }),
    );
  });

  it('does not publish when a tournament match read has no reconciliation transition', async () => {
    const duel = await createFixtureDuel();
    const events = recordPublisher();

    const state = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${duel.duelMatchId}`,
      headers: auth(tokenFor(duel.homeUserId)),
    });

    expect(state.statusCode).toBe(200);
    expect(events).toEqual([]);
  });

  it('publishes a canonical snapshot after opening a pending next fixture segment', async () => {
    const duel = await createFixtureDuel();
    const tournament = await pool.query<{ tournament_id: string }>(
      'select tournament_id from tournament_fixture where id = $1',
      [duel.fixtureId],
    );
    await pool.query(
      `update tournament_fixture
          set scheduled_starts_at = now() - interval '1 minute',
              window_ends_at = now() + interval '1 hour'
        where id = $1`,
      [duel.fixtureId],
    );
    await pool.query(
      `update tournament_fixture_segment
          set status = 'settled', settled_at = now()
        where duel_match_id = $1`,
      [duel.duelMatchId],
    );
    await pool.query(`update amateur_duel_match set status = 'settled' where id = $1`, [
      duel.duelMatchId,
    ]);
    await pool.query(
      `insert into tournament_fixture_segment
         (fixture_id, sequence_number, kind, status, rules_snapshot)
       values ($1, 2, 'overtime', 'pending', '{}'::jsonb)`,
      [duel.fixtureId],
    );
    await pool.query(
      `update game_settings set value = 'true'::jsonb where key = 'tournaments.enabled'`,
    );
    const events = recordPublisher();

    const opened = await app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.rows[0]!.tournament_id}/fixtures/${duel.fixtureId}/segments/open`,
      headers: auth(tokenFor(duel.homeUserId)),
    });

    expect(opened.statusCode).toBe(200);
    expect(liveFrom(latestFixtureUpdate(events, duel.fixtureId))).toMatchObject({
      duelMatchId: opened.json().duelMatchId,
      participants: [
        expect.objectContaining({ userId: duel.homeUserId, state: 'loadout_pending' }),
        expect.objectContaining({ userId: duel.awayUserId, state: 'loadout_pending' }),
      ],
    });
  });

  it('keeps tournament gameplay successful when fixture publication rejects', async () => {
    const duel = await createFixtureDuel();
    vi.spyOn(app.log, 'warn').mockImplementation(() => undefined);
    const publish = vi.spyOn(app.realtime, 'publish').mockRejectedValue(new Error('redis offline'));

    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/ready`,
      headers: auth(tokenFor(duel.homeUserId)),
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    expect(publish).toHaveBeenCalledWith(
      `tournament:fixture:${duel.fixtureId}`,
      expect.objectContaining({ type: 'tournament:fixture_update' }),
    );
  });

  it('warns without fixture payload when tournament fixture publication rejects', async () => {
    const duel = await createFixtureDuel();
    const warn = vi.spyOn(app.log, 'warn').mockImplementation(() => undefined);
    vi.spyOn(app.realtime, 'publish').mockRejectedValue(new Error('redis offline'));

    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/ready`,
      headers: auth(tokenFor(duel.homeUserId)),
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toEqual([
      { err: expect.any(Error) },
      'tournament fixture progress publication failed',
    ]);
  });

  it('publishes a terminal fixture snapshot after tournament settlement', async () => {
    const duel = await createFixtureDuel();
    const events = recordPublisher();
    await readyBoth(duel);
    events.length = 0;
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed', current_period = 1,
              goals = case when user_id = $2 then 1 else 0 end,
              completed_at = now(), updated_at = now()
        where match_id = $1`,
      [duel.duelMatchId, duel.homeUserId],
    );

    const settled = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${duel.duelMatchId}/settle`,
      headers: auth(tokenFor(duel.homeUserId)),
    });

    expect(settled.statusCode).toBe(200);
    expect(liveFrom(latestFixtureUpdate(events, duel.fixtureId))).toMatchObject({
      status: 'settled',
      score: { home: 1, away: 0 },
      duelMatchId: null,
      participants: [],
    });
  });
});
