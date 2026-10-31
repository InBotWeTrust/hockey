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

describe.skipIf(!hasIntegrationEnv)('novice funnel', () => {
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



  it('accepts only client observations, uses authenticated ownership and deduplicates retries',async()=>{
    const id=await createUser(app);
    const headers={authorization:`Bearer ${await issueAccessToken(id)}`};
    const payload={event:'city_first_seen',sessionId:randomUUID()};
    expect((await app.inject({method:'POST',url:'/analytics/novice',payload})).statusCode).toBe(401);
    const first=await app.inject({method:'POST',url:'/analytics/novice',headers,payload});
    expect(first.statusCode).toBe(200);
    await app.inject({method:'POST',url:'/analytics/novice',headers,payload:{...payload,sessionId:randomUUID()}});
    expect((await app.pg.query("select * from event_log where user_id=$1 and type='novice_funnel'",[id])).rows).toHaveLength(1);
    expect((await app.inject({method:'POST',url:'/analytics/novice',headers,payload:{...payload,event:'achievement_claimed'}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/analytics/novice',headers,payload:{...payload,userId:randomUUID()}})).statusCode).toBe(400);
  });
  it('records exercise and achievement lifecycle once, with server timestamps and version',async()=>{
    const id=await createUser(app);
    await app.pg.query("insert into initial_training_completion(user_id,exercise_key,reward_stars,reward_experience) values($1,'first-shot',1,1)",[id]);
    await app.pg.query("insert into user_achievements(user_id,achievement_id,completed_at) values($1,'hockey-school',now())",[id]);
    await app.pg.query("update user_achievements set claimed_at=now() where user_id=$1 and achievement_id='hockey-school'",[id]);
    await app.pg.query("update user_achievements set claimed_at=claimed_at where user_id=$1",[id]);
    const rows=(await app.pg.query("select payload from event_log where user_id=$1 and type='novice_funnel'",[id])).rows;
    expect(rows.map(r=>r.payload.event).sort()).toEqual(['achievement_claimed','achievement_unlocked','novice_exercise_completed'].sort());
    expect(rows.every(r=>r.payload.scenario_version==='novice-start-v1')).toBe(true);
  });
  it('offers the yard hint once across concurrent requests and never to preserved amateurs',async()=>{
    const id=await createUser(app);
    const headers={authorization:`Bearer ${await issueAccessToken(id)}`};
    const results=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:'/analytics/novice/yard-hint',headers})));
    expect(results.map(r=>r.json().show).sort()).toEqual([false,true]);
    const amateur=await createUser(app);
    await app.pg.query('update users set amateur_access_preserved=true where id=$1',[amateur]);
    expect((await app.inject({method:'POST',url:'/analytics/novice/yard-hint',headers:{authorization:`Bearer ${await issueAccessToken(amateur)}`}})).json().show).toBe(false);
  });
  it('records starts and normal closes, excludes day-end and emits promotion once',async()=>{
    const id=await createUser(app);
    const pool=(await app.pg.query("insert into day_pool(user_id,day_date,state,game_core_version,daily_seed) values($1,current_date,'idle',117,'test') returning id",[id])).rows[0].id;
    await app.pg.query("update day_pool set state='period_active',current_period=1,period_started_at=now() where id=$1",[pool]);
    await app.pg.query("update day_pool set state=state where id=$1",[pool]);
    await app.pg.query("insert into period_log(day_pool_id,period_number,started_at,ended_at,shots_taken,goals,closed_reason) values($1,1,now()-interval '20 minutes',now(),5,2,'timeout')",[pool]);
    await app.pg.query("update day_pool set current_period=2,period_started_at=now() where id=$1",[pool]);
    await app.pg.query("insert into period_log(day_pool_id,period_number,started_at,ended_at,shots_taken,goals,closed_reason) values($1,3,now()-interval '20 minutes',now(),5,2,'day_end')",[pool]);
    await app.pg.query("update game_settings set value='100'::jsonb where key='amateur.unlock_goals_required'");
    await app.pg.query('update users set daily_goals_total=100 where id=$1',[id]);
    await app.pg.query('update users set daily_goals_total=101 where id=$1',[id]);
    const events=(await app.pg.query("select payload->>'event' as name from event_log where user_id=$1 and type='novice_funnel'",[id])).rows.map(r=>r.name);
    expect(events.filter(n=>n==='daily_first_period_started')).toHaveLength(1);
    expect(events).toContain('daily_second_period_started');
    expect(events).toContain('daily_first_period_completed');
    expect(events).not.toContain('daily_day_completed');
    expect(events.filter(n=>n==='novice_promoted_to_amateur')).toHaveLength(1);
  });
  it('rolls back lifecycle analytics together with the source transaction',async()=>{
    const id=await createUser(app),conn=await app.pg.connect();
    try{
      await conn.query('begin');
      await conn.query("insert into initial_training_completion(user_id,exercise_key,reward_stars,reward_experience) values($1,'first-shot',1,1)",[id]);
      await conn.query('rollback');
    }finally{conn.release();}
    expect((await app.pg.query("select 1 from event_log where user_id=$1 and type='novice_funnel'",[id])).rowCount).toBe(0);
  });

  it('records a first period created directly as active',async()=>{
    const id=await createUser(app);
    await app.pg.query("insert into day_pool(user_id,day_date,state,current_period,period_started_at,game_core_version,daily_seed) values($1,current_date,'period_active',1,now(),117,'test')",[id]);
    const rows=(await app.pg.query("select 1 from novice_funnel_events where player_id=$1 and event='daily_first_period_started'",[id])).rows;
    expect(rows).toHaveLength(1);
  });

  it('records natural onboarding completion but excludes previews and duplicate completion',async()=>{
    const id=await createUser(app);
    await app.pg.query("insert into onboarding_chain(key) values('beginner') on conflict do nothing");
    const version=(await app.pg.query("insert into onboarding_version(chain_key,status) values('beginner','draft') returning id")).rows[0].id;
    for(const source of ['preview','natural']){
      const run=(await app.pg.query("insert into onboarding_run(user_id,chain_key,version_id,client_session_id,source) values($1,'beginner',$2,$3,$4) returning id",[id,version,randomUUID(),source])).rows[0].id;
      await app.pg.query('update onboarding_run set completed_at=now() where id=$1',[run]);
      await app.pg.query('update onboarding_run set completed_at=completed_at where id=$1',[run]);
    }
    const rows=(await app.pg.query("select details from novice_funnel_events where player_id=$1 and event='onboarding_completed'",[id])).rows;
    expect(rows).toEqual([{details:{chain:'beginner',onboarding_version:version}}]);
  });

});
