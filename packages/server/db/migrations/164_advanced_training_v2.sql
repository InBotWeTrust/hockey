create table advanced_training_v2_run (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  exercise_key text not null,
  state text not null check (state in ('active', 'abandoned', 'completed')),
  stage text not null check (stage in ('practice', 'assessment')),
  side text not null check (side in ('left', 'right')),
  side_successes jsonb not null default '{"left":0,"right":0}'::jsonb,
  seed text not null,
  attempt_ordinal int not null default 0 check (attempt_ordinal >= 0),
  shot_index int not null default 0 check (shot_index >= 0),
  game_core_version int not null,
  bank_version int not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index advanced_training_v2_one_active_run_per_user
  on advanced_training_v2_run (user_id) where state = 'active';

create table advanced_training_v2_shot (
  run_id uuid not null references advanced_training_v2_run(id) on delete cascade,
  shot_index int not null check (shot_index > 0),
  scenario_id text not null,
  input jsonb not null,
  server_result text not null check (server_result in ('goal', 'save', 'miss')),
  evaluation jsonb not null,
  game_core_version int not null,
  created_at timestamptz not null default now(),
  primary key (run_id, shot_index)
);

create table advanced_training_v2_completion (
  user_id uuid not null references users(id) on delete cascade,
  exercise_key text not null,
  reward_stars int not null check (reward_stars >= 0),
  reward_experience int not null check (reward_experience >= 0),
  completed_at timestamptz not null default now(),
  primary key (user_id, exercise_key)
);
