-- Bonus games and reusable home arenas. This migration is intentionally
-- additive so existing daily, training, and amateur sessions remain valid.

alter table users
  add column home_arena_theme_id uuid;

alter table amateur_duel_template
  add column matchmaking_venue_policy text not null default 'neutral_default'
    check (matchmaking_venue_policy in (
      'neutral_default', 'random_participant_home', 'random_unselected'
    ));

alter table amateur_duel_match
  add column home_user_id uuid references users(id) on delete set null,
  add column arena_theme_id uuid,
  add column arena_snapshot jsonb,
  add column venue_policy text;

alter table shot_session
  add column bonus_game_attempt_id uuid;

create table arena_theme (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(trim(slug)) between 1 and 80),
  title text not null check (length(trim(title)) between 1 and 120),
  artwork_url text not null,
  thumbnail_url text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  is_selectable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index arena_theme_active_selectable_idx
  on arena_theme (created_at, id)
  where status = 'active' and is_selectable;

create table bonus_game (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(trim(slug)) between 1 and 80),
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '',
  sort_order int not null check (sort_order > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  access_type text not null default 'free' check (access_type in ('free', 'paid')),
  unlock_price_stars int not null default 0 check (unlock_price_stars >= 0),
  target_goals int not null check (target_goals > 0),
  total_periods smallint not null check (total_periods between 1 and 9),
  break_duration_ms int not null default 0
    check (break_duration_ms between 0 and 10800000),
  period_rules jsonb not null check (jsonb_typeof(period_rules) = 'array'),
  reward_coins int not null default 0 check (reward_coins >= 0),
  reward_stars int not null default 0 check (reward_stars >= 0),
  reward_experience int not null default 0 check (reward_experience >= 0),
  arena_theme_id uuid not null,
  goalkeeper_ready_url text not null,
  goalkeeper_save_url text not null,
  revision int not null default 1 check (revision > 0),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index bonus_game_one_active_sort_order_idx
  on bonus_game (sort_order)
  where status = 'active';

create index bonus_game_catalog_idx
  on bonus_game (status, sort_order, id);

create table bonus_game_attempt (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  bonus_game_id uuid not null references bonus_game(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'completed', 'failed', 'abandoned')),
  state text not null default 'idle'
    check (state in ('idle', 'period_active', 'break_active', 'closed')),
  current_period smallint not null default 0 check (current_period between 0 and 9),
  period_started_at timestamptz,
  break_started_at timestamptz,
  closed_at timestamptz,
  shots_taken int not null default 0 check (shots_taken >= 0),
  goals int not null default 0 check (goals >= 0),
  attempt_seed text not null,
  game_core_version int not null,
  definition_revision int not null check (definition_revision > 0),
  rules_snapshot jsonb not null check (
    jsonb_typeof(rules_snapshot) = 'object'
    and rules_snapshot ?& array[
      'gameId',
      'slug',
      'title',
      'revision',
      'targetGoals',
      'totalPeriods',
      'breakDurationMs',
      'periods',
      'goalkeeperReadyUrl',
      'goalkeeperSaveUrl',
      'arena'
    ]
    and jsonb_typeof(rules_snapshot->'gameId') = 'string'
    and jsonb_typeof(rules_snapshot->'slug') = 'string'
    and jsonb_typeof(rules_snapshot->'title') = 'string'
    and jsonb_typeof(rules_snapshot->'revision') = 'number'
    and jsonb_typeof(rules_snapshot->'targetGoals') = 'number'
    and jsonb_typeof(rules_snapshot->'totalPeriods') = 'number'
    and jsonb_typeof(rules_snapshot->'breakDurationMs') = 'number'
    and jsonb_typeof(rules_snapshot->'periods') = 'array'
    and jsonb_typeof(rules_snapshot->'goalkeeperReadyUrl') = 'string'
    and jsonb_typeof(rules_snapshot->'goalkeeperSaveUrl') = 'string'
    and jsonb_typeof(rules_snapshot->'arena') = 'object'
    and (rules_snapshot->'arena') ?& array[
      'id', 'slug', 'title', 'artworkUrl', 'thumbnailUrl'
    ]
  ),
  reward_snapshot jsonb not null check (jsonb_typeof(reward_snapshot) = 'object'),
  arena_theme_id_snapshot uuid not null,
  arena_snapshot jsonb not null check (jsonb_typeof(arena_snapshot) = 'object'),
  goalkeeper_ready_url text not null,
  goalkeeper_save_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index bonus_game_attempt_one_active_user_idx
  on bonus_game_attempt (user_id)
  where status = 'active';

create index bonus_game_attempt_user_created_idx
  on bonus_game_attempt (user_id, created_at desc);

create table bonus_game_period_log (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references bonus_game_attempt(id) on delete cascade,
  period_number smallint not null check (period_number between 1 and 9),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  shots_taken smallint not null check (shots_taken >= 0),
  goals smallint not null check (goals >= 0),
  duration_ms int not null check (duration_ms >= 0),
  closed_reason text not null
    check (closed_reason in ('quota', 'timeout', 'target_reached', 'attempt_abandoned')),
  created_at timestamptz not null default now(),
  unique (attempt_id, period_number)
);

create table bonus_game_economy_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  bonus_game_id uuid not null references bonus_game(id) on delete restrict,
  attempt_id uuid references bonus_game_attempt(id) on delete set null,
  kind text not null check (kind in ('unlock_purchase', 'first_clear_reward')),
  coins_delta int not null default 0,
  stars_delta int not null default 0,
  experience_delta int not null default 0,
  coins_after int not null check (coins_after >= 0),
  stars_after int not null check (stars_after >= 0),
  experience_after int not null check (experience_after >= 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create unique index bonus_game_economy_one_unlock_purchase_idx
  on bonus_game_economy_event (user_id, bonus_game_id)
  where kind = 'unlock_purchase';

create unique index bonus_game_economy_one_first_clear_reward_idx
  on bonus_game_economy_event (user_id, bonus_game_id)
  where kind = 'first_clear_reward';

create index bonus_game_economy_user_created_idx
  on bonus_game_economy_event (user_id, created_at desc);

create table user_bonus_game_unlock (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  bonus_game_id uuid not null references bonus_game(id) on delete cascade,
  paid_price_stars int not null check (paid_price_stars >= 0),
  economy_event_id uuid not null references bonus_game_economy_event(id) on delete restrict,
  unlocked_at timestamptz not null default now(),
  unique (user_id, bonus_game_id)
);

create table user_bonus_game_completion (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  bonus_game_id uuid not null references bonus_game(id) on delete cascade,
  attempt_id uuid not null references bonus_game_attempt(id) on delete restrict,
  reward_snapshot jsonb not null check (jsonb_typeof(reward_snapshot) = 'object'),
  completed_at timestamptz not null default now(),
  unique (user_id, bonus_game_id)
);

create table user_arena_unlock (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  arena_theme_id uuid not null references arena_theme(id) on delete restrict,
  source_type text not null default 'bonus_game' check (source_type = 'bonus_game'),
  source_bonus_game_id uuid not null references bonus_game(id) on delete restrict,
  source_completion_id uuid not null
    references user_bonus_game_completion(id) on delete restrict,
  unlocked_at timestamptz not null default now(),
  unique (user_id, arena_theme_id)
);

alter table bonus_game
  add constraint bonus_game_arena_theme_id_fkey
  foreign key (arena_theme_id) references arena_theme(id) on delete restrict;

alter table bonus_game_attempt
  add constraint bonus_game_attempt_arena_theme_id_snapshot_fkey
  foreign key (arena_theme_id_snapshot) references arena_theme(id) on delete restrict;

alter table users
  add constraint users_home_arena_theme_id_fkey
  foreign key (home_arena_theme_id) references arena_theme(id) on delete set null;

alter table amateur_duel_match
  add constraint amateur_duel_match_arena_theme_id_fkey
  foreign key (arena_theme_id) references arena_theme(id) on delete set null;

alter table amateur_duel_match
  add constraint amateur_duel_match_venue_policy_check
  check (
    venue_policy is null
    or venue_policy in (
      'direct_challenge', 'neutral_default', 'random_participant_home', 'random_unselected'
    )
  );

alter table shot_session
  add constraint shot_session_bonus_game_attempt_id_fkey
  foreign key (bonus_game_attempt_id) references bonus_game_attempt(id) on delete cascade;

alter table shot_session
  drop constraint if exists shot_session_mode_check;

alter table shot_session
  add constraint shot_session_mode_check
  check (mode in ('daily', 'training', 'amateur_duel', 'bonus', 'story'));

alter table shot_session
  drop constraint if exists shot_session_check;

alter table shot_session
  add constraint shot_session_check
  check (
    (mode = 'daily' and day_pool_id is not null and period_number is not null)
    or (mode = 'training' and training_session_id is not null and period_number is not null)
    or (mode = 'amateur_duel' and amateur_duel_match_id is not null and period_number is not null)
    or (mode = 'bonus' and bonus_game_attempt_id is not null and period_number is not null)
    or (mode = 'story' and story_task_id is not null)
  );

create index shot_session_bonus_attempt_idx
  on shot_session (bonus_game_attempt_id, period_number, shot_index)
  where mode = 'bonus';

alter table currency_ledger
  drop constraint if exists currency_ledger_reason_check,
  add constraint currency_ledger_reason_check
    check (reason in (
      'admin_adjustment',
      'purchase',
      'duel_stake_hold',
      'duel_entry_fee',
      'duel_stake_refund',
      'duel_stake_payout',
      'duel_stake_burn',
      'duel_reward',
      'inventory_purchase',
      'weekly_challenge_reward',
      'bonus_game_reward'
    ));

alter table media_objects
  drop constraint if exists media_objects_purpose_check,
  add constraint media_objects_purpose_check
    check (purpose in (
      'chat_attachment',
      'profile_avatar',
      'chat_avatar',
      'bonus_game_media'
    ));
