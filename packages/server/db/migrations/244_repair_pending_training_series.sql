-- Rebuild pending training stage progress without changing claimed rewards.
with active as (
  select u.user_id,u.stage_number,u.opened_at,s.target
    from user_achievement_stages u join achievement_stages s using(achievement_id,stage_number)
   where u.achievement_id='stable-student' and u.stage_number>1 and s.is_enabled
     and u.completed_at is null and u.claimed_at is null
), trainings as (
  select a.user_id,a.stage_number,t.id,t.day_date,t.closed_at,t.shots_limit,
         count(shot.id)::int as shots,count(shot.id) filter(where shot.server_result='goal')::int as goals,
         (a.target->>'minimumAccuracyPercent')::numeric as minimum_accuracy
    from active a join training_session t on t.user_id=a.user_id and t.state='closed' and t.closed_at>=a.opened_at
    left join shot_session shot on shot.mode='training' and shot.training_session_id=t.id
   group by a.user_id,a.stage_number,a.target,t.id
), qualified as (
  select *,day_date-(row_number() over(partition by user_id,stage_number order by day_date))::int as series
    from trainings where shots=shots_limit and goals*100>=shots_limit*minimum_accuracy
), runs as (
  select user_id,stage_number,series,count(*)::int as length,max(day_date) as end_day,max(closed_at) as ended_at
    from qualified group by user_id,stage_number,series
), rebuilt as (
  select a.user_id,a.stage_number,coalesce(max(r.length),0) as best_days,
         coalesce(max(r.length) filter(where r.end_day=(select max(t.day_date) from trainings t where t.user_id=a.user_id and t.stage_number=a.stage_number)),0) as current_days,
         min(r.ended_at) filter(where r.length>=(a.target->>'days')::int) as achieved_at,
         (a.target->>'minimumAccuracyPercent')::numeric as minimum_accuracy
    from active a left join runs r using(user_id,stage_number)
   group by a.user_id,a.stage_number,a.target
), repaired as (
  update user_achievement_stages u
     set progress=coalesce(u.progress,'{}'::jsonb)||jsonb_build_object('days',b.best_days,'minimumAccuracyPercent',b.minimum_accuracy),
         completed_at=b.achieved_at,
         completion_context=case when b.achieved_at is not null
           then jsonb_build_object('source','training_series_repair_244') else u.completion_context end
    from rebuilt b where u.user_id=b.user_id and u.achievement_id='stable-student' and u.stage_number=b.stage_number
      and u.completed_at is null and u.claimed_at is null
  returning u.user_id,b.current_days
)
update achievement_progress p set state=jsonb_set(p.state,'{count}',to_jsonb(r.current_days))
  from repaired r where p.user_id=r.user_id and p.key='training_40_of_50_streak';
