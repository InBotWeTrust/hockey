with current_beginner_version as (
  select current_published_version_id as version_id
    from onboarding_chain
   where key = 'beginner'
)
update onboarding_step step
   set tutorial_config = jsonb_build_object(
     'shooterFrequency', 0.12,
     'goalieFrequency', 0.1,
     'goalFrequency', 0.08
   )
  from current_beginner_version current
 where step.version_id = current.version_id
   and step.kind = 'tutorial_shot'
   and step.tutorial_config = jsonb_build_object(
     'shooterFrequency', 0.75,
     'goalieFrequency', 0.6,
     'goalFrequency', 0.5
   );

with current_beginner_version as (
  select current_published_version_id as version_id
    from onboarding_chain
   where key = 'beginner'
)
update onboarding_run run
   set tutorial_state = jsonb_set(
     run.tutorial_state,
     '{speeds}',
     jsonb_build_object(
       'shooterFrequency', 0.12,
       'goalieFrequency', 0.1,
       'goalFrequency', 0.08
     )
   )
  from current_beginner_version current
 where run.version_id = current.version_id
   and run.chain_key = 'beginner'
   and run.completed_at is null
   and run.tutorial_state->'speeds' = jsonb_build_object(
     'shooterFrequency', 0.75,
     'goalieFrequency', 0.6,
     'goalFrequency', 0.5
   )
   and not exists (
     select 1
       from onboarding_event event
      where event.run_id = run.id
        and event.kind = 'tutorial_goal'
   );
