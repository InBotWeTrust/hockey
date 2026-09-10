create table tournament_regular_podium_congratulation (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  place smallint not null check (place between 1 and 3),
  tournament_title text not null,
  reward_coins integer not null default 0 check (reward_coins >= 0),
  reward_stars integer not null default 0 check (reward_stars >= 0),
  reward_experience integer not null default 0 check (reward_experience >= 0),
  created_at timestamptz not null default now(),
  viewed_at timestamptz,
  unique (tournament_id, user_id)
);

create index tournament_regular_podium_congratulation_pending_idx
  on tournament_regular_podium_congratulation (user_id, created_at, id)
  where viewed_at is null;
