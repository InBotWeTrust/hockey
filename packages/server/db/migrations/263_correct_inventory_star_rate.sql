-- Correct only the mistaken 25-coin rate; preserve custom admin overrides.
-- Missing settings use the approved 50-coin default from gameSettings.ts.
update game_settings
   set value = '50'::jsonb,
       updated_at = now()
 where key = 'amateur.star_inventory_price_divisor'
   and value = '25'::jsonb;
