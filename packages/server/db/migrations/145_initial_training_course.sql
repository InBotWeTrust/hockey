insert into game_settings (key, value, label, description)
values (
  'training.initial_course.config',
  '{"enabled":false,"targetGoals":{"first-shot":5,"three-positions":6,"follow-the-goal":5,"moving-goal":5,"find-the-gap":5},"positionOffsetX":160,"goalieFrequencyMultiplier":0.5,"rewardStars":1,"rewardExperience":1}'::jsonb,
  'Начальное обучение',
  'Служебная конфигурация начального обучения. Не редактируется через административный интерфейс.'
)
on conflict (key) do nothing;

create table initial_training_open_access (
  user_id uuid primary key references users(id) on delete cascade,
  source text not null check (source in ('legacy', 'course')),
  unlocked_at timestamptz not null default now()
);

create table initial_training_run (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  exercise_key text not null check (
    exercise_key in (
      'first-shot',
      'three-positions',
      'follow-the-goal',
      'moving-goal',
      'find-the-gap'
    )
  ),
  state text not null check (state in ('active', 'abandoned', 'completed')),
  seed text not null,
  game_core_version int not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index initial_training_run_one_active_per_user_idx
  on initial_training_run (user_id)
  where state = 'active';

create index initial_training_run_user_started_idx
  on initial_training_run (user_id, started_at desc);

create table initial_training_shot (
  run_id uuid not null references initial_training_run(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  shot_index int not null check (shot_index > 0),
  seed text not null,
  input_payload jsonb not null,
  server_result text not null check (server_result in ('goal', 'save', 'miss')),
  game_core_version int not null,
  created_at timestamptz not null default now(),
  primary key (run_id, shot_index)
);

create index initial_training_shot_user_created_idx
  on initial_training_shot (user_id, created_at desc);

create table initial_training_completion (
  user_id uuid not null references users(id) on delete cascade,
  exercise_key text not null check (
    exercise_key in (
      'first-shot',
      'three-positions',
      'follow-the-goal',
      'moving-goal',
      'find-the-gap'
    )
  ),
  completed_at timestamptz not null default now(),
  reward_stars int not null check (reward_stars >= 0),
  reward_experience int not null check (reward_experience >= 0),
  primary key (user_id, exercise_key)
);

insert into initial_training_open_access (user_id, source, unlocked_at)
select totals.user_id, 'legacy', now()
  from (
    select ts.user_id,
           ts.id,
           ts.shots_limit,
           count(ss.id)::int as total_shots
      from training_session ts
      left join shot_session ss
        on ss.training_session_id = ts.id
       and ss.user_id = ts.user_id
       and ss.mode = 'training'
     group by ts.user_id, ts.id, ts.shots_limit
  ) totals
 where totals.total_shots >= totals.shots_limit
group by totals.user_id
on conflict (user_id) do nothing;
