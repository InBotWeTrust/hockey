-- Users
create table users (
  id uuid primary key,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  level int not null default 1,
  xp int not null default 0
);

-- OAuth providers (TG + VK, both possible for one user)
create table auth_providers (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('telegram', 'vk')),
  provider_uid text not null,
  provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_uid)
);

-- Wallet / energy
create table user_wallet (
  user_id uuid primary key references users(id) on delete cascade,
  shots_current int not null default 25,
  shots_max int not null default 25,
  shots_bonus int not null default 0,
  shots_updated_at timestamptz not null default now(),
  pucks bigint not null default 0,
  gold_pucks bigint not null default 0,
  medkit_until timestamptz,
  wheel_spins int not null default 2,
  training_energy int not null default 0
);

-- Persistent progress per boss
create table goalie_progress (
  user_id uuid references users(id) on delete cascade,
  goalie_id text not null,
  hp_left int not null,
  total_shots int not null default 0,
  total_goals int not null default 0,
  best_streak int not null default 0,
  current_streak int not null default 0,
  first_cleared_at timestamptz,
  primary key (user_id, goalie_id)
);

-- Duel sessions (source of truth for active duel)
create table duel_sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  goalie_id text not null,
  seed text not null,
  shot_index int not null default 0,
  game_core_version int not null,
  status text not null check (status in ('active', 'closed')),
  started_at timestamptz not null default now(),
  last_shot_at timestamptz,
  closed_at timestamptz
);
create index duel_sessions_user_active_idx
  on duel_sessions (user_id, status)
  where status = 'active';

-- Sticks
create table user_sticks (
  user_id uuid references users(id) on delete cascade,
  stick_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, stick_id)
);

create table user_equipment (
  user_id uuid primary key references users(id) on delete cascade,
  equipped_stick text not null default 'training'
);

-- Friends
create table user_friends (
  user_id uuid references users(id) on delete cascade,
  friend_user_id uuid references users(id) on delete cascade,
  source text not null check (source in ('invite', 'mutual')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_user_id)
);

create table invite_codes (
  code text primary key,
  user_id uuid not null references users(id) on delete cascade,
  uses int not null default 0,
  created_at timestamptz not null default now()
);

-- Event log (audit / analytics / anti-cheat)
create table event_log (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index event_log_user_created_idx on event_log (user_id, created_at desc);
create index event_log_type_created_idx on event_log (type, created_at desc);
