import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  createTestPool,
  createTestRedis,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
  getTestUrls,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const BOT_TOKEN = '111:test-bot-token';

function signPayload(data: Record<string, string>, botToken: string): string {
  const secretKey = createHash('sha256').update(botToken).digest();
  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

describe.skipIf(!hasIntegrationEnv)('GET /me', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;

  beforeAll(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.end();
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
        JWT_SECRET: 'access-secret-at-least-16-chars',
        REFRESH_SECRET: 'refresh-secret-at-least-16-chars',
        TELEGRAM_BOT_TOKEN: BOT_TOKEN,
        DAILY_SEED_SECRET: 'daily-seed-secret-at-least-16!!',
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  async function loginTelegram(overrides: Partial<Record<string, string>> = {}) {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload: Record<string, string> = {
      id: '42',
      first_name: 'Alice',
      auth_date: String(nowSec),
      ...overrides,
    };
    payload.hash = signPayload(payload, BOT_TOKEN);
    const login = await app.inject({ method: 'POST', url: '/auth/telegram', payload });
    return login.json() as { accessToken: string; user: { id: string; displayName: string } };
  }

  async function insertDailyShot(
    userId: string,
    dayOffset: number,
    shotIndex: number,
  ): Promise<void> {
    const pool = await app.pg.query<{ id: string }>(
      `insert into day_pool
         (user_id, day_date, state, current_period, game_core_version, daily_seed, closed_at)
       values (
         $1,
         (now() at time zone 'UTC')::date - $2::int,
         'closed',
         0,
         1,
         $3,
         now()
       )
       returning id`,
      [userId, dayOffset, `daily-seed-${dayOffset}-${shotIndex}`],
    );
    await app.pg.query(
      `insert into shot_session
         (user_id, mode, day_pool_id, period_number, shot_index, seed, input_payload,
          server_result, game_core_version, created_at)
       values (
         $1,
         'daily',
         $2,
         1,
         $3,
         $4,
         '{}'::jsonb,
         'goal',
         1,
         (((now() at time zone 'UTC')::date - $5::int)::timestamp + interval '12 hours')
           at time zone 'UTC'
       )`,
      [userId, pool.rows[0]!.id, shotIndex, `shot-seed-${dayOffset}-${shotIndex}`, dayOffset],
    );
  }

  async function insertTrainingShot(
    userId: string,
    dayOffset: number,
    shotIndex: number,
  ): Promise<void> {
    const session = await app.pg.query<{ id: string }>(
      `insert into training_session
         (user_id, day_date, selected_period, state, game_core_version, training_seed, closed_at)
       values (
         $1,
         (now() at time zone 'UTC')::date - $2::int,
         1,
         'closed',
         1,
         $3,
         now()
       )
       returning id`,
      [userId, dayOffset, `training-seed-${dayOffset}-${shotIndex}`],
    );
    await app.pg.query(
      `insert into shot_session
         (user_id, mode, training_session_id, period_number, shot_index, seed, input_payload,
          server_result, game_core_version, created_at)
       values (
         $1,
         'training',
         $2,
         1,
         $3,
         $4,
         '{}'::jsonb,
         'save',
         1,
         (((now() at time zone 'UTC')::date - $5::int)::timestamp + interval '12 hours')
           at time zone 'UTC'
       )`,
      [
        userId,
        session.rows[0]!.id,
        shotIndex,
        `training-shot-seed-${dayOffset}-${shotIndex}`,
        dayOffset,
      ],
    );
  }

  it('returns 401 without bearer', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns current user after login', async () => {
    const { accessToken } = await loginTelegram({
      username: 'alice',
      photo_url: 'tg.png',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; displayName: string };
    expect(body.displayName).toBe('Alice');
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.json()).toMatchObject({
      competitionLevel: 'beginner',
      stats: {
        shots: 0,
        goals: 0,
        accuracy: 0,
        playStreakDays: 0,
        bestPlayStreakDays: 0,
      },
      displaySource: 'telegram',
      linkedProviders: ['telegram'],
      tgFirstName: 'Alice',
      tgAvatarUrl: 'tg.png',
      tgUsername: 'alice',
      registeredAt: expect.any(String),
      registrationProvider: 'telegram',
      registrationProviderId: '42',
      trophySummary: {
        regularSeasonWins: 0,
        tournamentChampionships: 0,
        tournamentPodiums: 0,
        completedChallenges: 0,
      },
    });
    const fullBody = res.json() as {
      achievements: Array<{ id: string; status: string; photoUrl: string }>;
      unclaimedAchievementsCount: number;
      experienceBalance: number;
    };
    expect(fullBody.achievements).toEqual([]);
    expect(fullBody.unclaimedAchievementsCount).toBe(0);
    expect(fullBody.experienceBalance).toBe(0);
  });

  it('opts Sections into pending podium congratulations and acknowledges them idempotently', async () => {
    const owner = await loginTelegram({ id: '4201', first_name: 'Winner' });
    const other = await loginTelegram({ id: '4202', first_name: 'Other' });
    const tournament = await app.pg.query<{ id: string }>(
      `insert into tournament
         (slug, title, regular_source, visibility, created_by)
       values ('me-podium-cup', 'Кубок Ледовой арены', 'head_to_head', 'public', $1)
       returning id`,
      [owner.user.id],
    );
    const congratulation = await app.pg.query<{ id: string }>(
      `insert into tournament_regular_podium_congratulation
         (tournament_id, user_id, place, tournament_title,
          reward_coins, reward_stars, reward_experience)
       values ($1, $2, 1, 'Кубок Ледовой арены', 5000, 25, 1500)
       returning id`,
      [tournament.rows[0]!.id, owner.user.id],
    );
    const authorization = { authorization: `Bearer ${owner.accessToken}` };

    const plain = await app.inject({ method: 'GET', url: '/me', headers: authorization });
    expect(plain.statusCode).toBe(200);
    expect(plain.json()).not.toHaveProperty('pendingTournamentCongratulations');

    const optedIn = await app.inject({
      method: 'GET',
      url: '/me?includeTournamentCongratulations=true',
      headers: authorization,
    });
    expect(optedIn.statusCode).toBe(200);
    expect(optedIn.json()).toMatchObject({
      pendingTournamentCongratulations: [
        {
          id: congratulation.rows[0]!.id,
          tournamentId: tournament.rows[0]!.id,
          tournamentTitle: 'Кубок Ледовой арены',
          place: 1,
          reward: { coins: 5000, stars: 25, experience: 1500 },
        },
      ],
    });

    const unauthenticated = await app.inject({
      method: 'POST',
      url: `/tournaments/congratulations/${congratulation.rows[0]!.id}/read`,
    });
    expect(unauthenticated.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: 'POST',
      url: `/tournaments/congratulations/${congratulation.rows[0]!.id}/read`,
      headers: { authorization: `Bearer ${other.accessToken}` },
    });
    expect(forbidden.statusCode).toBe(404);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const acknowledged = await app.inject({
        method: 'POST',
        url: `/tournaments/congratulations/${congratulation.rows[0]!.id}/read`,
        headers: authorization,
      });
      expect(acknowledged.statusCode).toBe(200);
      expect(acknowledged.json()).toEqual({ acknowledged: true });
    }

    const afterRead = await app.inject({
      method: 'GET',
      url: '/me?includeTournamentCongratulations=true',
      headers: authorization,
    });
    expect(afterRead.json()).toMatchObject({ pendingTournamentCongratulations: [] });
  });

  it('enables the experimental training court for allowlisted Telegram users', async () => {
    const { accessToken } = await loginTelegram({ id: '8579300717', first_name: 'Sirius' });

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      displayName: 'Sirius',
      experimentalTrainingCourt: true,
    });
  });

  it('completes stat achievements from lifetime totals without showing them as claimed', async () => {
    const { accessToken, user } = await loginTelegram({ id: '45' });
    await app.pg.query(
      `update users
          set lifetime_shots_total = 1200,
              lifetime_goals_total = 1000
        where id = $1`,
      [user.id],
    );

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      stats: {
        shots: 1200,
        goals: 1000,
        accuracy: 83,
        playStreakDays: 0,
        bestPlayStreakDays: 0,
      },
    });
    const body = res.json() as {
      achievements: Array<{ id: string; status: string; completedAt?: string }>;
      unclaimedAchievementsCount: number;
    };
    expect(body.achievements).toEqual([]);
    expect(body.unclaimedAchievementsCount).toBe(2);
  });

  it('reports unclaimed achievement count while profile achievements stay claimed-only', async () => {
    const { accessToken, user } = await loginTelegram({ id: '145' });
    await app.pg.query(
      `insert into user_achievements (user_id, achievement_id, completed_at, claimed_at)
       values
         ($1, 'first-goal', now(), null),
         ($1, 'first-training', now(), now())`,
      [user.id],
    );

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      achievements: Array<{ id: string; status: string }>;
      unclaimedAchievementsCount: number;
    };
    expect(body.unclaimedAchievementsCount).toBe(1);
    expect(body.achievements).toEqual([
      expect.objectContaining({ id: 'first-training', status: 'claimed' }),
    ]);
  });

  it('counts consecutive play days only from official game modes', async () => {
    const { accessToken, user } = await loginTelegram({ id: '46' });

    await insertDailyShot(user.id, 0, 1);
    await insertTrainingShot(user.id, 1, 1);
    await insertDailyShot(user.id, 2, 2);
    await insertTrainingShot(user.id, 4, 3);
    await insertDailyShot(user.id, 4, 4);

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      stats: {
        playStreakDays: 1,
        bestPlayStreakDays: 1,
      },
    });
  });

  it('counts only the playoff final and actual podium places in trophy summary', async () => {
    const champion = await loginTelegram({ id: '61', first_name: 'Champion' });
    const runnerUp = await loginTelegram({ id: '62', first_name: 'Runner-up' });
    const earlyLoser = await loginTelegram({ id: '63', first_name: 'Early loser' });
    const bronzeWinner = await loginTelegram({ id: '64', first_name: 'Bronze winner' });

    const tournament = await app.pg.query<{ id: string }>(
      `insert into tournament (slug, title, status, regular_source, created_by)
       values ('profile-trophy-summary', 'Profile trophy summary', 'completed', 'head_to_head', $1)
       returning id`,
      [champion.user.id],
    );
    const tournamentId = tournament.rows[0]!.id;
    const participantByUser = new Map<string, string>();
    for (const player of [champion, runnerUp, earlyLoser, bronzeWinner]) {
      const participant = await app.pg.query<{ id: string }>(
        `insert into tournament_participant (tournament_id, user_id, state)
         values ($1, $2, 'approved') returning id`,
        [tournamentId, player.user.id],
      );
      participantByUser.set(player.user.id, participant.rows[0]!.id);
    }
    const quarterfinal = await app.pg.query<{ id: string }>(
      `insert into tournament_round (tournament_id, stage, number, status)
       values ($1, 'playoff', 1, 'settled') returning id`,
      [tournamentId],
    );
    const final = await app.pg.query<{ id: string }>(
      `insert into tournament_round (tournament_id, stage, number, status)
       values ($1, 'playoff', 2, 'settled') returning id`,
      [tournamentId],
    );
    const bronze = await app.pg.query<{ id: string }>(
      `insert into tournament_round (tournament_id, stage, number, status)
       values ($1, 'third_place', 2, 'settled') returning id`,
      [tournamentId],
    );
    const championParticipant = participantByUser.get(champion.user.id)!;
    const runnerUpParticipant = participantByUser.get(runnerUp.user.id)!;
    const earlyLoserParticipant = participantByUser.get(earlyLoser.user.id)!;
    const bronzeWinnerParticipant = participantByUser.get(bronzeWinner.user.id)!;
    await app.pg.query(
      `insert into tournament_playoff_series
         (tournament_id, round_id, bracket_position, kind,
          higher_seed_participant_id, lower_seed_participant_id, winner_participant_id,
          wins_required, home_sequence, status)
       values
         ($1, $2, 1, 'championship', $3, $4, $3, 1, '[]'::jsonb, 'completed'),
         ($1, $5, 1, 'championship', $3, $6, $3, 1, '[]'::jsonb, 'completed'),
         ($1, $7, 1, 'third_place', $4, $8, $8, 1, '[]'::jsonb, 'completed')`,
      [
        tournamentId,
        quarterfinal.rows[0]!.id,
        championParticipant,
        earlyLoserParticipant,
        final.rows[0]!.id,
        runnerUpParticipant,
        bronze.rows[0]!.id,
        bronzeWinnerParticipant,
      ],
    );

    const fetchSummary = async (accessToken: string) => {
      const response = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(response.statusCode).toBe(200);
      return response.json().trophySummary as {
        tournamentChampionships: number;
        tournamentPodiums: number;
      };
    };

    await expect(fetchSummary(champion.accessToken)).resolves.toMatchObject({
      tournamentChampionships: 1,
      tournamentPodiums: 0,
    });
    await expect(fetchSummary(runnerUp.accessToken)).resolves.toMatchObject({
      tournamentChampionships: 0,
      tournamentPodiums: 1,
    });
    await expect(fetchSummary(earlyLoser.accessToken)).resolves.toMatchObject({
      tournamentChampionships: 0,
      tournamentPodiums: 0,
    });
  });

  it('rejects displaySource=vk when VK is not linked', async () => {
    const { accessToken } = await loginTelegram({ id: '43' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { displaySource: 'vk' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'bad_request', message: 'display_source_unavailable' },
    });
  });

  it('switches displaySource to linked VK provider', async () => {
    const { accessToken, user } = await loginTelegram({ id: '44' });
    await app.pg.query(
      `insert into auth_providers (id, user_id, provider, provider_uid)
       values (gen_random_uuid(), $1, 'vk', 'vk-44')`,
      [user.id],
    );
    await app.pg.query(
      `update users
          set vk_first_name = 'Vera',
              vk_last_name = 'Volkova',
              vk_avatar_url = 'vk.png'
        where id = $1`,
      [user.id],
    );

    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { displaySource: 'vk' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      displayName: 'Vera Volkova',
      avatarUrl: 'vk.png',
      displaySource: 'vk',
      linkedProviders: ['telegram', 'vk'],
    });
  });

  it('saves custom profile names and switches display source to custom', async () => {
    const { accessToken } = await loginTelegram({ id: '47' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        displaySource: 'custom',
        customFirstName: 'Егор',
        customLastName: 'Гуменюк',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      displayName: 'Егор Гуменюк',
      displaySource: 'custom',
      customDisplayName: 'Егор Гуменюк',
      customFirstName: 'Егор',
      customLastName: 'Гуменюк',
    });
  });

  it('rejects incomplete custom profile names', async () => {
    const { accessToken } = await loginTelegram({ id: '48' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        displaySource: 'custom',
        customFirstName: 'Егор',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'bad_request', message: 'custom_profile_incomplete' },
    });
  });
});
