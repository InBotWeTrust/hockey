-- Amateur duels intentionally use a slower 0.85 base puck speed. Ultimate One
-- sticks bring the effective speed up to the daily-game baseline of 1.25.
update admin_inventory_items
   set effect_puck_speed_points = 40,
       effect_puck_speed_delta = 0.40,
       updated_at = now()
 where deleted_at is null
   and item_kind = 'stick'
   and title in ('Ультимейт Ван 1', 'Ультимейт Ван 2', 'Ультимейт Ван 3');
