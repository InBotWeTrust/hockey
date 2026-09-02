import { createHmac, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GAME_CORE_VERSION,
  STICK_NEUTRAL,
  deriveShotSeed,
  getGoalie,
  getSessionPhaseOffsets,
  resolveShot,
  type ShotInput,
  type ShotResult,
} from '@hockey/game-core';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJwt } from '../../src/auth/jwt.js';
import { buildApp } from '../../src/app.js';
import { applyMigrations } from '../../src/db/migrations.js';
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
const JWT_SECRET = 'onboarding-access-secret-at-least-16';
const REFRESH_SECRET = 'onboarding-refresh-secret-at-least-16';
const DAILY_SEED_SECRET = 'onboarding-daily-seed-at-least-16';

type ChainKey = 'beginner' | 'amateur';

interface StepSpec {
  position: number;
  kind: 'informational' | 'tutorial_shot';
  tutorial?: {
    shooterFrequency: number;
    goalieFrequency: number;
    goalFrequency: number;
  };
}

interface PublishedChain {
  versionId: string;
  stepIds: string[];
}

interface TutorialSpeeds {
  shooterFrequency: number;
  goalieFrequency: number;
  goalFrequency: number;
}

function findTutorialInput(
  seed: string,
  shotIndex: number,
  speeds: TutorialSpeeds,
  wanted: ShotResult['type'],
  rejectedSpeeds?: TutorialSpeeds,
): ShotInput {
  const goalie = getGoalie('rookie');
  const shotSeed = deriveShotSeed(seed, 1, shotIndex);
  const phaseOffsets = getSessionPhaseOffsets(seed);
  for (let tapTime = 0; tapTime <= 60_000; tapTime += 5) {
    const input = { tapTime, shooterTapTime: tapTime, ...speeds };
    const serverResult = resolveShot(
      input,
      goalie,
      shotSeed,
      shotIndex,
      STICK_NEUTRAL,
      phaseOffsets,
    ).type;
    const rejectedOverrideResult = rejectedSpeeds
      ? resolveShot(
          { tapTime, shooterTapTime: tapTime, ...rejectedSpeeds },
          goalie,
          shotSeed,
          shotIndex,
          STICK_NEUTRAL,
          phaseOffsets,
        ).type
      : undefined;
    if (serverResult === wanted && rejectedOverrideResult !== wanted) {
      return input;
    }
  }
  throw new Error(`no ${wanted} tutorial input found`);
}

describe.skipIf(!hasIntegrationEnv)('onboarding lifecycle routes', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let mediaOwnerId: string;

  beforeAll(async () => {
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await applyMigrations(initPool, MIGRATIONS_DIR);
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
    });
    pool = app.pg;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await pool.query('truncate users restart identity cascade');
    await pool.query(
      `insert into onboarding_chain (key, enforcement_enabled)
       values ('beginner', false), ('amateur', false)
       on conflict (key) do nothing`,
    );
    await pool.query(
      'update onboarding_chain set enforcement_enabled = false, current_published_version_id = null',
    );
    await pool.query('delete from onboarding_version');
    await pool.query(`delete from media_objects where purpose = 'onboarding_image'`);
    const mediaOwner = await pool.query<{ id: string }>(
      `insert into users
         (id, display_name, timezone, beginner_onboarding_completed, amateur_onboarding_completed)
       values ($1, 'Onboarding media owner', 'Europe/Moscow', true, true)
       returning id`,
      [randomUUID()],
    );
    mediaOwnerId = mediaOwner.rows[0]!.id;
  });

  async function createUser(level: 1 | 2 = 1) {
    const user = await pool.query<{ id: string }>(
      `insert into users
         (id, display_name, timezone, level, beginner_onboarding_completed, amateur_onboarding_completed)
       values ($1, $2, 'Europe/Moscow', $3, false, false)
       returning id`,
      [randomUUID(), `Onboarding ${randomUUID()}`, level],
    );
    const userId = user.rows[0]!.id;
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    return {
      userId,
      authorization: `Bearer ${await jwt.issueAccessToken({ sub: userId })}`,
    };
  }

  async function publishChain(
    chain: ChainKey,
    steps: StepSpec[] = [{ position: 1, kind: 'informational' }],
  ): Promise<PublishedChain> {
    const version = await pool.query<{ id: string }>(
      `insert into onboarding_version (chain_key, status, published_at)
       values ($1, 'published', now())
       returning id`,
      [chain],
    );
    const versionId = version.rows[0]!.id;
    const stepIds: string[] = [];

    for (const step of steps) {
      if (step.kind === 'informational') {
        const media = await pool.query<{ id: string }>(
          `insert into media_objects
             (owner_user_id, purpose, object_key, url, content_type, size_bytes)
           values ($1, 'onboarding_image', $2, $3, 'image/webp', 1)
           returning id`,
          [mediaOwnerId, `onboarding/${randomUUID()}.webp`, `/onboarding-${randomUUID()}.webp`],
        );
        const inserted = await pool.query<{ id: string }>(
          `insert into onboarding_step
             (version_id, position, kind, title, description, cta_label, media_object_id)
           values ($1, $2, 'informational', $3, $4, 'Далее', $5)
           returning id`,
          [
            versionId,
            step.position,
            `${chain} info ${step.position}`,
            `Описание ${step.position}`,
            media.rows[0]!.id,
          ],
        );
        stepIds.push(inserted.rows[0]!.id);
      } else {
        const inserted = await pool.query<{ id: string }>(
          `insert into onboarding_step
             (version_id, position, kind, title, description, cta_label, tutorial_config)
           values ($1, $2, 'tutorial_shot', $3, $4, 'Бросить', $5::jsonb)
           returning id`,
          [
            versionId,
            step.position,
            `${chain} tutorial ${step.position}`,
            `Тренировка ${step.position}`,
            JSON.stringify(
              step.tutorial ?? {
                shooterFrequency: 0.5,
                goalieFrequency: 0.6,
                goalFrequency: 0.7,
              },
            ),
          ],
        );
        stepIds.push(inserted.rows[0]!.id);
      }
    }

    await pool.query(
      `update onboarding_chain
          set enforcement_enabled = true, current_published_version_id = $2
        where key = $1`,
      [chain, versionId],
    );
    return { versionId, stepIds };
  }

  async function start(authorization: string, clientSessionId: string) {
    return app.inject({
      method: 'POST',
      url: '/onboarding/start',
      headers: { authorization },
      payload: { clientSessionId },
    });
  }

  async function view(authorization: string, runId: string, stepId: string) {
    return app.inject({
      method: 'POST',
      url: `/onboarding/runs/${runId}/steps/${stepId}/view`,
      headers: { authorization },
    });
  }

  async function complete(authorization: string, runId: string) {
    return app.inject({
      method: 'POST',
      url: `/onboarding/runs/${runId}/complete`,
      headers: { authorization },
    });
  }

  async function startTutorial(authorization: string, runId: string) {
    return app.inject({
      method: 'POST',
      url: `/onboarding/runs/${runId}/tutorial/start`,
      headers: { authorization },
    });
  }

  async function submitTutorialShot(
    authorization: string,
    runId: string,
    payload: {
      shotIndex: number;
      input: ShotInput;
      claimedResult: ShotResult['type'];
    },
  ) {
    return app.inject({
      method: 'POST',
      url: `/onboarding/runs/${runId}/tutorial/shot`,
      headers: { authorization },
      payload,
    });
  }

  async function gameStateSnapshot(userId: string) {
    const { rows } = await pool.query(
      `select u.level,
              u.xp,
              u.experience,
              u.lifetime_shots_total,
              u.lifetime_goals_total,
              (select to_jsonb(wallet) - 'shots_updated_at'
                 from user_wallet wallet where wallet.user_id = u.id) as wallet,
              (select to_jsonb(currency) - array['created_at', 'updated_at']::text[]
                 from user_currency_account currency where currency.user_id = u.id) as currency,
              (select count(*)::int from goalie_progress where user_id = u.id) as goalie_progress,
              (select count(*)::int from user_achievements where user_id = u.id) as achievements,
              (select count(*)::int from achievement_progress where user_id = u.id) as achievement_progress,
              (select count(*)::int from shot_session where user_id = u.id) as shots,
              (select count(*)::int from day_pool where user_id = u.id) as daily_sessions,
              (select count(*)::int from period_log log
                join day_pool daily on daily.id = log.day_pool_id
               where daily.user_id = u.id) as daily_periods,
              (select count(*)::int from training_session where user_id = u.id) as training_sessions,
              (select count(*)::int from bonus_game_attempt where user_id = u.id) as bonus_attempts,
              (select count(*)::int from bonus_game_period_log log
                join bonus_game_attempt attempt on attempt.id = log.attempt_id
               where attempt.user_id = u.id) as bonus_periods,
              (select count(*)::int from bonus_game_economy_event where user_id = u.id) as bonus_economy,
              (select count(*)::int from user_bonus_game_completion where user_id = u.id) as bonus_completions,
              (select count(*)::int from amateur_duel_match
                where challenger_user_id = u.id or opponent_user_id = u.id) as duel_matches,
              (select count(*)::int from amateur_duel_participant where user_id = u.id) as duel_participations,
              (select count(*)::int from amateur_duel_period_log where user_id = u.id) as duel_periods,
              (select count(*)::int from amateur_duel_rating where user_id = u.id) as duel_ratings,
              (select count(*)::int from amateur_duel_matchmaking_ticket where user_id = u.id) as duel_tickets,
              (select count(*)::int from currency_ledger where user_id = u.id) as currency_events
         from users u
        where u.id = $1`,
      [userId],
    );
    return rows[0];
  }

  async function addTutorialGoal(input: {
    runId: string;
    userId: string;
    versionId: string;
    stepId: string;
  }) {
    await pool.query(
      `insert into onboarding_event
         (run_id, user_id, chain_key, version_id, step_id, kind, result, attempt_number)
       values ($1, $2, 'beginner', $3, $4, 'tutorial_goal', 'goal', 1)`,
      [input.runId, input.userId, input.versionId, input.stepId],
    );
  }

  it('requires authentication for every public lifecycle endpoint', async () => {
    const runId = randomUUID();
    const stepId = randomUUID();
    const requests = [
      app.inject({ method: 'GET', url: '/onboarding/required' }),
      app.inject({
        method: 'POST',
        url: '/onboarding/start',
        payload: { clientSessionId: randomUUID() },
      }),
      app.inject({ method: 'POST', url: `/onboarding/runs/${runId}/steps/${stepId}/view` }),
      app.inject({ method: 'POST', url: `/onboarding/runs/${runId}/tutorial/start` }),
      app.inject({
        method: 'POST',
        url: `/onboarding/runs/${runId}/tutorial/shot`,
        payload: {
          shotIndex: 1,
          input: { tapTime: 0, shooterTapTime: 0 },
          claimedResult: 'miss',
        },
      }),
      app.inject({ method: 'POST', url: `/onboarding/runs/${runId}/complete` }),
    ];

    for (const response of await Promise.all(requests)) {
      expect(response.statusCode).toBe(401);
    }
  });

  it('validates tutorial shots authoritatively without changing game progress', async () => {
    const speeds = {
      shooterFrequency: 0.12,
      goalieFrequency: 0.1,
      goalFrequency: 0.08,
    };
    const published = await publishChain('beginner', [
      { position: 1, kind: 'tutorial_shot', tutorial: speeds },
    ]);
    const user = await createUser();
    await pool.query(
      `insert into user_wallet
         (user_id, shots_current, shots_max, shots_bonus, pucks, gold_pucks, wheel_spins, training_energy)
       values ($1, 17, 25, 3, 41, 2, 1, 4)`,
      [user.userId],
    );
    await pool.query(
      `insert into user_currency_account (user_id, balance, reserved_balance)
       values ($1, 29, 7)`,
      [user.userId],
    );
    const started = await start(user.authorization, randomUUID());
    const runId = started.json().runId as string;

    const tutorial = await startTutorial(user.authorization, runId);
    expect(tutorial.statusCode).toBe(200);
    expect(tutorial.json()).toMatchObject({
      shotIndex: 1,
      goalieId: 'rookie',
      gameCoreVersion: GAME_CORE_VERSION,
      speeds,
      goalConfirmed: false,
    });
    expect(tutorial.json().seed).toMatch(/^[0-9a-f]{64}$/);
    expect(tutorial.json().seed).not.toBe(DAILY_SEED_SECRET);
    expect(tutorial.json().seed).toBe(
      createHmac('sha256', DAILY_SEED_SECRET)
        .update(`${user.userId}:${runId}:${published.versionId}`)
        .digest('hex'),
    );

    await pool.query(
      `update onboarding_step
          set tutorial_config = $2::jsonb
        where id = $1`,
      [
        published.stepIds[0],
        JSON.stringify({ shooterFrequency: 1.9, goalieFrequency: 1.8, goalFrequency: 1.7 }),
      ],
    );
    const repeatedStart = await startTutorial(user.authorization, runId);
    expect(repeatedStart.statusCode).toBe(200);
    expect(repeatedStart.json()).toMatchObject({
      seed: tutorial.json().seed,
      shotIndex: 1,
      speeds,
      goalConfirmed: false,
    });

    const before = await gameStateSnapshot(user.userId);
    const rejectedSpeeds = {
      shooterFrequency: 2,
      goalieFrequency: 2,
      goalFrequency: 2,
    };
    const missInput = findTutorialInput(tutorial.json().seed, 1, speeds, 'miss', rejectedSpeeds);
    const miss = await submitTutorialShot(user.authorization, runId, {
      shotIndex: 1,
      input: {
        tapTime: missInput.tapTime,
        shooterTapTime: missInput.shooterTapTime!,
        ...rejectedSpeeds,
      },
      claimedResult: 'goal',
    });
    expect(miss.statusCode).toBe(200);
    expect(miss.json()).toEqual({
      serverResult: 'miss',
      nextShotIndex: 2,
      goalConfirmed: false,
    });

    const repeatedShot = await submitTutorialShot(user.authorization, runId, {
      shotIndex: 1,
      input: { tapTime: missInput.tapTime, shooterTapTime: missInput.shooterTapTime! },
      claimedResult: 'miss',
    });
    expect(repeatedShot.statusCode).toBe(409);

    const goalInput = findTutorialInput(tutorial.json().seed, 2, speeds, 'goal', rejectedSpeeds);
    const goal = await submitTutorialShot(user.authorization, runId, {
      shotIndex: 2,
      input: {
        tapTime: goalInput.tapTime,
        shooterTapTime: goalInput.shooterTapTime!,
        ...rejectedSpeeds,
      },
      claimedResult: 'miss',
    });
    expect(goal.statusCode).toBe(200);
    expect(goal.json()).toEqual({
      serverResult: 'goal',
      nextShotIndex: 3,
      goalConfirmed: true,
    });

    const events = await pool.query<{
      kind: string;
      result: string;
      attempt_number: number;
    }>(
      `select kind, result, attempt_number
         from onboarding_event
        where run_id = $1 and kind in ('tutorial_attempt', 'tutorial_goal')
        order by created_at, kind`,
      [runId],
    );
    expect(events.rows).toEqual([
      { kind: 'tutorial_attempt', result: 'miss', attempt_number: 1 },
      { kind: 'tutorial_attempt', result: 'goal', attempt_number: 2 },
      { kind: 'tutorial_goal', result: 'goal', attempt_number: 2 },
    ]);
    expect(await gameStateSnapshot(user.userId)).toEqual(before);
  });

  it('returns the highest-priority applicable chain with ordered public steps', async () => {
    const beginner = await publishChain('beginner', [
      { position: 2, kind: 'informational' },
      { position: 1, kind: 'tutorial_shot' },
    ]);
    await publishChain('amateur');
    const user = await createUser(2);

    const response = await app.inject({
      method: 'GET',
      url: '/onboarding/required',
      headers: { authorization: user.authorization },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      required: {
        chain: 'beginner',
        versionId: beginner.versionId,
        steps: [
          {
            id: beginner.stepIds[1],
            position: 1,
            kind: 'tutorial_shot',
            title: 'beginner tutorial 1',
            description: 'Тренировка 1',
            ctaLabel: 'Бросить',
            tutorial: { shooterFrequency: 0.5, goalieFrequency: 0.6, goalFrequency: 0.7 },
          },
          {
            id: beginner.stepIds[0],
            position: 2,
            kind: 'informational',
            title: 'beginner info 2',
            description: 'Описание 2',
            ctaLabel: 'Далее',
          },
        ],
      },
    });
    expect(response.json().required.steps[1].imageUrl).toMatch(
      /^\/api\/media\/[0-9a-f-]{36}\?t=[A-Za-z0-9_-]+$/,
    );

    await pool.query('update users set beginner_onboarding_completed = true where id = $1', [
      user.userId,
    ]);
    const amateur = await app.inject({
      method: 'GET',
      url: '/onboarding/required',
      headers: { authorization: user.authorization },
    });
    expect(amateur.statusCode).toBe(200);
    expect(amateur.json().required.chain).toBe('amateur');
  });

  it('starts idempotently per client session and restarts from step one for a new session', async () => {
    const published = await publishChain('beginner', [
      { position: 1, kind: 'informational' },
      { position: 2, kind: 'tutorial_shot' },
    ]);
    const user = await createUser();
    const firstSessionId = randomUUID();

    const first = await start(user.authorization, firstSessionId);
    const repeated = await start(user.authorization, firstSessionId);
    const restarted = await start(user.authorization, randomUUID());

    expect(first.statusCode).toBe(200);
    expect(first.json().required.steps[0].position).toBe(1);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().runId).toBe(first.json().runId);
    expect(restarted.statusCode).toBe(200);
    expect(restarted.json().runId).not.toBe(first.json().runId);
    expect(restarted.json().required.versionId).toBe(published.versionId);

    expect(await view(user.authorization, first.json().runId, published.stepIds[0]!)).toMatchObject(
      { statusCode: 200 },
    );
    expect(await view(user.authorization, first.json().runId, published.stepIds[0]!)).toMatchObject(
      { statusCode: 200 },
    );

    const eventCounts = await pool.query<{ run_id: string; count: number }>(
      `select run_id, count(*)::int as count
         from onboarding_event
        where kind = 'step_viewed'
        group by run_id`,
    );
    expect(eventCounts.rows).toEqual([{ run_id: first.json().runId, count: 1 }]);
  });

  it('requires every viewed step and an authoritative tutorial goal before idempotent completion', async () => {
    const published = await publishChain('beginner', [
      { position: 1, kind: 'informational' },
      { position: 2, kind: 'tutorial_shot' },
    ]);
    const user = await createUser();
    const started = await start(user.authorization, randomUUID());
    const stale = await start(user.authorization, randomUUID());
    const runId = started.json().runId as string;

    await addTutorialGoal({
      runId,
      userId: user.userId,
      versionId: published.versionId,
      stepId: published.stepIds[1]!,
    });
    const missingViews = await complete(user.authorization, runId);
    expect(missingViews.statusCode).toBe(409);

    for (const stepId of published.stepIds) {
      expect((await view(user.authorization, runId, stepId)).statusCode).toBe(200);
    }
    await pool.query(`delete from onboarding_event where run_id = $1 and kind = 'tutorial_goal'`, [
      runId,
    ]);
    const missingGoal = await complete(user.authorization, runId);
    expect(missingGoal.statusCode).toBe(409);

    await addTutorialGoal({
      runId,
      userId: user.userId,
      versionId: published.versionId,
      stepId: published.stepIds[1]!,
    });
    const completed = await complete(user.authorization, runId);
    const secondComplete = await complete(user.authorization, runId);

    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toEqual({ required: null });
    expect(secondComplete.statusCode).toBe(200);
    expect(secondComplete.json()).toEqual({ required: null });

    const state = await pool.query<{
      beginner_onboarding_completed: boolean;
      completed_at: Date | null;
      completed_events: number;
    }>(
      `select u.beginner_onboarding_completed,
              r.completed_at,
              count(e.id)::int as completed_events
         from users u
         join onboarding_run r on r.user_id = u.id
         left join onboarding_event e on e.run_id = r.id and e.kind = 'completed'
        where u.id = $1 and r.id = $2
        group by u.beginner_onboarding_completed, r.completed_at`,
      [user.userId, runId],
    );
    expect(state.rows[0]?.beginner_onboarding_completed).toBe(true);
    expect(state.rows[0]?.completed_at).toBeInstanceOf(Date);
    expect(state.rows[0]?.completed_events).toBe(1);

    for (const stepId of published.stepIds) {
      await view(user.authorization, stale.json().runId, stepId);
    }
    await addTutorialGoal({
      runId: stale.json().runId,
      userId: user.userId,
      versionId: published.versionId,
      stepId: published.stepIds[1]!,
    });
    expect((await complete(user.authorization, stale.json().runId)).statusCode).toBe(409);
  });

  it('enforces run ownership and the version snapshot on every mutation', async () => {
    const original = await publishChain('beginner');
    const owner = await createUser();
    const outsider = await createUser();
    const started = await start(owner.authorization, randomUUID());
    const runId = started.json().runId as string;

    expect((await view(outsider.authorization, runId, original.stepIds[0]!)).statusCode).toBe(404);
    expect((await complete(outsider.authorization, runId)).statusCode).toBe(404);

    const replacement = await publishChain('beginner');
    expect((await view(owner.authorization, runId, replacement.stepIds[0]!)).statusCode).toBe(404);
    expect((await view(owner.authorization, runId, original.stepIds[0]!)).statusCode).toBe(200);

    const completed = await complete(owner.authorization, runId);
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toEqual({ required: null });
  });

  it('rejects completion when the snapshotted chain is no longer applicable', async () => {
    const published = await publishChain('beginner');
    const user = await createUser();
    const started = await start(user.authorization, randomUUID());
    await pool.query(
      `update onboarding_chain set enforcement_enabled = false where key = 'beginner'`,
    );

    const inapplicableView = await view(
      user.authorization,
      started.json().runId,
      published.stepIds[0]!,
    );
    expect(inapplicableView.statusCode).toBe(409);

    await pool.query(
      `update onboarding_chain set enforcement_enabled = true where key = 'beginner'`,
    );
    await view(user.authorization, started.json().runId, published.stepIds[0]!);
    await pool.query(
      `update onboarding_chain set enforcement_enabled = false where key = 'beginner'`,
    );

    const response = await complete(user.authorization, started.json().runId);

    expect(response.statusCode).toBe(409);
    const state = await pool.query<{ beginner_onboarding_completed: boolean }>(
      'select beginner_onboarding_completed from users where id = $1',
      [user.userId],
    );
    expect(state.rows[0]?.beginner_onboarding_completed).toBe(false);
  });

  it('rejects malformed lifecycle identifiers and start bodies', async () => {
    await publishChain('beginner');
    const user = await createUser();

    expect((await start(user.authorization, 'not-a-uuid')).statusCode).toBe(400);
    expect((await view(user.authorization, 'not-a-uuid', randomUUID())).statusCode).toBe(400);
    expect((await view(user.authorization, randomUUID(), 'not-a-uuid')).statusCode).toBe(400);
    expect((await complete(user.authorization, 'not-a-uuid')).statusCode).toBe(400);
  });
});
