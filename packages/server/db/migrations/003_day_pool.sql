-- Daily-game shot session model (replaces legacy HP-based duel_sessions).
-- See: docs/superpowers/plans/0001-daily-game-shot-session.md (or 1-1-async-dawn).

create extension if not exists pgcrypto;

-- Per-user IANA timezone, set once at first login (immutable via API).
-- Existing users get 'UTC'; can be patched manually per support requests.
alter table users
  add column timezone text not null default 'UTC';
alter table users
  alter column timezone drop default;

-- Denormalised lifetime stats for personal rating: incremented when a daily
-- period closes (insert into period_log). Reading them is O(1) instead of a
-- per-request aggregation over period_log.
alter table users
  add column lifetime_shots_total int not null default 0,
  add column lifetime_goals_total int not null default 0;

-- Legacy HP-based duel sessions are replaced by day_pool + period_log + shot_session.
drop table if exists duel_sessions;

-- Daily game pool: at most one open record per user.
create table day_pool (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  day_date date not null,
  state text not null check (state in ('idle', 'period_active', 'break_active', 'closed')),
  current_period smallint not null default 0 check (current_period between 0 and 3),
  period_started_at timestamptz,
  break_started_at timestamptz,
  closed_at timestamptz,
  game_core_version int not null,
  daily_seed text not null,
  created_at timestamptz not null default now()
);

create unique index day_pool_one_open_per_user
  on day_pool (user_id) where state != 'closed';

create index day_pool_user_day_idx
  on day_pool (user_id, day_date desc);

-- Archived per-period stats. Insert when a period closes.
create table period_log (
  id uuid primary key default gen_random_uuid(),
  day_pool_id uuid not null references day_pool(id) on delete cascade,
  period_number smallint not null check (period_number between 1 and 3),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  shots_taken smallint not null,
  goals smallint not null,
  closed_reason text not null check (closed_reason in ('quota', 'timeout', 'day_end')),
  unique (day_pool_id, period_number)
);

-- One row per shot. Shared by daily and story modes.
create table shot_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  mode text not null check (mode in ('daily', 'story')),
  day_pool_id uuid references day_pool(id) on delete cascade,
  story_task_id uuid,
  period_number smallint,
  shot_index int not null,
  seed text not null,
  input_payload jsonb not null,
  server_result text not null check (server_result in ('goal', 'save', 'miss')),
  game_core_version int not null,
  created_at timestamptz not null default now(),
  check (
    (mode = 'daily' and day_pool_id is not null and period_number is not null)
    or (mode = 'story' and story_task_id is not null)
  )
);

create index shot_session_pool_idx
  on shot_session (day_pool_id, period_number, shot_index)
  where mode = 'daily';
