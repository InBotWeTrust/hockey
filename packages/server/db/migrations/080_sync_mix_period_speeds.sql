-- The canonical Mix template was seeded before the daily period-speed rebalance.
-- Update only the untouched legacy preset so admin-customised templates keep
-- their explicitly configured speeds.
update amateur_duel_template
   set period_speed_presets = '[
         {"periodNumber":1,"goalFrequency":0.5,"goalieFrequency":0.6,"shooterFrequency":0.75,"puckSpeedPerMs":1.25},
         {"periodNumber":2,"goalFrequency":0.5,"goalieFrequency":0.6,"shooterFrequency":0.7,"puckSpeedPerMs":1.25}
       ]'::jsonb,
       updated_at = now()
 where duel_kind = 'express_plus'
   and deleted_at is null
   and period_speed_presets = '[
         {"periodNumber":1,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.8,"puckSpeedPerMs":1.3},
         {"periodNumber":2,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.75,"puckSpeedPerMs":1.3}
       ]'::jsonb;
