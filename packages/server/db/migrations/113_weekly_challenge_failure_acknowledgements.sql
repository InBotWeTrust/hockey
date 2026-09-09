create table weekly_challenge_failure_acknowledgements (
  challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index weekly_challenge_failure_ack_user_idx
  on weekly_challenge_failure_acknowledgements (user_id, acknowledged_at desc);
