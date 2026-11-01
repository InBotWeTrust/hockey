create table session_completion_reward (
  mode text not null check (mode in ('daily', 'training')),
  session_id uuid not null,
  user_id uuid not null references users(id),
  stars integer not null,
  experience integer not null,
  created_at timestamptz not null default now(),
  primary key (mode, session_id)
);
