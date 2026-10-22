import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll,afterAll,it,expect} from 'vitest';
import type {Pool} from 'pg';
import {deriveShotSeed,getSessionPhaseOffsets,resolvePerspectiveCourtShot,projectRhythm,STICK_NEUTRAL,GOAL_OPENING,PUCK_START,countRhythmBoardContacts} from '@hockey/game-core';
import {createTestPool,hasIntegrationEnv,resetDatabase} from '../helpers/testDb.js';
import {applyMigrations} from '../../src/db/migrations.js';
import {findOrCreateTelegramUser} from '../../src/auth/users.js';
import {startOrResumeBonusAttempt,acknowledgeBonusPreview,startBonusPeriod,submitBonusShot,reconcileOwnedBonusAttempt} from '../../src/bonusGames/service.js';
import {buildBonusGoalieConfig} from '../../src/bonusGames/types.js';
import {listBonusRecords} from '../../src/bonusGames/records.js';

let pool:Pool;
const now=new Date('2026-10-18T10:00:00Z');
beforeAll(async()=>{if(!hasIntegrationEnv)return;pool=createTestPool();await resetDatabase(pool);await applyMigrations(pool,path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../db/migrations'));});
afterAll(async()=>{await pool?.end();});
it.skipIf(!hasIntegrationEnv)('seeds ten immutable levels with Classic speeds and matching rewards',async()=>{
 const rows=(await pool.query("select * from bonus_game where skill_code='rhythm' order by sort_order")).rows;
 expect(rows.map(r=>r.qualification_rules.minimumSeries)).toEqual([2,2,3,3,4,4,5,5,6,7]);
 expect(rows.map(r=>r.title)).toEqual(['Северная Каролина','Коламбус','Баффало','Майами','Оттава','Тампа','Сент-Луис','Миннесота','Анахайм','Сан-Хосе']);
 expect(rows.every(r=>r.slug.startsWith('rhythm-')&&r.preview_artwork_url.includes('/bonus-games/nhl-cities/previews/'))).toBe(true);
 expect(rows.map(r=>r.target_goals)).toEqual([20,24,28,32,36,40,44,48,52,56]);
 const classic=(await pool.query("select p from amateur_duel_template t cross join lateral jsonb_array_elements(t.period_speed_presets) p where duel_kind='classic' and deleted_at is null and p->>'periodNumber'='1' order by is_active desc,created_at desc limit 1")).rows[0].p;
 for(const r of rows){expect(r.period_rules[0].puckSpeedPerMs).toBe(1.25);expect(r.qualification_rules.boardContactLimit).toBe(3);expect(r.qualification_rules.breakOnMiss).toBe(true);expect(r.use_inventory).toBe(false);expect(r.period_rules[0].durationMs).toBe(180000);expect(r.period_rules[0].shooterFrequency).toBe(classic.shooterFrequency);}
});
it.skipIf(!hasIntegrationEnv)('validates real shots, counts threshold series, breaks series on misses and settles once',async()=>{
 const user=await findOrCreateTelegramUser(pool,{providerUid:'local-bonus-rhythm-regression',displayName:'Local Rhythm'});
 await pool.query('update users set level=2 where id=$1',[user.id]);
 const game=(await pool.query("select id from bonus_game where skill_code='rhythm' order by sort_order limit 1")).rows[0];
 const a=await startOrResumeBonusAttempt(pool,{userId:user.id,gameId:game.id,now,seedSecret:'local-rhythm-regression-seed'});
 await acknowledgeBonusPreview(pool,{userId:user.id,attemptId:a.attempt.id,now,dismissFuture:false});
 let state=await startBonusPeriod(pool,{userId:user.id,attemptId:a.attempt.id,now,dailyAttemptLimit:100});
 const rule=state.rules.periods[0]!;
 const goalie=buildBonusGoalieConfig(state.rules.slug,state.rules.title,rule);
 const flight=(PUCK_START.y-GOAL_OPENING.y)/rule.puckSpeedPerMs;
 let t=0;const history:Array<{travel:number;boardContacts:number;goal:boolean}>=[];
 let duplicateChecked=false;
 for(let index=1;index<=100 && state.status==='active';index++){
  t+=flight+20;
  // Alternate goals/misses without supplying outcomes to the server.
  const wanted=index%4===0?'miss':'goal';
  const seed=deriveShotSeed(state.attemptSeed,1,index);
  let shotInput;
  let result;
  for(let offset=0;offset<3000;offset+=5){
   const tapTime=t+offset;const motion=tapTime-(index-1)*flight;
   const input={tapTime,shooterTapTime:motion,shooterMotionTime:motion,puckSpeedPerMs:rule.puckSpeedPerMs,shooterFrequency:rule.shooterFrequency,goalieFrequency:rule.goalieFrequency,goalFrequency:rule.goalFrequency};
   const resolved=resolvePerspectiveCourtShot(input,goalie,seed,index,STICK_NEUTRAL,getSessionPhaseOffsets(state.attemptSeed));
   if(resolved.type===wanted){shotInput=input;result=resolved.type;break;}
  }
  if(!shotInput||!result)throw new Error('no deterministic shot found');
  t=shotInput.tapTime;
  const request={userId:user.id,attemptId:state.id,claimedShotIndex:index,input:shotInput,claimedResult:result,now:new Date(now.getTime()+t+(index-1)*1000)};
  const response=await submitBonusShot(pool,request);state=response.attempt;
  history.push({travel:shotInput.shooterMotionTime*rule.shooterFrequency*2/1000,boardContacts:countRhythmBoardContacts(shotInput.shooterMotionTime,rule.shooterFrequency,getSessionPhaseOffsets(state.attemptSeed).shooter),goal:result==='goal'});
  const projected=projectRhythm({shots:history,travel:history.at(-1)!.travel,minimumSeries:2,breakOnMiss:true,boardContactLimit:3,currentBoardContacts:history.at(-1)!.boardContacts});
  expect(state.totalPoints).toBe(projected.score);
  expect(state.currentGoalStreak).toBe(projected.currentSeries);
  expect(state.goals).toBe(history.filter(s=>s.goal).length);
  if(!duplicateChecked){const retry=await submitBonusShot(pool,request);expect(retry.attempt.shotsTaken).toBe(index);duplicateChecked=true;}
 }
 expect(state.status).toBe('completed');
 expect(state.record).not.toBeNull();
 const records=await listBonusRecords(pool,user.id,game.id,0);
 expect(records.currentUser.bestSeries).toBe(state.bestGoalStreak);
 expect(records.currentUser.points).toBe(state.totalPoints);
 const resultRows=await pool.query('select count(*)::int n from bonus_game_record_result where attempt_id=$1',[state.id]);
 expect(resultRows.rows[0].n).toBe(1);
});

it.skipIf(!hasIntegrationEnv)('settles a timely final goal after the siren and rejects shots started after it',async()=>{
 const game=(await pool.query("select id from bonus_game where skill_code='rhythm' order by sort_order limit 1")).rows[0];
 await pool.query("update bonus_game set qualification_rules=jsonb_set(qualification_rules,'{targetPoints}','2'),target_goals=2 where id=$1",[game.id]);
 const u=await findOrCreateTelegramUser(pool,{providerUid:'rhythm-last-shot-local',displayName:'Local final shot'});await pool.query('update users set level=2 where id=$1',[u.id]);
 const created=await startOrResumeBonusAttempt(pool,{userId:u.id,gameId:game.id,now,seedSecret:'local-final-shot-rhythm'});
 // A random attempt UUID changes the phase and can leave this narrow siren window without a goal.
 // Pin only the test fixture seed; shots are still resolved and validated by the real service.
 await pool.query('update bonus_game_attempt set attempt_seed=$2 where id=$1',[created.attempt.id,'0'.repeat(63)+'1']);
 await acknowledgeBonusPreview(pool,{userId:u.id,attemptId:created.attempt.id,now,dismissFuture:false});
 const state=await startBonusPeriod(pool,{userId:u.id,attemptId:created.attempt.id,now,dailyAttemptLimit:100});
 const rule=state.rules.periods[0]!;const flight=(PUCK_START.y-GOAL_OPENING.y)/rule.puckSpeedPerMs;
 const goalie=buildBonusGoalieConfig(state.rules.slug,state.rules.title,rule);
 function inputAt(tapTime:number,index:number){const motion=tapTime-(index-1)*flight;return {tapTime,shooterTapTime:motion,shooterMotionTime:motion,puckSpeedPerMs:rule.puckSpeedPerMs,shooterFrequency:rule.shooterFrequency,goalieFrequency:rule.goalieFrequency,goalFrequency:rule.goalFrequency};}
 function isGoal(t:number,index:number){return resolvePerspectiveCourtShot(inputAt(t,index),goalie,deriveShotSeed(state.attemptSeed,1,index),index,STICK_NEUTRAL,getSessionPhaseOffsets(state.attemptSeed)).type==='goal';}
 let first=0,second=0;
 for(let t2=178990;t2>=178000&&!second;t2-=5)if(isGoal(t2,2))for(let t1=t2-flight-20;t1>t2-flight-1200;t1-=5)if(isGoal(t1,1)){first=t1;second=t2;break;}
 expect(second).toBeGreaterThan(0);
 await submitBonusShot(pool,{userId:u.id,attemptId:state.id,claimedShotIndex:1,input:inputAt(first,1),claimedResult:'goal',now:new Date(now.getTime()+first)});
 const finalRequest={userId:u.id,attemptId:state.id,claimedShotIndex:2,input:inputAt(second,2),claimedResult:'goal' as const,now:new Date(now.getTime()+180200)};
 const pending=await reconcileOwnedBonusAttempt(pool,{userId:u.id,attemptId:state.id,now:new Date(now.getTime()+180100)});
 expect(pending.status).toBe('active');
 const result=await submitBonusShot(pool,finalRequest);
 expect(result.attempt.status).toBe('completed');expect(result.attempt.totalPoints).toBe(2);
 expect(result.attempt.record!.elapsedMs).toBeCloseTo(second+1000,0);
 expect((await submitBonusShot(pool,finalRequest)).attempt.shotsTaken).toBe(2);
 const lateUser=await findOrCreateTelegramUser(pool,{providerUid:'rhythm-too-late-local',displayName:'Local late shot'});await pool.query('update users set level=2 where id=$1',[lateUser.id]);
 const late=await startOrResumeBonusAttempt(pool,{userId:lateUser.id,gameId:game.id,now,seedSecret:'local-late-shot-rhythm'});
 await acknowledgeBonusPreview(pool,{userId:lateUser.id,attemptId:late.attempt.id,now,dismissFuture:false});
 await startBonusPeriod(pool,{userId:lateUser.id,attemptId:late.attempt.id,now,dailyAttemptLimit:100});
 await expect(submitBonusShot(pool,{userId:lateUser.id,attemptId:late.attempt.id,claimedShotIndex:1,input:inputAt(180001,1),claimedResult:'miss',now:new Date(now.getTime()+180100)})).rejects.toMatchObject({code:'bonus_period_not_ready'});
 expect((await reconcileOwnedBonusAttempt(pool,{userId:lateUser.id,attemptId:late.attempt.id,now:new Date(now.getTime()+192001)})).status).toBe('failed');

});
