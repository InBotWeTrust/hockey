create table open_window_training_run (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  step_key text not null,
  state text not null check (state in ('active', 'abandoned', 'completed')),
  phase text not null check (phase in ('practice', 'check')),
  scene_variant int not null default 1 check (scene_variant between 1 and 6),
  attempt_token uuid not null default gen_random_uuid(),
  attempt_index int not null default 0 check (attempt_index >= 0),
  decision_index int not null default 0 check (decision_index >= 0),
  sound_count int not null default 0 check (sound_count >= 0),
  practice_decisions int not null default 0 check (practice_decisions >= 0),
  full_runs int not null default 0 check (full_runs >= 0),
  series_decisions int not null default 0 check (series_decisions >= 0),
  shots_taken int not null default 0 check (shots_taken >= 0),
  active_elapsed_ms int not null default 0 check (active_elapsed_ms >= 0),
  skip_recorded boolean not null default false,
  game_core_version int not null,
  bank_version int not null,
  attempt_started_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index open_window_training_one_active_run_per_user
  on open_window_training_run (user_id) where state = 'active';

create table open_window_training_decision (
  run_id uuid not null references open_window_training_run(id) on delete cascade,
  decision_index int not null check (decision_index > 0),
  attempt_token uuid not null,
  scene_id text not null,
  input jsonb not null,
  evaluation jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, decision_index)
);

create table open_window_training_completion (
  user_id uuid not null references users(id) on delete cascade,
  step_key text not null,
  stage text not null,
  reward_stars int not null check (reward_stars >= 0),
  reward_experience int not null check (reward_experience >= 0),
  completed_at timestamptz not null default now(),
  primary key (user_id, step_key)
);

create table open_window_training_finish (
  run_id uuid not null references open_window_training_run(id) on delete cascade,
  attempt_token uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, attempt_token)
);
