-- Amateur league asynchronous duels. No HP/boss progression: matches reuse
-- the shared shot_session model and snapshot their rules on accept.

alter table admin_inventory_items
  add column item_kind text not null default 'bundle'
    check (item_kind in ('bundle', 'stick', 'skates', 'nutrition', 'consumable')),
  add column currency_price int not null default 0 check (currency_price >= 0),
  add column charges_per_purchase int not null default 0 check (charges_per_purchase >= 0),
  add column duel_period_cost int not null default 0 check (duel_period_cost >= 0),
  add column effect_puck_speed_delta numeric(8, 4) not null default 0,
  add column effect_shooter_frequency_delta numeric(8, 4) not null default 0,
  add column effect_goalie_frequency_delta numeric(8, 4) not null default 0,
  add column effect_goal_frequency_delta numeric(8, 4) not null default 0,
  add column effect_shot_zone_multiplier numeric(8, 4) not null default 1
    check (effect_shot_zone_multiplier >= 1);

create table user_currency_account (
  user_id uuid primary key references users(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  reserved_balance int not null default 0 check (reserved_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into user_currency_account (user_id)
select id from users
on conflict do nothing;

create table user_inventory_item (
  user_id uuid not null references users(id) on delete cascade,
  inventory_item_id uuid not null references admin_inventory_items(id) on delete cascade,
  charges_available int not null default 0 check (charges_available >= 0),
  charges_reserved int not null default 0 check (charges_reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, inventory_item_id)
);

create table amateur_duel_template (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  description text not null default '',
  is_active boolean not null default true,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  total_periods smallint not null default 3 check (total_periods between 1 and 9),
  shots_per_period smallint not null default 30 check (shots_per_period between 1 and 100),
  period_duration_ms int not null default 1200000 check (period_duration_ms between 1000 and 10800000),
  break_duration_ms int not null default 900000 check (break_duration_ms between 0 and 10800000),
  goalie_id text not null default 'rookie',
  period_speed_presets jsonb not null,
  stake_amount int not null default 0 check (stake_amount >= 0),
  entry_fee_amount int not null default 0 check (entry_fee_amount >= 0),
  required_inventory_item_id uuid references admin_inventory_items(id) on delete set null,
  inventory_charges_per_period int not null default 0 check (inventory_charges_per_period >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (starts_at < ends_at),
  check (jsonb_typeof(period_speed_presets) = 'array')
);

create index amateur_duel_template_active_idx
  on amateur_duel_template (starts_at, ends_at)
  where deleted_at is null and is_active;

create table amateur_duel_match (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references amateur_duel_template(id) on delete set null,
  challenger_user_id uuid not null references users(id) on delete cascade,
  opponent_user_id uuid not null references users(id) on delete cascade,
  status text not null
    check (status in ('pending', 'scheduled', 'active', 'settled', 'expired')),
  rules_snapshot jsonb not null,
  match_seed text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  stake_amount int not null default 0 check (stake_amount >= 0),
  entry_fee_amount int not null default 0 check (entry_fee_amount >= 0),
  bank_amount int not null default 0 check (bank_amount >= 0),
  winner_user_id uuid references users(id) on delete set null,
  outcome text check (outcome in ('challenger_win', 'opponent_win', 'draw', 'double_loss')),
  settled_reason text,
  game_core_version int not null,
  accepted_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (challenger_user_id <> opponent_user_id),
  check (starts_at < ends_at)
);

create unique index amateur_duel_match_one_open_pair_template_idx
  on amateur_duel_match (
    template_id,
    least(challenger_user_id, opponent_user_id),
    greatest(challenger_user_id, opponent_user_id)
  )
  where status in ('pending', 'scheduled', 'active');

create index amateur_duel_match_user_status_idx
  on amateur_duel_match (challenger_user_id, status, created_at desc);

create index amateur_duel_match_opponent_status_idx
  on amateur_duel_match (opponent_user_id, status, created_at desc);

create table amateur_duel_participant (
  match_id uuid not null references amateur_duel_match(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  side text not null check (side in ('challenger', 'opponent')),
  state text not null
    check (state in ('invited', 'accepted', 'period_active', 'break_active', 'completed', 'forfeit')),
  current_period smallint not null default 0 check (current_period between 0 and 9),
  period_started_at timestamptz,
  break_started_at timestamptz,
  completed_at timestamptz,
  shots_taken int not null default 0 check (shots_taken >= 0),
  goals int not null default 0 check (goals >= 0),
  active_duration_ms int not null default 0 check (active_duration_ms >= 0),
  stake_reserved int not null default 0 check (stake_reserved >= 0),
  entry_fee_paid int not null default 0 check (entry_fee_paid >= 0),
  reserved_inventory_item_id uuid references admin_inventory_items(id) on delete set null,
  reserved_inventory_charges int not null default 0 check (reserved_inventory_charges >= 0),
  consumed_inventory_charges int not null default 0 check (consumed_inventory_charges >= 0),
  inventory_effects_snapshot jsonb,
  result_points smallint not null default 0 check (result_points between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id),
  unique (match_id, side)
);

create index amateur_duel_participant_user_state_idx
  on amateur_duel_participant (user_id, state, updated_at desc);

create table amateur_duel_period_log (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references amateur_duel_match(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  period_number smallint not null check (period_number between 1 and 9),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  shots_taken smallint not null check (shots_taken >= 0),
  goals smallint not null check (goals >= 0),
  duration_ms int not null check (duration_ms >= 0),
  closed_reason text not null check (closed_reason in ('quota', 'timeout', 'window_end')),
  created_at timestamptz not null default now(),
  unique (match_id, user_id, period_number)
);

create table amateur_duel_rating (
  user_id uuid primary key references users(id) on delete cascade,
  points int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  goals_for int not null default 0,
  goals_against int not null default 0,
  matches_played int not null default 0,
  active_duration_seconds int not null default 0,
  updated_at timestamptz not null default now()
);

create table currency_ledger (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  reason text not null
    check (reason in (
      'admin_adjustment',
      'purchase',
      'duel_stake_hold',
      'duel_entry_fee',
      'duel_stake_refund',
      'duel_stake_payout',
      'duel_stake_burn',
      'inventory_purchase'
    )),
  available_delta int not null,
  reserved_delta int not null,
  balance_after int not null,
  reserved_after int not null,
  duel_match_id uuid references amateur_duel_match(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index currency_ledger_user_created_idx
  on currency_ledger (user_id, created_at desc);

create index currency_ledger_duel_match_idx
  on currency_ledger (duel_match_id)
  where duel_match_id is not null;

alter table shot_session
  add column amateur_duel_match_id uuid references amateur_duel_match(id) on delete cascade;

alter table shot_session
  drop constraint if exists shot_session_mode_check;

alter table shot_session
  add constraint shot_session_mode_check
  check (mode in ('daily', 'training', 'amateur_duel', 'story'));

alter table shot_session
  drop constraint if exists shot_session_check;

alter table shot_session
  add constraint shot_session_check
  check (
    (mode = 'daily' and day_pool_id is not null and period_number is not null)
    or (mode = 'training' and training_session_id is not null and period_number is not null)
    or (mode = 'amateur_duel' and amateur_duel_match_id is not null and period_number is not null)
    or (mode = 'story' and story_task_id is not null)
  );

create index shot_session_amateur_duel_idx
  on shot_session (amateur_duel_match_id, user_id, period_number, shot_index)
  where mode = 'amateur_duel';

alter table user_push_preferences
  add column duel_events boolean not null default true;

alter table push_notification_templates
  drop constraint if exists push_notification_templates_category_check;

alter table push_notification_templates
  add constraint push_notification_templates_category_check
  check (category in ('chat', 'daily', 'training', 'duel', 'news'));

insert into push_notification_templates
  (key, category, title, body, trigger_description, click_url)
values
  (
    'duel.challenge_received',
    'duel',
    'Вас вызвали на дуэль',
    '{{challengerName}} ждёт ответа в любительской лиге.',
    'Игрок-любитель отправляет вызов на дуэль.',
    '/?view=amateur'
  ),
  (
    'duel.result_ready',
    'duel',
    'Дуэль завершена',
    '{{resultText}}',
    'Дуэль получила итог: победа, поражение, ничья или двойная неявка.',
    '/?view=amateur'
  )
on conflict (key) do nothing;

insert into amateur_duel_template
  (
    title,
    description,
    starts_at,
    ends_at,
    total_periods,
    shots_per_period,
    period_duration_ms,
    break_duration_ms,
    goalie_id,
    period_speed_presets,
    stake_amount,
    entry_fee_amount
  )
values
  (
    'Классическая дуэль',
    'Три периода по 30 бросков на одинаковых условиях.',
    '2026-01-01 00:00:00+00',
    '2100-01-01 00:00:00+00',
    3,
    30,
    1200000,
    900000,
    'rookie',
    '[
      {"periodNumber":1,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.8,"puckSpeedPerMs":1.3},
      {"periodNumber":2,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.75,"puckSpeedPerMs":1.3},
      {"periodNumber":3,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.7,"puckSpeedPerMs":1.3}
    ]'::jsonb,
    0,
    0
  )
on conflict do nothing;
