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

describe.skipIf(!hasIntegrationEnv)('novice push prompt', () => {
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


  it('snoozes for seven days and remembers a handled permission separately',async()=>{
    const id=await createUser(app), other=await createUser(app);
    const headers={authorization:`Bearer ${await issueAccessToken(id)}`};
    const get=()=>app.inject({method:'GET',url:'/push/novice-prompt',headers});
    expect((await get()).json()).toMatchObject({eligible:true});
    const snooze=await app.inject({method:'POST',url:'/push/novice-prompt',headers,payload:{action:'snooze'}});
    expect(snooze.statusCode).toBe(200);
    expect((await get()).json()).toMatchObject({eligible:false});
    const remaining=await app.pg.query(`select extract(epoch from (novice_push_snoozed_until-now())) as seconds from users where id=$1`,[id]);
    expect(Number(remaining.rows[0].seconds)).toBeGreaterThan(604790);
    expect(Number(remaining.rows[0].seconds)).toBeLessThanOrEqual(604800);
    await app.pg.query(`update users set novice_push_snoozed_until=now()-interval '1 second' where id=$1`,[id]);
    expect((await get()).json()).toMatchObject({eligible:true});
    await app.inject({method:'POST',url:'/push/novice-prompt',headers,payload:{action:'handled'}});
    expect((await get()).json()).toMatchObject({eligible:false});
    expect((await app.inject({method:'GET',url:'/push/novice-prompt',headers:{authorization:`Bearer ${await issueAccessToken(other)}`}})).json()).toMatchObject({eligible:true});
    expect((await app.inject({method:'GET',url:'/push/novice-prompt'})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:'/push/novice-prompt',headers,payload:{action:'reset'}})).statusCode).toBe(400);
  });
});
