update game_settings
   set value = to_jsonb(30),
       updated_at = now()
 where key = 'training.daily_cooldown_minutes'
   and value = to_jsonb(120);
