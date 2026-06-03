update admin_inventory_items
   set resource_unit = 'shot',
       duel_period_cost = 0,
       effect_puck_speed_points = case
         when effect_puck_speed_points <> 0 then effect_puck_speed_points
         when effect_puck_speed_delta <> 0 then round(effect_puck_speed_delta * 100)::int
         when power_score <> 0 then power_score
         else 10
       end,
       effect_puck_speed_delta = case
         when effect_puck_speed_delta <> 0 then effect_puck_speed_delta
         when effect_puck_speed_points <> 0 then effect_puck_speed_points::numeric / 100
         when power_score <> 0 then power_score::numeric / 100
         else 0.10
       end,
       power_score = case
         when power_score <> 0 then power_score
         when effect_puck_speed_points <> 0 then greatest(0, effect_puck_speed_points)
         when effect_puck_speed_delta <> 0 then greatest(0, round(effect_puck_speed_delta * 100)::int)
         else 10
       end,
       updated_at = now()
 where deleted_at is null
   and item_kind = 'stick';

update admin_inventory_items
   set resource_unit = 'distance',
       effect_puck_speed_points = 0,
       effect_puck_speed_delta = 0,
       updated_at = now()
 where deleted_at is null
   and item_kind = 'skates';

update admin_inventory_items
   set resource_unit = 'energy_ms',
       effect_puck_speed_points = 0,
       effect_puck_speed_delta = 0,
       updated_at = now()
 where deleted_at is null
   and item_kind = 'nutrition';
