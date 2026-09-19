with career_experience_sync as (
  select user_stage.user_id,
         user_stage.stage_number,
         greatest(
           case
             when jsonb_typeof(user_stage.progress->'total') = 'number'
               then (user_stage.progress->>'total')::bigint
             else 0
           end,
           users.experience::bigint
         ) as synced_total,
         (stage.target->>'total')::bigint as target_total
    from user_achievement_stages user_stage
    join users on users.id = user_stage.user_id
    join achievement_stages stage
      on stage.achievement_id = user_stage.achievement_id
     and stage.stage_number = user_stage.stage_number
    join achievements achievement on achievement.id = user_stage.achievement_id
   where user_stage.achievement_id = 'career-experience'
     and user_stage.claimed_at is null
     and stage.is_enabled
     and achievement.availability = 'active'
)
update user_achievement_stages user_stage
   set progress = jsonb_set(
         coalesce(user_stage.progress, '{}'::jsonb),
         '{total}',
         to_jsonb(sync.synced_total),
         true
       ),
       completed_at = case
         when user_stage.completed_at is not null then user_stage.completed_at
         when sync.synced_total >= sync.target_total then now()
         else null
       end
  from career_experience_sync sync
 where user_stage.user_id = sync.user_id
   and user_stage.achievement_id = 'career-experience'
   and user_stage.stage_number = sync.stage_number;
