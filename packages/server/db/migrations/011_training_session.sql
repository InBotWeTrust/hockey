-- Beginner training: one daily session per local day, period preset chosen at start.

create table training_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  day_date date not null,
  selected_period smallint not null check (selected_period between 1 and 3),
  state text not null check (state in ('active', 'closed')),
  game_core_version int not null,
  training_seed text not null,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (user_id, day_date)
);

create index training_session_user_day_idx
  on training_session (user_id, day_date desc);

alter table shot_session
  add column training_session_id uuid references training_session(id) on delete cascade;

alter table shot_session
  drop constraint shot_session_mode_check;

alter table shot_session
  add constraint shot_session_mode_check
  check (mode in ('daily', 'training', 'story'));

alter table shot_session
  drop constraint shot_session_check;

alter table shot_session
  add constraint shot_session_check
  check (
    (mode = 'daily' and day_pool_id is not null and period_number is not null)
    or (mode = 'training' and training_session_id is not null and period_number is not null)
    or (mode = 'story' and story_task_id is not null)
  );

create index shot_session_training_idx
  on shot_session (training_session_id, shot_index)
  where mode = 'training';
