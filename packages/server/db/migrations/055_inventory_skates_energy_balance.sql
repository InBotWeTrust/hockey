alter table admin_inventory_items
  add column if not exists effect_stumble_interval_min_rolls numeric(10, 4) not null default 90
    check (effect_stumble_interval_min_rolls >= 0),
  add column if not exists effect_stumble_interval_max_rolls numeric(10, 4) not null default 130
    check (effect_stumble_interval_max_rolls >= effect_stumble_interval_min_rolls),
  add column if not exists effect_stumble_offset_min_px int not null default 20
    check (effect_stumble_offset_min_px >= 0),
  add column if not exists effect_stumble_offset_max_px int not null default 45
    check (effect_stumble_offset_max_px >= effect_stumble_offset_min_px),
  add column if not exists effect_stumble_recovery_min_ms int not null default 200
    check (effect_stumble_recovery_min_ms >= 0),
  add column if not exists effect_stumble_recovery_max_ms int not null default 300
    check (effect_stumble_recovery_max_ms >= effect_stumble_recovery_min_ms),
  add column if not exists effect_energy_baseline_speed numeric(8, 4) not null default 0.75
    check (effect_energy_baseline_speed > 0),
  add column if not exists effect_fatigue_grace_ms int not null default 30000
    check (effect_fatigue_grace_ms >= 0),
  add column if not exists effect_fatigue_slowdown_start_ms int not null default 30000
    check (effect_fatigue_slowdown_start_ms >= 0),
  add column if not exists effect_fatigue_heavy_slowdown_start_ms int not null default 75000
    check (effect_fatigue_heavy_slowdown_start_ms >= effect_fatigue_slowdown_start_ms),
  add column if not exists effect_fatigue_stop_start_ms int not null default 90000
    check (effect_fatigue_stop_start_ms >= effect_fatigue_heavy_slowdown_start_ms),
  add column if not exists effect_fatigue_stop_duration_ms int not null default 5000
    check (effect_fatigue_stop_duration_ms >= 0),
  add column if not exists effect_fatigue_after_rest_ms int not null default 45000
    check (effect_fatigue_after_rest_ms >= 0),
  add column if not exists effect_fatigue_slow_multiplier numeric(8, 4) not null default 0.9
    check (effect_fatigue_slow_multiplier >= 0 and effect_fatigue_slow_multiplier <= 1),
  add column if not exists effect_fatigue_heavy_multiplier numeric(8, 4) not null default 0.75
    check (effect_fatigue_heavy_multiplier >= 0 and effect_fatigue_heavy_multiplier <= 1);

update admin_inventory_items
   set charges_per_purchase = case
         when item_kind = 'stick' and rarity = 'common' then 1300
         when item_kind = 'stick' and rarity = 'rare' then 1950
         when item_kind = 'stick' and rarity = 'legendary' then 2500
         when item_kind = 'skates' and rarity = 'common' then 8500
         when item_kind = 'skates' and rarity = 'rare' then 12500
         when item_kind = 'skates' and rarity = 'legendary' then 16000
         when item_kind = 'nutrition' and rarity = 'common' then 5700000
         when item_kind = 'nutrition' and rarity = 'rare' then 8400000
         when item_kind = 'nutrition' and rarity = 'legendary' then 10800000
         else charges_per_purchase
       end,
       resource_unit = case
         when item_kind = 'stick' then 'shot'
         when item_kind = 'skates' then 'distance'
         when item_kind = 'nutrition' then 'energy_ms'
         else resource_unit
       end,
       effect_stumble_interval_min_rolls = 90,
       effect_stumble_interval_max_rolls = 130,
       effect_stumble_duration_min_ms = 500,
       effect_stumble_duration_max_ms = 700,
       effect_stumble_offset_min_px = 20,
       effect_stumble_offset_max_px = 45,
       effect_stumble_recovery_min_ms = 200,
       effect_stumble_recovery_max_ms = 300,
       effect_energy_baseline_speed = 0.75,
       effect_fatigue_grace_ms = 30000,
       effect_fatigue_slowdown_start_ms = 30000,
       effect_fatigue_heavy_slowdown_start_ms = 75000,
       effect_fatigue_stop_start_ms = 90000,
       effect_fatigue_stop_duration_ms = 5000,
       effect_fatigue_after_rest_ms = 45000,
       effect_fatigue_slow_multiplier = 0.9,
       effect_fatigue_heavy_multiplier = 0.75,
       updated_at = now()
 where deleted_at is null
   and item_kind in ('stick', 'skates', 'nutrition');

insert into admin_inventory_items
  (
    photo_url,
    title,
    description,
    price_rub,
    item_kind,
    rarity,
    currency_price,
    charges_per_purchase,
    duel_period_cost,
    power_score,
    resource_unit
  )
values
  (
    '/inventory/skates-silver.webp',
    'Разгон',
    'Серебряные коньки на 12500 прокатов. Убирают спотыкания, пока есть ресурс.',
    0,
    'skates',
    'rare',
    2490,
    12500,
    0,
    20,
    'distance'
  ),
  (
    '/inventory/skates-gold.webp',
    'Профи',
    'Золотые коньки на 16000 прокатов. Убирают спотыкания, пока есть ресурс.',
    0,
    'skates',
    'legendary',
    3740,
    16000,
    0,
    30,
    'distance'
  )
on conflict do nothing;
