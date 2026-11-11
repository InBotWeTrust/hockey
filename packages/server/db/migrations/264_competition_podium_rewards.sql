-- Upgrade only legacy podium overrides; missing keys use the approved defaults.
-- Closed rating seasons and published tournament snapshots are immutable.
update game_settings settings
   set value = seed.new_value,
       updated_at = now()
  from (values
    ('amateur.monthly_rating.overall.first.coins', '15000'::jsonb, '110000'::jsonb),
    ('amateur.monthly_rating.overall.first.stars', '300'::jsonb, '600'::jsonb),
    ('amateur.monthly_rating.overall.second.coins', '10000'::jsonb, '50000'::jsonb),
    ('amateur.monthly_rating.overall.second.stars', '200'::jsonb, '300'::jsonb),
    ('amateur.monthly_rating.overall.third.coins', '7500'::jsonb, '25000'::jsonb)
  ) as seed(key, old_value, new_value)
 where settings.key = seed.key
   and settings.value = seed.old_value;
