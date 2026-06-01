alter table admin_inventory_items
  add column if not exists resource_unit text not null default 'period'
    check (resource_unit in ('period', 'shot', 'distance', 'energy_ms')),
  add column if not exists effect_puck_speed_points int not null default 0,
  add column if not exists effect_stumble_interval_min_ms int not null default 25000
    check (effect_stumble_interval_min_ms >= 0),
  add column if not exists effect_stumble_interval_max_ms int not null default 45000
    check (effect_stumble_interval_max_ms >= effect_stumble_interval_min_ms),
  add column if not exists effect_stumble_duration_min_ms int not null default 250
    check (effect_stumble_duration_min_ms >= 0),
  add column if not exists effect_stumble_duration_max_ms int not null default 400
    check (effect_stumble_duration_max_ms >= effect_stumble_duration_min_ms),
  add column if not exists effect_nutrition_slowdown_ms int not null default 2000
    check (effect_nutrition_slowdown_ms >= 0),
  add column if not exists effect_nutrition_stop_ms int not null default 5000
    check (effect_nutrition_stop_ms >= 0),
  add column if not exists effect_fatigue_delay_ms int not null default 90000
    check (effect_fatigue_delay_ms >= 0),
  add column if not exists effect_fatigue_speed_multiplier numeric(8, 4) not null default 0.88
    check (effect_fatigue_speed_multiplier > 0 and effect_fatigue_speed_multiplier <= 1);

drop index if exists admin_inventory_items_active_shop_variant_idx;

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
    resource_unit,
    effect_puck_speed_points,
    effect_puck_speed_delta,
    effect_stumble_chance,
    effect_stumble_ms,
    effect_stumble_blocks_per_period,
    effect_stumble_interval_min_ms,
    effect_stumble_interval_max_ms,
    effect_stumble_duration_min_ms,
    effect_stumble_duration_max_ms,
    effect_nutrition_slowdown_ms,
    effect_nutrition_stop_ms,
    effect_fatigue_delay_ms,
    effect_fatigue_speed_multiplier
  )
select
  seed.photo_url,
  seed.title,
  seed.description,
  0,
  seed.item_kind,
  seed.rarity,
  seed.currency_price,
  seed.charges_per_purchase,
  0,
  seed.power_score,
  seed.resource_unit,
  seed.effect_puck_speed_points,
  seed.effect_puck_speed_delta,
  0,
  0,
  0,
  25000,
  45000,
  250,
  400,
  2000,
  5000,
  90000,
  0.88
from (
  values
    (
      '/inventory/stick-bronze.webp',
      'Ультимейт Ван 1',
      'Комплект клюшек Ультимейт Ван на 1300 бросков. Ускоряет полёт шайбы.',
      'stick',
      'common',
      1490,
      1300,
      24,
      'shot',
      10,
      0.10
    ),
    (
      '/inventory/stick-silver.webp',
      'Ультимейт Ван 2',
      'Комплект клюшек Ультимейт Ван на 1950 бросков. Ускоряет полёт шайбы.',
      'stick',
      'rare',
      2490,
      1950,
      24,
      'shot',
      10,
      0.10
    ),
    (
      '/inventory/stick-gold.webp',
      'Ультимейт Ван 3',
      'Комплект клюшек Ультимейт Ван на 2500 бросков. Ускоряет полёт шайбы.',
      'stick',
      'legendary',
      3740,
      2500,
      24,
      'shot',
      10,
      0.10
    ),
    (
      '/inventory/skates-bronze.webp',
      'Старт',
      'Коньки без спотыкания. Ресурс расходуется от пройденной дистанции.',
      'skates',
      'common',
      2990,
      1000,
      24,
      'distance',
      0,
      0
    ),
    (
      '/inventory/nutrition-bronze.webp',
      'Изотоник',
      'Питание на 140 минут активной игры. Помогает держать темп.',
      'nutrition',
      'common',
      1490,
      8400000,
      12,
      'energy_ms',
      0,
      0
    ),
    (
      '/inventory/nutrition-silver.webp',
      'Энерго-заряд',
      'Питание на 250 минут активной игры. Помогает держать темп.',
      'nutrition',
      'rare',
      2490,
      15000000,
      20,
      'energy_ms',
      0,
      0
    ),
    (
      '/inventory/nutrition-gold.webp',
      'Энерго-комплекс',
      'Питание на 360 минут активной игры. Помогает держать темп.',
      'nutrition',
      'legendary',
      3490,
      21600000,
      30,
      'energy_ms',
      0,
      0
    )
) as seed(
  photo_url,
  title,
  description,
  item_kind,
  rarity,
  currency_price,
  charges_per_purchase,
  power_score,
  resource_unit,
  effect_puck_speed_points,
  effect_puck_speed_delta
)
where not exists (
  select 1
    from admin_inventory_items existing
   where existing.deleted_at is null
     and existing.item_kind = seed.item_kind
     and existing.title = seed.title
);

with mapped_items as (
  select
    old_item.id as old_item_id,
    new_item.id as new_item_id
  from admin_inventory_items old_item
  join admin_inventory_items new_item
    on new_item.deleted_at is null
   and new_item.item_kind = old_item.item_kind
   and new_item.title = case
         when old_item.item_kind = 'stick' and old_item.rarity = 'common' then 'Ультимейт Ван 1'
         when old_item.item_kind = 'stick' and old_item.rarity = 'rare' then 'Ультимейт Ван 2'
         when old_item.item_kind = 'stick' and old_item.rarity = 'legendary' then 'Ультимейт Ван 3'
         when old_item.item_kind = 'nutrition' and old_item.rarity = 'common' then 'Изотоник'
         when old_item.item_kind = 'nutrition' and old_item.rarity = 'rare' then 'Энерго-заряд'
         when old_item.item_kind = 'nutrition' and old_item.rarity = 'legendary' then 'Энерго-комплекс'
         when old_item.item_kind = 'skates' then 'Старт'
       end
  where old_item.deleted_at is null
    and old_item.item_kind in ('stick', 'skates', 'nutrition')
    and old_item.title not in (
      'Ультимейт Ван 1',
      'Ультимейт Ван 2',
      'Ультимейт Ван 3',
      'Старт',
      'Изотоник',
      'Энерго-заряд',
      'Энерго-комплекс'
    )
),
transferred_inventory as (
  select
    inventory.user_id,
    mapped_items.new_item_id as inventory_item_id,
    sum(inventory.charges_available)::int as charges_available,
    sum(inventory.charges_reserved)::int as charges_reserved
  from user_inventory_item inventory
  join mapped_items on mapped_items.old_item_id = inventory.inventory_item_id
  group by inventory.user_id, mapped_items.new_item_id
)
insert into user_inventory_item (
  user_id,
  inventory_item_id,
  charges_available,
  charges_reserved
)
select
  user_id,
  inventory_item_id,
  charges_available,
  charges_reserved
from transferred_inventory
on conflict (user_id, inventory_item_id) do update
   set charges_available = user_inventory_item.charges_available + excluded.charges_available,
       charges_reserved = user_inventory_item.charges_reserved + excluded.charges_reserved,
       updated_at = now();

with mapped_items as (
  select
    old_item.id as old_item_id,
    new_item.id as new_item_id
  from admin_inventory_items old_item
  join admin_inventory_items new_item
    on new_item.deleted_at is null
   and new_item.item_kind = old_item.item_kind
   and new_item.title = case
         when old_item.item_kind = 'stick' and old_item.rarity = 'common' then 'Ультимейт Ван 1'
         when old_item.item_kind = 'stick' and old_item.rarity = 'rare' then 'Ультимейт Ван 2'
         when old_item.item_kind = 'stick' and old_item.rarity = 'legendary' then 'Ультимейт Ван 3'
       end
  where old_item.deleted_at is null
    and old_item.item_kind = 'stick'
    and old_item.title not in ('Ультимейт Ван 1', 'Ультимейт Ван 2', 'Ультимейт Ван 3')
)
update user_equipment equipment
   set equipped_stick_item_id = mapped_items.new_item_id
  from mapped_items
 where equipment.equipped_stick_item_id = mapped_items.old_item_id;

with mapped_items as (
  select
    old_item.id as old_item_id,
    new_item.id as new_item_id
  from admin_inventory_items old_item
  join admin_inventory_items new_item
    on new_item.deleted_at is null
   and new_item.item_kind = old_item.item_kind
   and new_item.title = case
         when old_item.item_kind = 'nutrition' and old_item.rarity = 'common' then 'Изотоник'
         when old_item.item_kind = 'nutrition' and old_item.rarity = 'rare' then 'Энерго-заряд'
         when old_item.item_kind = 'nutrition' and old_item.rarity = 'legendary' then 'Энерго-комплекс'
       end
  where old_item.deleted_at is null
    and old_item.item_kind = 'nutrition'
    and old_item.title not in ('Изотоник', 'Энерго-заряд', 'Энерго-комплекс')
)
update user_equipment equipment
   set equipped_nutrition_item_id = mapped_items.new_item_id
  from mapped_items
 where equipment.equipped_nutrition_item_id = mapped_items.old_item_id;

with mapped_items as (
  select
    old_item.id as old_item_id,
    new_item.id as new_item_id
  from admin_inventory_items old_item
  join admin_inventory_items new_item
    on new_item.deleted_at is null
   and new_item.item_kind = 'skates'
   and new_item.title = 'Старт'
  where old_item.deleted_at is null
    and old_item.item_kind = 'skates'
    and old_item.title <> 'Старт'
)
update user_equipment equipment
   set equipped_skates_item_id = mapped_items.new_item_id
  from mapped_items
 where equipment.equipped_skates_item_id = mapped_items.old_item_id;

update admin_inventory_items
   set deleted_at = coalesce(deleted_at, now()),
       updated_at = now()
 where deleted_at is null
   and item_kind in ('stick', 'skates', 'nutrition')
   and title not in (
     'Ультимейт Ван 1',
     'Ультимейт Ван 2',
     'Ультимейт Ван 3',
     'Старт',
     'Изотоник',
     'Энерго-заряд',
     'Энерго-комплекс'
   );

create unique index if not exists admin_inventory_items_active_shop_variant_idx
  on admin_inventory_items (item_kind, rarity)
  where deleted_at is null
    and item_kind in ('stick', 'skates', 'nutrition')
    and rarity in ('common', 'rare', 'legendary');
