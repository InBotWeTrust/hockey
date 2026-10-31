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

describe.skipIf(!hasIntegrationEnv)('city tour', () => {
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




 it('offers once, preserves viewed places and never treats entering the yard as playing',async()=>{
  const id=await createUser(app);await app.pg.query('update users set beginner_onboarding_completed=true where id=$1',[id]);
  const headers={authorization:`Bearer ${await issueAccessToken(id)}`};
  const post=(url:string,payload?:object)=>app.inject({method:'POST',url,headers,...(payload?{payload}:{})});
  const opens=await Promise.all([post('/city-tour/open'),post('/city-tour/open')]);
  expect(opens.map(r=>r.json().autoShow).sort()).toEqual([false,true]);
  expect((await post('/city-tour/action',{action:'view',location:'bar'})).json().viewed).toContain('bar');
  await post('/city-tour/action',{action:'dismiss'});
  const resumed=(await post('/city-tour/open')).json();
  expect(resumed).toMatchObject({autoShow:false,lastLocation:'bar',gameStarted:false,eligible:true});
  expect((await post('/city-tour/action',{action:'view',location:'secret',userId:randomUUID()})).statusCode).toBe(400);
  await app.pg.query("insert into day_pool(user_id,day_date,state,current_period,period_started_at,game_core_version,daily_seed) values($1,current_date,'period_active',1,now(),117,'test')",[id]);
  expect((await post('/city-tour/open')).json()).toMatchObject({autoShow:false,gameStarted:true,eligible:false});
 });
 it('merges concurrent views, completes only after all locations and isolates users',async()=>{
  const id=await createUser(app),other=await createUser(app);
  const headers={authorization:`Bearer ${await issueAccessToken(id)}`};
  await app.inject({method:'POST',url:'/city-tour/open',headers});
  const action=(payload:object)=>app.inject({method:'POST',url:'/city-tour/action',headers,payload});
  expect((await action({action:'finish'})).json().completed).toBe(false);
  const locations=['yard','locker','shop','tasks','chat','bank','stadium','gym','bar','fame','bonus','pro','profile'];
  await Promise.all(locations.map(location=>action({action:'view',location})));
  const completed=(await action({action:'finish'})).json();
  expect(completed.completed).toBe(true);expect(completed.viewed).toHaveLength(locations.length);
  const isolated=await app.inject({method:'POST',url:'/city-tour/open',headers:{authorization:`Bearer ${await issueAccessToken(other)}`}});
  expect(isolated.json().viewed).toEqual([]);
  expect((await app.inject({method:'POST',url:'/city-tour/open'})).statusCode).toBe(401);
 });
});
