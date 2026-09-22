update game_settings
   set value = value
     || jsonb_build_object(
       'targetGoals',
       (value->'targetGoals') || '{"moving-goal":9,"find-the-gap":9,"pressure-window":6,"game-pace":6}'::jsonb,
       'goalieFrequencyMultipliers',
       (value->'goalieFrequencyMultipliers') || '{"find-the-gap":1,"pressure-window":1,"game-pace":1}'::jsonb,
       'goalFrequencyMultipliers',
       (value->'goalFrequencyMultipliers') || '{"moving-goal":1,"find-the-gap":1,"pressure-window":1,"game-pace":1}'::jsonb
     )
 where key = 'training.initial_course.config';

update initial_training_run
   set state = 'abandoned'
 where state = 'active'
   and exercise_key in ('moving-goal', 'find-the-gap', 'pressure-window', 'game-pace');
