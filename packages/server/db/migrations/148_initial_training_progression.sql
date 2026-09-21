alter table initial_training_run
  drop constraint if exists initial_training_run_exercise_key_check;

alter table initial_training_run
  add constraint initial_training_run_exercise_key_check
  check (
    exercise_key in (
      'first-shot',
      'three-positions',
      'follow-the-goal',
      'moving-goal',
      'find-the-gap',
      'pressure-window',
      'game-pace'
    )
  );

alter table initial_training_completion
  drop constraint if exists initial_training_completion_exercise_key_check;

alter table initial_training_completion
  add constraint initial_training_completion_exercise_key_check
  check (
    exercise_key in (
      'first-shot',
      'three-positions',
      'follow-the-goal',
      'moving-goal',
      'find-the-gap',
      'pressure-window',
      'game-pace'
    )
  );

update game_settings
   set value = (value - 'goalieFrequencyMultiplier') || jsonb_build_object(
     'targetGoals',
     '{"first-shot":10,"three-positions":9,"follow-the-goal":10,"moving-goal":10,"find-the-gap":10,"pressure-window":8,"game-pace":8}'::jsonb,
     'goalieFrequencyMultipliers',
     '{"find-the-gap":0.35,"pressure-window":0.65,"game-pace":1}'::jsonb
   )
 where key = 'training.initial_course.config';

insert into initial_training_completion (
  user_id,
  exercise_key,
  reward_stars,
  reward_experience
)
select completed.user_id, additions.exercise_key, 0, 0
  from (
    select user_id
      from initial_training_completion
     where exercise_key = 'find-the-gap'
     group by user_id
  ) completed
 cross join (values ('pressure-window'), ('game-pace')) as additions(exercise_key)
on conflict (user_id, exercise_key) do nothing;

insert into initial_training_open_access (user_id, source, unlocked_at)
select distinct user_id, 'course', now()
  from initial_training_completion
 where exercise_key = 'find-the-gap'
on conflict (user_id) do nothing;
