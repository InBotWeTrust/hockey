alter table admin_inventory_items
  drop constraint if exists admin_inventory_items_item_kind_check;

alter table admin_inventory_items
  add constraint admin_inventory_items_item_kind_check
  check (item_kind in ('bundle', 'stick', 'skates', 'nutrition', 'consumable', 'recovery'));

alter table admin_inventory_items
  add column if not exists effect_recovery_minutes int not null default 0
    check (effect_recovery_minutes between 0 and 60);

alter table currency_ledger
  drop constraint if exists currency_ledger_reason_check,
  add constraint currency_ledger_reason_check
    check (reason in (
      'admin_adjustment', 'purchase', 'duel_stake_hold', 'duel_entry_fee',
      'duel_stake_refund', 'duel_stake_payout', 'duel_stake_burn', 'duel_reward',
      'inventory_purchase', 'weekly_challenge_reward', 'bonus_game_reward',
      'tournament_entry_fee', 'tournament_entry_refund', 'tournament_reward',
      'achievement_reward', 'recovery_kit_use'
    ));

create table if not exists recovery_kit_application (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  shot_session_id uuid not null references shot_session(id) on delete cascade,
  inventory_item_id uuid not null references admin_inventory_items(id) on delete restrict,
  inventory_instance_id uuid not null references user_inventory_instance(id) on delete restrict,
  recovery_minutes int not null check (recovery_minutes between 1 and 60),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists recovery_kit_application_shot_idx
  on recovery_kit_application (shot_session_id, created_at);

insert into admin_inventory_items (
  id, photo_url, title, description, price_rub, item_kind, rarity,
  currency_price, charges_per_purchase, low_stock_threshold, duel_period_cost,
  power_score, resource_unit, effect_recovery_minutes
)
values
  ('10900000-0000-4000-8000-000000000015', '/inventory/recovery-15.webp',
   'Малый набор для восстановления', 'Сокращает текущее восстановление на 15 минут.',
   0, 'recovery', 'common', 600, 1, 1, 0, 0, 'period', 15),
  ('10900000-0000-4000-8000-000000000030', '/inventory/recovery-30.webp',
   'Набор для восстановления', 'Сокращает текущее восстановление на 30 минут.',
   0, 'recovery', 'rare', 1000, 1, 1, 0, 0, 'period', 30),
  ('10900000-0000-4000-8000-000000000060', '/inventory/recovery-60.webp',
   'Большой набор для восстановления', 'Полностью снимает часовое восстановление.',
   0, 'recovery', 'legendary', 1800, 1, 1, 0, 0, 'period', 60)
on conflict (id) do update
set photo_url = excluded.photo_url,
    title = excluded.title,
    description = excluded.description,
    item_kind = excluded.item_kind,
    rarity = excluded.rarity,
    currency_price = excluded.currency_price,
    charges_per_purchase = excluded.charges_per_purchase,
    low_stock_threshold = excluded.low_stock_threshold,
    duel_period_cost = excluded.duel_period_cost,
    power_score = excluded.power_score,
    resource_unit = excluded.resource_unit,
    effect_recovery_minutes = excluded.effect_recovery_minutes,
    deleted_at = null,
    updated_at = now();
