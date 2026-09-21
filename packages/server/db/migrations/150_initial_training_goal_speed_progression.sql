update game_settings
   set value = value || jsonb_build_object(
     'goalFrequencyMultipliers',
     '{"moving-goal":0.35,"find-the-gap":0.35,"pressure-window":1,"game-pace":1}'::jsonb
   )
 where key = 'training.initial_course.config';
