update game_settings
   set value = jsonb_set(
     value,
     '{targetGoals}',
     '{"first-shot":10,"three-positions":9,"follow-the-goal":10,"moving-goal":10,"find-the-gap":10}'::jsonb,
     true
   )
 where key = 'training.initial_course.config';
