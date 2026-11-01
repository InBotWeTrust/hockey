import { openFirstAchievementStages } from '../../src/achievements/stageProgress.js';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
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

const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';

async function createUser(app: FastifyInstance): Promise<string> {
  const id = randomUUID();
  await app.pg.query(
    `insert into users (id, display_name, avatar_url, level, timezone)
     values ($1, 'Achievement Player', null, 1, 'UTC')`,
    [id],
  );
  return id;
}

async function issueAccessToken(userId: string): Promise<string> {
  const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
  return jwt.issueAccessToken({ sub: userId });
}

describe.skipIf(!hasIntegrationEnv)('novice rewards and map notifications', () => {
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
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: '111:test-bot-token',
        DAILY_SEED_SECRET: 'daily-seed-secret-at-least-16!!',
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
  });

  afterAll(async () => {
    await app?.close();
  });


  async function closePeriod(userId: string, reason: string, period = 1) {
    const day = await app.pg.query(`insert into day_pool(user_id,day_date,state,game_core_version,daily_seed) values($1,current_date,'closed',117,'test') returning id`, [userId]);
    await app.pg.query(`insert into period_log(day_pool_id,period_number,started_at,ended_at,shots_taken,goals,closed_reason) values($1,$2,now()-interval '20 minutes',now(),5,2,$3)`, [day.rows[0].id,period,reason]);
  }
  it.each(['quota','timeout'])('completes the first period once on %s and credits rewards only on manual claim', async reason => {
    const id = await createUser(app);
    await closePeriod(id, reason);
    await closePeriod(id, reason);
    const earned = await app.pg.query(`select claimed_at from user_achievements where user_id=$1 and achievement_id='first-period'`,[id]);
    expect(earned.rows).toEqual([{claimed_at:null}]);
    const before = await app.pg.query('select xp,experience from users where id=$1',[id]);
    const headers = {authorization:`Bearer ${await issueAccessToken(id)}`};
    const result = await app.inject({method:'POST',url:'/achievements/first-period/claim',headers});
    expect(result.statusCode).toBe(200);
    const after = await app.pg.query('select xp,experience from users where id=$1',[id]);
    expect(Number(after.rows[0].xp)-Number(before.rows[0].xp)).toBe(2);
    expect(Number(after.rows[0].experience)-Number(before.rows[0].experience)).toBe(2);
    expect((await app.inject({method:'POST',url:'/achievements/first-period/claim',headers})).statusCode).toBe(409);
  });
  it('does not count a day-end interruption or another period', async () => {
    const id = await createUser(app);
    await closePeriod(id,'day_end');
    await closePeriod(id,'quota',2);
    expect((await app.pg.query(`select 1 from user_achievements where user_id=$1 and achievement_id='first-period'`,[id])).rowCount).toBe(0);
  });
  it('requires all seven course exercises and leaves the school reward unclaimed', async () => {
    const id = await createUser(app);
    for (const key of ['first-shot','three-positions','follow-the-goal','moving-goal','find-the-gap','pressure-window']) {
      await app.pg.query(`insert into initial_training_completion(user_id,exercise_key,reward_stars,reward_experience) values($1,$2,1,1)`,[id,key]);
    }
    expect((await app.pg.query(`select 1 from user_achievements where user_id=$1 and achievement_id='hockey-school'`,[id])).rowCount).toBe(0);
    await app.pg.query(`insert into initial_training_completion(user_id,exercise_key,reward_stars,reward_experience) values($1,'game-pace',1,1)` ,[id]);
    expect((await app.pg.query(`select claimed_at from user_achievements where user_id=$1 and achievement_id='hockey-school'`,[id])).rows).toEqual([{claimed_at:null}]);
    const result = await app.inject({method:'POST',url:'/achievements/hockey-school/claim',headers:{authorization:`Bearer ${await issueAccessToken(id)}`}});
    expect(result.statusCode).toBe(200);
    expect(result.json().rewards).toMatchObject({stars:10,experience:10});
  });
  it('keeps notifications pending until acknowledged without claiming rewards or affecting another user', async () => {
    const id = await createUser(app), other = await createUser(app);
    await closePeriod(id,'quota');
    const headers = {authorization:`Bearer ${await issueAccessToken(id)}`};
    const get = () => app.inject({method:'GET',url:'/achievements/notifications',headers});
    const first = await get();
    expect(first.statusCode).toBe(200);
    expect(first.json().notifications).toHaveLength(1);
    expect((await get()).json()).toEqual(first.json());
    const ids = first.json().notifications.map((n: {id:string})=>n.id);
    const otherHeaders = {authorization:`Bearer ${await issueAccessToken(other)}`};
    await app.inject({method:'POST',url:'/achievements/notifications/seen',headers:otherHeaders,payload:{ids}});
    expect((await get()).json().notifications).toHaveLength(1);
    expect((await app.inject({method:'POST',url:'/achievements/notifications/seen',headers,payload:{ids}})).statusCode).toBe(200);
    expect((await get()).json().notifications).toEqual([]);
    expect((await app.pg.query(`select claimed_at from user_achievements where user_id=$1 and achievement_id='first-period'`,[id])).rows).toEqual([{claimed_at:null}]);
    expect((await app.inject({method:'GET',url:'/achievements/notifications'})).statusCode).toBe(401);
  });
  it('backfills archived achievements once and keeps past day-end closures ineligible', async () => {
    const id = await createUser(app), interrupted = await createUser(app);
    await closePeriod(id,'timeout');
    await closePeriod(interrupted,'day_end');
    for (const key of ['first-shot','three-positions','follow-the-goal','moving-goal','find-the-gap','pressure-window','game-pace']) {
      await app.pg.query(`insert into initial_training_completion(user_id,exercise_key,reward_stars,reward_experience) values($1,$2,1,1)`,[id,key]);
    }
    await app.pg.query('delete from user_achievements where user_id=$1',[id]);
    await app.pg.query('delete from achievement_notifications where user_id=$1',[id]);
    const sql = await readFile(path.join(MIGRATIONS_DIR,'249_backfill_novice_achievements.sql'),'utf8');
    await app.pg.query(sql);
    await app.pg.query(sql);
    expect((await app.pg.query(`select achievement_id,claimed_at from user_achievements where user_id=$1 order by achievement_id`,[id])).rows).toEqual([
      {achievement_id:'first-period',claimed_at:null},{achievement_id:'hockey-school',claimed_at:null}]);
    expect((await app.pg.query('select 1 from achievement_notifications where user_id=$1',[id])).rowCount).toBe(2);
    expect((await app.pg.query('select 1 from user_achievements where user_id=$1',[interrupted])).rowCount).toBe(0);
  });

  it('deduplicates tier completion notifications and acknowledges only the displayed batch', async () => {
    const id = await createUser(app);
    await openFirstAchievementStages(app.pg,id,new Date());
    await app.pg.query(`update user_achievement_stages set completed_at=now() where user_id=$1 and achievement_id='career-goals' and stage_number=1`,[id]);
    const headers={authorization:`Bearer ${await issueAccessToken(id)}`};
    const first=await app.inject({method:'GET',url:'/achievements/notifications',headers});
    expect(first.json().notifications).toHaveLength(1);
    expect(first.json().highlightTasks).toBe(true);
    await app.pg.query(`update user_achievement_stages set completed_at=now() where user_id=$1 and achievement_id='career-goals' and stage_number=1`,[id]);
    await closePeriod(id,'quota');
    await app.inject({method:'POST',url:'/achievements/notifications/seen',headers,payload:{ids:first.json().notifications.map((n:{id:string})=>n.id)}});
    const next=await app.inject({method:'GET',url:'/achievements/notifications',headers});
    expect(next.json().notifications).toHaveLength(1);
    expect(next.json().highlightTasks).toBe(false);
  });

});
