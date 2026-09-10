create table monthly_duel_rating_season (
  season_key text primary key check (season_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  eligible_count integer not null check (eligible_count >= 0),
  rewarded_count integer not null check (rewarded_count between 0 and 50),
  closed_at timestamptz not null,
  check (rewarded_count <= eligible_count)
);

create table monthly_duel_rating_placement (
  id uuid primary key default gen_random_uuid(),
  season_key text not null references monthly_duel_rating_season(season_key),
  user_id uuid not null references users(id) on delete cascade,
  place integer not null check (place > 0),
  points integer not null,
  wins integer not null check (wins >= 0),
  matches_played integer not null check (matches_played >= 30),
  active_duration_seconds integer not null,
  coins integer not null check (coins >= 0),
  stars integer not null check (stars >= 0),
  tokens integer not null check (tokens >= 0),
  created_at timestamptz not null,
  viewed_at timestamptz,
  unique (season_key, user_id),
  unique (season_key, place)
);

create index monthly_duel_rating_pending_idx
  on monthly_duel_rating_placement (user_id, season_key)
  where viewed_at is null and (coins > 0 or stars > 0 or tokens > 0);

create table monthly_duel_rating_economy_event (
  id uuid primary key default gen_random_uuid(),
  season_key text not null,
  user_id uuid not null,
  coins integer not null check (coins >= 0),
  stars integer not null check (stars >= 0),
  tokens integer not null check (tokens >= 0),
  coin_balance_after bigint not null check (coin_balance_after >= 0),
  star_balance_after bigint not null check (star_balance_after >= 0),
  token_balance_after integer not null check (token_balance_after >= 0),
  created_at timestamptz not null,
  unique (season_key, user_id),
  foreign key (season_key, user_id)
    references monthly_duel_rating_placement(season_key, user_id) on delete cascade,
  check (coins > 0 or stars > 0 or tokens > 0)
);

alter table currency_ledger
  drop constraint currency_ledger_reason_check,
  add constraint currency_ledger_reason_check
    check (reason in (
      'admin_adjustment', 'purchase', 'duel_stake_hold', 'duel_entry_fee',
      'duel_stake_refund', 'duel_stake_payout', 'duel_stake_burn', 'duel_reward',
      'inventory_purchase', 'weekly_challenge_reward', 'bonus_game_reward',
      'tournament_entry_fee', 'tournament_entry_refund', 'tournament_reward',
      'achievement_reward', 'recovery_kit_use', 'monthly_duel_rating_reward'
    ));
