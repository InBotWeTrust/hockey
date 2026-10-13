import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, createTestRedis, getTestUrls, hasIntegrationEnv, resetDatabase, resetRedis } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('fans and subscription-scoped activity', () => {
  let app: FastifyInstance;
  const secret = 'fans-test-secret-at-least-16';
  const jwt = createJwt({ accessSecret: secret, refreshSecret: secret });
  async function user(name: string, official = false) {
    const id = randomUUID();
    await app.pg.query("insert into users(id,display_name,timezone,account_kind) values($1,$2,'Europe/Moscow',$3)", [id,name,official ? 'official' : 'player']);
    return { id, token: await jwt.issueAccessToken({ sub: id }) };
  }
  async function request(actor: { token: string }, method: 'GET' | 'PUT' | 'DELETE', url: string) {
    return app.inject({ method, url, headers: { authorization: `Bearer ${actor.token}` } });
  }
  beforeAll(async () => {
    const pool = createTestPool(); await resetDatabase(pool);
    await applyMigrations(pool, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations'));
    await pool.end(); const redis = createTestRedis(); await resetRedis(redis); redis.disconnect();
    const urls = getTestUrls();
    app = await buildApp({ config: { NODE_ENV:'test', HOST:'127.0.0.1', PORT:3000, LOG_LEVEL:'warn', DATABASE_URL:urls.databaseUrl, REDIS_URL:urls.redisUrl, JWT_SECRET:secret, REFRESH_SECRET:secret, TELEGRAM_BOT_TOKEN:'111:test', DAILY_SEED_SECRET:secret }, pushSchedulerEnabled:false, pushWorkerEnabled:false, tournamentLifecycleEnabled:false, monthlyRatingLifecycleEnabled:false, duelFightWorkerEnabled:false });
  });
  afterAll(async () => { await app?.close(); });
  it('persists feed reads per viewer and keeps events arriving after the read-all snapshot unread',async()=>{
    const owner=await user('Read owner'),fan=await user('Read fan'),other=await user('Read other');
    await request(fan,'PUT',`/users/${owner.id}/fan`);
    const status=await request(owner,'GET','/social/feed/unread');
    expect(status.statusCode).toBe(200);expect(status.json().hasUnread).toBe(true);expect(status.json().unreadCount).toBe(1);
    const feed=(await request(owner,'GET','/social/feed')).json();
    expect(feed.items[0].unread).toBe(true);
    const read=(payload:unknown)=>app.inject({method:'POST',url:'/social/feed/read',headers:{authorization:`Bearer ${owner.token}`},payload});
    const foreign=await app.inject({method:'POST',url:'/social/feed/read',headers:{authorization:`Bearer ${other.token}`},payload:{ids:[feed.items[0].id]}});
    expect(foreign.statusCode).toBe(404);
    expect((await read({ids:[feed.items[0].id]})).statusCode).toBe(200);
    expect((await read({ids:[feed.items[0].id]})).statusCode).toBe(200);
    expect((await request(owner,'GET','/social/feed/unread')).json().hasUnread).toBe(false);
    const eventId=randomUUID();
    await request(owner,'PUT',`/users/${fan.id}/fan`);
    await app.pg.query("update user_follows set created_at=now()-interval '2 days' where follower_id=$1 and player_id=$2",[owner.id,fan.id]);
    await app.pg.query("insert into social_activity(id,source_key,kind,occurred_at,data) values($1,$2,'training',now()-interval '1 day','{}')",[eventId,eventId]);
    await app.pg.query('insert into social_activity_actor(activity_id,user_id) values($1,$2)',[eventId,fan.id]);
    expect((await request(owner,'GET','/social/feed/unread')).json().hasUnread).toBe(true);
    expect((await request(owner,'GET','/social/feed')).json().items.find((e:{id:string})=>e.id===eventId).unread).toBe(true);
    expect((await read({ids:[eventId]})).statusCode).toBe(200);
    await request(other,'PUT',`/users/${owner.id}/fan`);
    expect((await read({through:status.json().asOf})).statusCode).toBe(200);
    expect((await request(owner,'GET','/social/feed/unread')).json().hasUnread).toBe(true);
    const current=(await request(owner,'GET','/social/feed/unread')).json();
    expect((await read({through:current.asOf})).statusCode).toBe(200);
    expect((await read({through:status.json().asOf})).statusCode).toBe(200);
    expect((await request(owner,'GET','/social/feed/unread')).json().hasUnread).toBe(false);
    expect((await read({through:'2099-01-01T00:00:00Z'})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/social/feed/read',payload:{ids:[]}})).statusCode).toBe(401);
  });
  it('saves biography with the existing profile endpoint and keeps names on bio-only updates',async()=>{
    const owner=await user('Settings owner');
    const patch=(payload:unknown)=>app.inject({method:'PATCH',url:'/me',headers:{authorization:`Bearer ${owner.token}`},payload});
    expect((await patch({customFirstName:'Иван',customLastName:'Петров',bio:' Хоккей '})).statusCode).toBe(200);
    const result=await patch({bio:'🏒'.repeat(160)});
    expect(result.statusCode).toBe(200);expect(result.json().bio).toBe('🏒'.repeat(160));expect(result.json().displayName).toBe('Иван Петров');
    expect((await patch({bio:'🏒'.repeat(161)})).statusCode).toBe(400);
    await patch({bio:''});expect((await request(owner,'GET',`/users/${owner.id}/bio`)).json().bio).toBe('');
  });

  it('orders equal follower counts by registration and returns the viewer rank',async()=>{
    const older=await user('Older'),newer=await user('Newer');
    await app.pg.query("update users set created_at=case when id=$1 then '2020-01-01'::timestamptz else '2021-01-01'::timestamptz end where id=any($2::uuid[])",[older.id,[older.id,newer.id]]);
    const result=(await request(newer,'GET','/social/fans/rating')).json();
    expect(result.items.findIndex((p:{id:string})=>p.id===older.id)).toBeLessThan(result.items.findIndex((p:{id:string})=>p.id===newer.id));
    expect(result.currentUser.id).toBe(newer.id);
    expect(new Set(result.items.map((p:{place:number})=>p.place)).size).toBe(result.items.length);
  });
  it('merges personal membership history with game events without exposing it to others',async()=>{
    const owner=await user('Private owner'),fan=await user('Private fan'),other=await user('Unrelated');
    await request(fan,'PUT',`/users/${owner.id}/fan`);
    const items=(await request(owner,'GET','/social/feed')).json().items;
    expect(items.some((e:{kind:string;actors:Array<{id:string}>})=>e.kind==='membership'&&e.actors[0]?.id===fan.id)).toBe(true);
    expect((await request(other,'GET','/social/feed')).json().items.some((e:{kind:string})=>e.kind==='membership')).toBe(false);
  });

  it('shares reactions, serializes replacements and revokes access after unfollow',async()=>{
    const owner=await user('Reaction owner'),a=await user('Viewer A'),b=await user('Viewer B');
    await request(a,'PUT',`/users/${owner.id}/fan`);await request(b,'PUT',`/users/${owner.id}/fan`);
    await app.pg.query("select social_record_activity($1,'initial_course',now(),$2::uuid[],'{}'::jsonb)",[randomUUID(),[owner.id]]);
    const event=(await request(a,'GET','/social/feed')).json().items[0];
    const react=(actor:typeof a,emoji:string,method:'PUT'|'DELETE'='PUT')=>app.inject({method,url:`/social/events/${event.id}/reaction`,headers:{authorization:`Bearer ${actor.token}`},payload:{emoji}});
    expect((await react(a,'🔥')).statusCode).toBe(200);await react(b,'🔥');
    expect((await request(b,'GET','/social/feed')).json().items[0].reactions).toEqual([{emoji:'🔥',count:2,reactedByMe:true}]);
    await Promise.all([react(a,'👏'),react(a,'❤️')]);
    expect((await app.pg.query('select * from social_activity_reaction where activity_id=$1 and user_id=$2',[event.id,a.id])).rows).toHaveLength(1);
    await react(a,'👏');await react(a,'👏','DELETE');await react(a,'👏','DELETE');
    expect((await react(a,'invalid')).statusCode).toBe(400);
    await react(a,'🔥');await request(a,'DELETE',`/users/${owner.id}/fan`);
    expect((await react(a,'👏')).statusCode).toBe(404);
    expect((await request(a,'GET',`/social/events/${event.id}`)).statusCode).toBe(404);
    expect((await request(b,'GET','/social/feed')).json().items[0].reactions[0].count).toBe(2);
  });

  it('saves only the authenticated bio, validates 160 characters and exposes plain text',async()=>{
    const owner=await user('Bio owner'),other=await user('Other');
    const put=(bio:string,token=owner.token)=>app.inject({method:'PUT',url:'/me/bio',headers:{authorization:`Bearer ${token}`},payload:{bio}});
    expect((await put('🏒'.repeat(160))).statusCode).toBe(200);
    expect((await put('🏒'.repeat(161))).statusCode).toBe(400);
    expect((await request(other,'GET',`/users/${owner.id}/bio`)).json().bio).toBe('🏒'.repeat(160));
    expect((await request(owner,'GET',`/users/${other.id}/bio`)).json().bio).toBe('');
    expect((await app.inject({method:'PUT',url:'/me/bio',payload:{bio:'Forbidden'}})).statusCode).toBe(401);
    expect((await put('  <script>text</script>\nХоккей  ')).json().bio).toBe('<script>text</script>\nХоккей');
    expect((await put('')).json().bio).toBe('');
  });

  it('makes concurrent follows idempotent, records real transitions and retains milestones', async () => {
    const a = await user('Fan'), b = await user('Player');
    const results = await Promise.all(Array.from({ length: 6 }, () => request(a,'PUT',`/users/${b.id}/fan`)));
    expect(results.map(r=>r.statusCode)).toEqual(Array(6).fill(200));
    expect(results[0]!.json()).toMatchObject({ following:true, followersCount:1 });
    expect((await request(b,'GET','/me/fan-history')).json().items).toHaveLength(1);
    const achievements = await app.pg.query("select achievement_id from user_achievements where user_id=$1 and achievement_id='fans-1'",[b.id]);
    expect(achievements.rowCount).toBe(1);
    await request(a,'DELETE',`/users/${b.id}/fan`);
    await request(a,'DELETE',`/users/${b.id}/fan`);
    expect((await request(b,'GET','/me/fan-history')).json().items.map((e:{ action:string })=>e.action)).toEqual(['unfollow','follow']);
    expect((await request(a,'GET',`/users/${b.id}/fans/summary`)).json()).toMatchObject({ following:false, followersCount:0 });
    expect((await app.pg.query("select 1 from user_achievements where user_id=$1 and achievement_id='fans-1'",[b.id])).rowCount).toBe(1);
  });

  it('rejects anonymous, self and official subscriptions and keeps private history private', async () => {
    const a=await user('Reader'), official=await user('Official',true);
    expect((await app.inject({method:'PUT',url:`/users/${a.id}/fan`})).statusCode).toBe(401);
    expect((await request(a,'PUT',`/users/${a.id}/fan`)).statusCode).toBe(400);
    expect((await request(a,'PUT',`/users/${official.id}/fan`)).statusCode).toBe(400);
    expect((await request(a,'GET',`/users/${official.id}/fan-history`)).statusCode).toBe(404);
  });

  it('enforces follow start on feed and details, then revokes access and resets on refollow', async () => {
    const a=await user('Viewer'), b=await user('Athlete');
    const event = async (key:string, when:string) => (await app.pg.query("select social_record_activity($1,'training',$2::timestamptz,$3::uuid[], $4::jsonb) as id",[key,when,[b.id],JSON.stringify({title:'Завершил тренировку',goals:20,shots:50})])).rows[0].id as string;
    const old=await event('training:old',new Date(Date.now()-60000).toISOString());
    await request(a,'PUT',`/users/${b.id}/fan`);
    const current=await event('training:new',new Date().toISOString());
    expect((await request(a,'GET','/social/feed')).json().items.map((e:{id:string})=>e.id)).toEqual([current]);
    expect((await request(a,'GET',`/social/events/${old}`)).statusCode).toBe(404);
    expect((await request(a,'GET',`/social/events/${current}`)).statusCode).toBe(200);
    await request(a,'DELETE',`/users/${b.id}/fan`);
    expect((await request(a,'GET',`/social/events/${current}`)).statusCode).toBe(404);
    await new Promise(resolve=>setTimeout(resolve,10));
    await request(a,'PUT',`/users/${b.id}/fan`);
    expect((await request(a,'GET','/social/feed')).json().items).toEqual([]);
    expect((await request(b,'GET',`/users/${b.id}/activity`)).json().items).toHaveLength(2);
  });

  it('deduplicates one match with two followed participants and paginates equal timestamps', async () => {
    const a=await user('Reader2'), b=await user('Home'), c=await user('Away');
    await request(a,'PUT',`/users/${b.id}/fan`); await request(a,'PUT',`/users/${c.id}/fan`);
    for(let i=0;i<52;i++) await app.pg.query("select social_record_activity($1,'duel',now(),$2::uuid[],'{}'::jsonb)",[`duel:page:${i}`,[b.id,c.id]]);
    const first=(await request(a,'GET','/social/feed')).json();
    expect(first.items).toHaveLength(50); expect(first.nextCursor).toBeTruthy();
    const second=(await request(a,'GET',`/social/feed?cursor=${encodeURIComponent(first.nextCursor)}`)).json();
    expect(second.items).toHaveLength(2);
    expect(new Set([...first.items,...second.items].map(e=>e.id)).size).toBe(52);
  });

  it('captures course completion, claimed rewards and computer cards from real persisted sources', async () => {
    const b=await user('Sources');
    const keys=['first-shot','three-positions','follow-the-goal','moving-goal','find-the-gap'];
    // Initial course currently has further position exercises; use the canonical exported keys.
    const { INITIAL_TRAINING_EXERCISE_KEYS } = await import('../../src/duel/training/initialCourse.js');
    const exerciseKeys=INITIAL_TRAINING_EXERCISE_KEYS;
    expect(exerciseKeys.length).toBeGreaterThanOrEqual(keys.length);
    for(const key of exerciseKeys) await app.pg.query('insert into initial_training_completion(user_id,exercise_key,reward_stars,reward_experience) values($1,$2,1,1)',[b.id,key]);
    await app.pg.query("insert into user_achievements(user_id,achievement_id,completed_at) values($1,'fans-1',now())",[b.id]);
    expect((await request(b,'GET',`/users/${b.id}/activity`)).json().items.map((e:{kind:string})=>e.kind)).toEqual(['initial_course']);
    const claim=await app.inject({method:'POST',url:'/achievements/fans-1/claim',headers:{authorization:`Bearer ${b.token}`}});
    expect(claim.statusCode).toBe(200);
    await app.pg.query("insert into bar_computer_card_history(id,user_id,character_id,result,started_at,ended_at,surrendered,caught_cheats) values($1,$2,'maria','loss',now()-interval '1 minute',now(),false,0)",[randomUUID(),b.id]);
    expect((await request(b,'GET',`/users/${b.id}/activity`)).json().items.map((e:{kind:string})=>e.kind)).toEqual(['bar_cards','achievement','initial_course']);
  });

  it('captures final daily and training results, but excludes unfinished rollover sessions',async()=>{
    const a=await user('DailyTraining'); const poolId=randomUUID();
    await app.pg.query("insert into day_pool(id,user_id,day_date,state,current_period,game_core_version,daily_seed) values($1,$2,current_date,'period_active',3,1,'seed')",[poolId,a.id]);
    for(let p=1;p<=3;p++) await app.pg.query("insert into period_log(day_pool_id,period_number,started_at,ended_at,shots_taken,goals,closed_reason) values($1,$2,now()-interval '1 minute',now(),30,20,'quota')",[poolId,p]);
    await app.pg.query("update day_pool set state='closed',closed_at=now() where id=$1",[poolId]);
    const t=randomUUID();await app.pg.query("insert into training_session(id,user_id,day_date,selected_period,state,game_core_version,training_seed,shots_limit) values($1,$2,current_date,1,'active',1,'seed',2)",[t,a.id]);
    await app.pg.query("insert into shot_session(user_id,mode,training_session_id,period_number,shot_index,seed,input_payload,server_result,game_core_version) select $1,'training',$2,1,i,'seed','{}','goal',1 from generate_series(1,2)i",[a.id,t]);
    await app.pg.query("update training_session set state='closed',closed_at=now() where id=$1",[t]);
    const events=(await request(a,'GET',`/users/${a.id}/activity`)).json().items;
    expect(events.map((e:{kind:string})=>e.kind)).toEqual(['training','daily']);
    expect(events[1].data.daily).toMatchObject({total_goals:60,total_shots:90});
    await app.pg.query("insert into training_session(user_id,day_date,selected_period,state,game_core_version,training_seed,closed_at,shots_limit) values($1,current_date-1,1,'closed',1,'partial',now(),50)",[a.id]);
    expect((await request(a,'GET',`/users/${a.id}/activity`)).json().items).toHaveLength(2);
  });

  it('publishes settled regular matches once with both actors',async()=>{
    const a=await user('TournamentHome'), b=await user('TournamentAway');
    const t=randomUUID(); await app.pg.query("insert into tournament(id,slug,title,regular_source,created_by) values($1,$2,'Fans Cup','head_to_head',$3)",[t,`fans-${t}`,a.id]);
    const home=randomUUID(),away=randomUUID();
    await app.pg.query("insert into tournament_participant(id,tournament_id,user_id,state) values($1,$2,$3,'approved'),($4,$2,$5,'approved')",[home,t,a.id,away,b.id]);
    const fixture=randomUUID(); await app.pg.query("insert into tournament_fixture(id,tournament_id,fixture_number,home_participant_id,away_participant_id,status) values($1,$2,1,$3,$4,'active')",[fixture,t,home,away]);
    await app.pg.query("update tournament_fixture set status='settled',home_score=32,away_score=29,outcome='home_win',winner_participant_id=$2,settled_at=now() where id=$1",[fixture,home]);
    await app.pg.query("update tournament_fixture set updated_at=now() where id=$1",[fixture]);
    const events=(await request(a,'GET',`/users/${a.id}/activity`)).json().items;
    expect(events).toHaveLength(1);expect(events[0].kind).toBe('regular');expect(events[0].actors).toHaveLength(2);
    expect(events[0].data.participants.map((p:{score:number})=>p.score)).toEqual([32,29]);
  });

  it('lets only the owner remove a fan, revokes access and permits a later refollow',async()=>{
    const fan=await user('RemovableFan'),owner=await user('Owner'),other=await user('OtherOwner');
    await request(fan,'PUT',`/users/${owner.id}/fan`);
    const event=(await app.pg.query("select social_record_activity($1,'training',clock_timestamp(),$2::uuid[],'{}') id",[`remove:${owner.id}`,[owner.id]])).rows[0].id;
    await request(other,'DELETE',`/me/fans/${fan.id}`);
    expect((await request(fan,'GET',`/social/events/${event}`)).statusCode).toBe(200);
    expect((await request(owner,'DELETE',`/me/fans/${fan.id}`)).statusCode).toBe(200);
    expect((await request(fan,'GET',`/social/events/${event}`)).statusCode).toBe(404);
    expect((await request(owner,'GET','/me/fan-history')).json().items[0].action).toBe('remove');
    expect((await request(fan,'PUT',`/users/${owner.id}/fan`)).statusCode).toBe(200);
    expect((await request(owner,'GET',`/users/${owner.id}/fans/summary`)).json().followersCount).toBe(1);
  });

  it('queues new-fan push once per rolling 24 hours and honors the preference',async()=>{
    const fan=await user('PushFan'),owner=await user('PushOwner');
    await app.pg.query("insert into push_subscriptions(user_id,endpoint,p256dh,auth) values($1,$2,'fixture-key','fixture-auth')",[owner.id,`https://example.invalid/push/${owner.id}`]);
    expect((await request(fan,'PUT',`/users/${owner.id}/fan`)).statusCode).toBe(200);
    const pushes=()=>app.pg.query("select payload from push_delivery_log where user_id=$1 and event_type='social.new_fan'",[owner.id]);
    expect((await pushes()).rows[0].payload).toMatchObject({title:'Новый болельщик',body:'PushFan теперь болеет за вас',url:`/profile?social=fans&fanId=${fan.id}`});
    await request(fan,'DELETE',`/users/${owner.id}/fan`);await request(fan,'PUT',`/users/${owner.id}/fan`);
    expect((await pushes()).rowCount).toBe(1);
    await app.pg.query("update fan_push_cooldown set last_queued_at=clock_timestamp()-interval '25 hours' where player_id=$1",[owner.id]);
    await request(fan,'DELETE',`/users/${owner.id}/fan`);await request(fan,'PUT',`/users/${owner.id}/fan`);
    expect((await pushes()).rowCount).toBe(2);
    await app.pg.query('insert into user_push_preferences(user_id,new_fans) values($1,false)',[owner.id]);
    const another=await user('MutedFan');await request(another,'PUT',`/users/${owner.id}/fan`);
    expect((await pushes()).rowCount).toBe(2);
  });

  it('captures advanced completion, the persisted bar restriction and all online card participants',async()=>{
    const a=await user('BarPlayer'),b=await user('CardOpponent'),c=await user('CardThird');
    const {ADVANCED_TRAINING_V2_EXERCISES}=await import('../../src/duel/training/advancedCourseV2.js');
    for(const e of ADVANCED_TRAINING_V2_EXERCISES) await app.pg.query('insert into advanced_training_v2_completion(user_id,exercise_key,reward_stars,reward_experience) values($1,$2,1,1)',[a.id,e.key]);
    const db=await app.pg.connect();const fight=randomUUID();
    try {await db.query('begin');await db.query("insert into bar_oleg_fights(id,user_id,runtime) values($1,$2,'{}')",[fight,a.id]);
     await db.query("update bar_oleg_fights set status='resolved',outcome='loss',ended_at=now() where id=$1",[fight]);
     await db.query("insert into bar_conflicts(user_id,day,blocked_until) values($1,current_date,now()+interval '2 hours')",[a.id]);await db.query('commit');
    } finally{db.release();}
    await app.pg.query('update bar_oleg_fights set acknowledged=true where id=$1',[fight]);
    const room=randomUUID();await app.pg.query("insert into bar_card_rooms(id,data) values($1,$2)",[room,JSON.stringify({seats:[a.id,b.id,c.id],status:'playing',game:{phase:'attack',status:['playing','playing','playing']}})]);
    await app.pg.query('update bar_card_rooms set ended_at=now(),data=$2 where id=$1',[room,JSON.stringify({seats:[a.id,b.id,c.id],status:'ended',game:{phase:'ended',status:['won','lost','won']}})]);
    const events=(await request(a,'GET',`/users/${a.id}/activity`)).json().items;
    expect(events.map((e:{kind:string})=>e.kind)).toEqual(['bar_cards','bar_fight','advanced_course']);
    expect(events[0].actors).toHaveLength(3);expect(events[0].data.participants.find((p:{userId:string})=>p.userId===b.id).outcome).toBe('loss');
    expect(events[1].data.blockedUntil).toBeTruthy();
  });

  it('freezes one playoff result per completed day with the cumulative series score',async()=>{
    const a=await user('PlayoffHome'),b=await user('PlayoffAway');const t=randomUUID();
    await app.pg.query("insert into tournament(id,slug,title,regular_source,created_by) values($1,$2,'Playoff Cup','head_to_head',$3)",[t,`playoff-${t}`,a.id]);
    const hp=randomUUID(),ap=randomUUID(),round=randomUUID(),series=randomUUID();
    await app.pg.query("insert into tournament_participant(id,tournament_id,user_id,state) values($1,$2,$3,'approved'),($4,$2,$5,'approved')",[hp,t,a.id,ap,b.id]);
    await app.pg.query("insert into tournament_round(id,tournament_id,stage,number,status) values($1,$2,'playoff',1,'open')",[round,t]);
    await app.pg.query("insert into tournament_playoff_series(id,tournament_id,round_id,bracket_position,higher_seed_participant_id,lower_seed_participant_id,wins_required,home_sequence,status) values($1,$2,$3,1,$4,$5,3,'[]','active')",[series,t,round,hp,ap]);
    const d1=randomUUID(),d2=randomUUID();
    for(const [id,day,max] of [[d1,1,2],[d2,2,1]] as const) await app.pg.query("insert into tournament_round_game_day(id,round_id,day_number,local_date,first_game_local_time,first_game_starts_at,max_result_bearing_games,readiness_duration,planned_start_interval,status) values($1,$2,$3,current_date+$3::int,'12:00',now(),$4,interval '5 minutes',interval '1 hour','open')",[id,round,day,max]);
    const game=async(n:number,day:string,winner:string,technical=false)=>{
     const db=await app.pg.connect();const f=randomUUID(),attempt=randomUUID();
     try{await db.query('begin');
      await db.query("insert into tournament_fixture(id,tournament_id,round_id,series_id,fixture_number,home_participant_id,away_participant_id,status) values($1,$2,$3,$4,$5,$6,$7,'active')",[f,t,round,series,n,hp,ap]);
      await db.query("insert into tournament_fixture_attempt(id,fixture_id,round_game_day_id,attempt_number,kind,status,scheduled_starts_at,readiness_expires_at,hard_deadline_at,is_result_bearing) values($1,$2,$3,1,'initial','active',now(),now()+interval '5 minutes',now()+interval '1 hour',true)",[attempt,f,day]);
      await db.query("update tournament_fixture set status=$2,home_score=30,away_score=25,winner_participant_id=$3,outcome=$4,settled_at=now() where id=$1",[f,technical?'forfeit':'settled',winner,winner===hp?'home_win':'away_win']);
      await db.query("update tournament_fixture_attempt set status=$2,winner_participant_id=$3,outcome=$4,home_score=30,away_score=25,settled_at=now() where id=$1",[attempt,technical?'technical_result':'settled',winner,technical?'home_no_show':winner===hp?'home_win':'away_win']);
      await db.query("update tournament_playoff_series set higher_seed_wins=higher_seed_wins+$2,lower_seed_wins=lower_seed_wins+$3 where id=$1",[series,winner===hp?1:0,winner===ap?1:0]);await db.query('commit');
     }finally{db.release();}
    };
    await game(1,d1,hp);
    expect((await request(a,'GET',`/users/${a.id}/activity`)).json().items).toHaveLength(0);
    await game(2,d1,ap,true);
    const dayOne=(await request(a,'GET',`/users/${a.id}/activity`)).json().items[0];
    expect(dayOne.data.seriesScore).toMatchObject({home:1,away:1});expect(dayOne.data.games).toHaveLength(2);
    await game(3,d2,hp);
    const events=(await request(a,'GET',`/users/${a.id}/activity`)).json().items;
    expect(events).toHaveLength(2);expect(events[0].data.seriesScore).toMatchObject({home:2,away:1});
    expect(events[1].data).toEqual(dayOne.data);
  });

  it('captures an ordinary duel in the player format and excludes tournament duels',async()=>{
    const a=await user('DuelA'),b=await user('DuelB');
    const duel=async(source:string)=>{
      const id=randomUUID();const db=await app.pg.connect();
      try{await db.query('begin');await db.query("insert into amateur_duel_match(id,challenger_user_id,opponent_user_id,status,source,rules_snapshot,match_seed,starts_at,ends_at,game_core_version) values($1,$2,$3,'active',$4,'{\"duelKind\":\"express\",\"totalPeriods\":1}','seed',now()-interval '1 minute',now()+interval '1 minute',1)",[id,a.id,b.id,source]);
       await db.query("insert into amateur_duel_participant(match_id,user_id,side,state,shots_taken,goals,active_duration_ms,result_points) values($1,$2,'challenger','completed',30,20,10000,3),($1,$3,'opponent','completed',30,15,11000,0)",[id,a.id,b.id]);
       await db.query("update amateur_duel_match set status='settled',outcome='challenger_win',winner_user_id=$2,settled_reason='completed',settled_at=now() where id=$1",[id,a.id]);await db.query('commit');
      }finally{db.release();} return id;
    };
    await duel('challenge');await duel('tournament');
    const events=(await request(a,'GET',`/users/${a.id}/activity`)).json().items;
    expect(events).toHaveLength(1);expect(events[0].data.format).toBe('express');
    expect(events[0].data.participants.map((p:{score:number})=>p.score)).toEqual([20,15]);
  });
});
