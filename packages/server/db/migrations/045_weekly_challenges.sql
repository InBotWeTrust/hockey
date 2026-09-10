-- Weekly challenges: one active challenge can be shown to players.

alter table users
  add column if not exists stars int not null default 0 check (stars >= 0),
  add column if not exists experience int not null default 0 check (experience >= 0);

alter table currency_ledger
  drop constraint if exists currency_ledger_reason_check,
  add constraint currency_ledger_reason_check
    check (reason in (
      'admin_adjustment',
      'purchase',
      'duel_stake_hold',
      'duel_entry_fee',
      'duel_stake_refund',
      'duel_stake_payout',
      'duel_stake_burn',
      'duel_reward',
      'inventory_purchase',
      'weekly_challenge_reward'
    ));

create table weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '',
  join_open_at timestamptz not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_active boolean not null default false,
  join_enabled boolean not null default true,
  reward_coins int not null default 0 check (reward_coins >= 0),
  reward_stars int not null default 0 check (reward_stars >= 0),
  reward_experience int not null default 0 check (reward_experience >= 0),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (join_open_at <= start_at),
  check (start_at < end_at)
);

create unique index weekly_challenges_one_active_idx
  on weekly_challenges ((is_active))
  where is_active;

create index weekly_challenges_timeline_idx
  on weekly_challenges (start_at desc, end_at desc);

create table weekly_challenge_tasks (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  type text not null check (
    type in (
      'goals_scored',
      'duels_played',
      'duels_won',
      'duel_invites_sent',
      'trainings_completed'
    )
  ),
  title text,
  target int not null check (target > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index weekly_challenge_tasks_challenge_idx
  on weekly_challenge_tasks (challenge_id, sort_order, created_at);

create table weekly_challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  reward_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create index weekly_challenge_participants_user_idx
  on weekly_challenge_participants (user_id, joined_at desc);

create table weekly_challenge_reward_claims (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  coins int not null check (coins >= 0),
  stars int not null check (stars >= 0),
  experience int not null check (experience >= 0),
  claimed_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);
