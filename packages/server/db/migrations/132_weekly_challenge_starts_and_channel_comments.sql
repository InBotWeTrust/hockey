alter table weekly_challenge_tasks
  drop constraint if exists weekly_challenge_tasks_type_check;

alter table weekly_challenge_tasks
  add constraint weekly_challenge_tasks_type_check
  check (type in (
    'goals_scored',
    'duels_played',
    'duels_won',
    'duel_invites_sent',
    'trainings_completed',
    'channel_posts_commented'
  ));

create table if not exists weekly_challenge_start_acknowledgements (
  challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
