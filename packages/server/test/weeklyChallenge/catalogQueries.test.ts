import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { getWeeklyChallengeCatalog } from '../../src/weeklyChallenge/service.js';

it.each([0, 1, 100, 1000])('batches metadata and progress for %i catalog entries', async count => {
 const now = new Date('2026-10-24T12:00:00Z');
 const challenges = Array.from({length:count}, (_,i)=>({id:`c${i}`,title:`Challenge ${i}`,description:'',start_at:new Date('2026-10-01'),end_at:new Date('2026-10-08'),is_automatic:true,launched_at:new Date('2026-10-01'),reward_coins:10,reward_stars:1,reward_experience:1,reward_tokens:0}));
 const task = (id: string) => ({id:`task-${id}`,challenge_id:id,type:'goals_scored',title:null,target:2,sort_order:0,created_at:now});
 const progress = {goals:'3',played:'0',won:'0',invites:'0',completed:'0',commented_posts:'0'};
 const query = vi.fn(async (sql: string, params: unknown[]) => {
   if (sql.includes('from weekly_challenges challenge')) return {rows:challenges};
   if (sql.includes('from weekly_challenge_tasks')) return {rows:(Array.isArray(params[0]) ? params[0] : [params[0]]).map(id=>task(String(id)))};
   if (sql.includes('from weekly_challenge_reward_claims') || sql.includes('from weekly_challenge_participants')) return {rows:[]};
   if (sql.includes('select windows.ordinality')) return {rows:(params[1] as unknown[]).map(()=>progress)};
   if (sql.includes('with goal_progress')) return {rows:[progress]};
   throw new Error('Unexpected SQL');
 });
 const result = await getWeeklyChallengeCatalog({query} as unknown as Pool,'viewer',now);
 expect(result.completed).toHaveLength(count);
 if(count) expect(result.completed[0]).toMatchObject({allTasksCompleted:true,canClaimReward:true,tasks:[{progress:3,completed:true}]});
 expect(query).toHaveBeenCalledTimes(count === 1 ? 4 : 1 + 4 * Math.ceil(count / 50));
});

it('keeps claims and manual membership attached to the right challenge', async () => {
  const now = new Date('2026-10-24T12:00:00Z');
  const challenges = ['automatic','joined','unjoined','claimed'].map(id => ({
    id, title:id, description:'', start_at:new Date('2026-10-01'), end_at:new Date('2026-10-08'),
    is_automatic:id === 'automatic', launched_at:new Date('2026-10-01'),
    reward_coins:10, reward_stars:1, reward_experience:1, reward_tokens:0,
  }));
  const db = {query: vi.fn(async (sql: string) => {
    if (sql.includes('from weekly_challenges challenge')) return {rows:challenges};
    if (sql.includes('from weekly_challenge_tasks')) return {rows:challenges.map(({id})=>({
      id:`task-${id}`,challenge_id:id,type:'goals_scored',title:null,target:2,sort_order:0,created_at:now,
    }))};
    if (sql.includes('from weekly_challenge_reward_claims')) return {rows:[{challenge_id:'claimed',claimed_at:now}]};
    if (sql.includes('from weekly_challenge_participants')) return {rows:[{challenge_id:'joined'},{challenge_id:'claimed'}]};
    if (sql.includes('select windows.ordinality')) return {rows:challenges.map(()=>({
      goals:'3',played:'0',won:'0',invites:'0',completed:'0',commented_posts:'0',
    }))};
    throw new Error('Unexpected SQL');
  })};
  const result = await getWeeklyChallengeCatalog(db as unknown as Pool,'viewer',now);
  expect(result.completed.map(({id,canClaimReward,rewardClaimedAt})=>({id,canClaimReward,rewardClaimedAt}))).toEqual([
    {id:'automatic',canClaimReward:true,rewardClaimedAt:null},
    {id:'joined',canClaimReward:true,rewardClaimedAt:null},
    {id:'unjoined',canClaimReward:false,rewardClaimedAt:null},
    {id:'claimed',canClaimReward:false,rewardClaimedAt:now.toISOString()},
  ]);
});
