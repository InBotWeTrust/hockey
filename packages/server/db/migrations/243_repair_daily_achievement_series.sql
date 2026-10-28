-- Repair only open daily series stages. Rewards remain manually claimable.
create index if not exists event_log_duel_achievements_evaluated_idx
  on event_log ((payload->>'match_id')) where type='duel_achievements_evaluated';

with active as (
  select u.user_id,u.achievement_id,u.stage_number,u.opened_at,s.target
    from user_achievement_stages u
    join achievement_stages s using(achievement_id,stage_number)
   where u.achievement_id in ('daily-sniper-streak','no-panic')
     and u.completed_at is null and u.claimed_at is null and s.is_enabled
), ordered as (
  select a.*,shot.day_pool_id,shot.created_at,shot.server_result='goal' as is_goal,
         row_number() over(partition by a.user_id,a.achievement_id,a.stage_number,shot.day_pool_id
           order by shot.period_number,shot.shot_index) as position,
         row_number() over(partition by a.user_id,a.achievement_id,a.stage_number,shot.day_pool_id,shot.server_result='goal'
           order by shot.period_number,shot.shot_index) as kind_position
    from active a join shot_session shot on shot.user_id=a.user_id and shot.mode='daily'
     and shot.created_at>=a.opened_at
), runs as (
  select user_id,achievement_id,stage_number,day_pool_id,is_goal,position-kind_position as group_id,
         min(position) as first_position,count(*)::int as length,max(created_at) as ended_at
    from ordered group by user_id,achievement_id,stage_number,day_pool_id,is_goal,position-kind_position
), preceding as (
  select *,lag(is_goal) over w as previous_is_goal,lag(length) over w as previous_length
    from runs window w as(partition by user_id,achievement_id,stage_number,day_pool_id order by first_position)
), best as (
  select r.user_id,r.achievement_id,r.stage_number,max(r.length) as length,
         min(r.ended_at) filter(where r.length>=coalesce((a.target->>'goalStreak')::int,(a.target->>'recoveryGoalStreak')::int)) as achieved_at
    from preceding r join active a using(user_id,achievement_id,stage_number)
   where r.is_goal and (r.achievement_id='daily-sniper-streak' or (not r.previous_is_goal and r.previous_length>=3))
   group by r.user_id,r.achievement_id,r.stage_number
)
update user_achievement_stages u
   set progress=coalesce(u.progress,'{}'::jsonb) || case when b.achievement_id='daily-sniper-streak'
         then jsonb_build_object('goalStreak',greatest(b.length,coalesce((u.progress->>'goalStreak')::int,0)))
         else jsonb_build_object('recoveryGoalStreak',greatest(b.length,coalesce((u.progress->>'recoveryGoalStreak')::int,0)),'precedingNonGoals',3) end,
       completed_at=b.achieved_at,
       completion_context=case when b.achieved_at is not null
         then jsonb_build_object('source','daily_series_repair_243') else u.completion_context end
  from best b
 where u.user_id=b.user_id and u.achievement_id=b.achievement_id and u.stage_number=b.stage_number
   and u.completed_at is null and u.claimed_at is null
   and (b.achieved_at is not null or b.length>coalesce((u.progress->>'goalStreak')::int,(u.progress->>'recoveryGoalStreak')::int,0));
