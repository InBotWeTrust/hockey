create table weekly_challenge_declines (
  challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  declined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index weekly_challenge_declines_user_idx
  on weekly_challenge_declines (user_id, declined_at desc);
