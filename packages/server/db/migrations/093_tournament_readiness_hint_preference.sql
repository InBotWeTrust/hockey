create table if not exists tournament_readiness_hint_preference (
  tournament_id uuid not null references tournament(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
