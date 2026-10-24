import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { fetchTrophyDetails } from '../../src/profile/summary.js';
it('loads progress for a page of challenge awards in one batch instead of one request per week',async()=>{
 const query=vi.fn(async(sql:string)=>({rows: sql.includes('jsonb_agg') ? Array.from({length:20},(_,i)=>({id:String(i),title:'Неделя',start_at:new Date('2026-01-01'),end_at:new Date('2026-01-08'),tasks:[{title:'Шайбы',type:'goals_scored',target:3}]})) : Array.from({length:20},(_,i)=>({window_index:String(i+1),goals:'4'}))}));
 const result=await fetchTrophyDetails({query} as unknown as Pool,'player',{section:'completedChallenges',limit:20,offset:0});
 expect(query).toHaveBeenCalledTimes(2);
 expect(result.completedChallenges).toHaveLength(20);
 expect(result.completedChallenges[0]?.tasks[0]?.progress).toBe(4);
});

it.skipIf(!process.env.TEST_DATABASE_URL)('matches scalar progress for multiple date ranges in PostgreSQL',async()=>{
 const {Pool}=await import('pg');
 const {fetchWeeklyChallengeProgress,fetchWeeklyChallengeProgressBatch}=await import('../../src/weeklyChallenge/progress.js');
 const db=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path=performance_trophy_batch -c timezone=UTC'});
 try{
  await db.query('create schema performance_trophy_batch');
  await db.query(`
   create table shot_session(user_id text,server_result text,mode text,created_at timestamptz);
   create table amateur_duel_participant(user_id text,state text,match_id int);
   create table amateur_duel_match(id int,status text,winner_user_id text,settled_at timestamptz,updated_at timestamptz);
   create table event_log(type text,payload jsonb,created_at timestamptz);
   create table training_session(user_id text,state text,closed_at timestamptz,started_at timestamptz);
   create table channel_post_comments(author_id text,is_deleted boolean,post_message_id int,created_at timestamptz);
   insert into shot_session values ('player','goal','daily','2026-01-02'),('other','goal','daily','2026-01-02'),('player','goal','bonus','2026-01-02'),('player','goal','daily','2026-01-08');
   insert into training_session values ('player','closed','2026-01-03','2026-01-03');
   insert into channel_post_comments values ('player',false,1,'2026-01-04'),('player',false,1,'2026-01-05'),('player',true,2,'2026-01-04');
  `);
  const ranges=[{from:new Date('2026-01-01Z'),to:new Date('2026-01-08Z')},{from:new Date('2026-01-08Z'),to:new Date('2026-01-15Z')}];
  const batch=await fetchWeeklyChallengeProgressBatch(db,'player',ranges);
  expect(batch.map(item=>item.goals_scored)).toEqual([1,1]);
  expect(batch[0]).toMatchObject({trainings_completed:1,channel_posts_commented:1});
  for(const [index,range] of ranges.entries())expect(batch[index]).toEqual(await fetchWeeklyChallengeProgress(db,{userId:'player',...range}));
 }finally{await db.query('drop schema if exists performance_trophy_batch cascade');await db.end();}
});
