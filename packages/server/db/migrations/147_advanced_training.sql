create table advanced_training_run (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  exercise_key text not null,
  state text not null check (state in ('active', 'abandoned', 'completed', 'failed')),
  stage text not null check (stage in ('practice', 'assessment')),
  seed text not null,
  scenario_order jsonb not null,
  situation_index smallint not null default 0 check (situation_index >= 0),
  successes smallint not null default 0 check (successes >= 0),
  series_state jsonb not null default '{}'::jsonb,
  game_core_version int not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index advanced_training_one_active_run_per_user
  on advanced_training_run (user_id)
  where state = 'active';

create table advanced_training_shot (
  run_id uuid not null references advanced_training_run(id) on delete cascade,
  shot_index int not null check (shot_index > 0),
  scenario_id text not null,
  input jsonb not null,
  server_result text not null check (server_result in ('goal', 'save', 'miss')),
  evaluation jsonb not null,
  game_core_version int not null,
  created_at timestamptz not null default now(),
  primary key (run_id, shot_index)
);

create table advanced_training_completion (
  user_id uuid not null references users(id) on delete cascade,
  exercise_key text not null,
  assessment_successes smallint not null check (assessment_successes >= 0),
  reward_stars int not null check (reward_stars >= 0),
  reward_experience int not null check (reward_experience >= 0),
  completed_at timestamptz not null default now(),
  primary key (user_id, exercise_key)
);

insert into game_settings (key, value, label, description)
values (
  'training.advanced_course.config',
  '{"enabled":false,"practiceSituations":5,"assessmentSituations":10,"requiredSuccesses":7,"rewardStars":1,"rewardExperience":1}'::jsonb,
  'Продвинутое обучение',
  'Служебная конфигурация продвинутого обучения. Не редактируется через административный интерфейс.'
)
on conflict (key) do nothing;
