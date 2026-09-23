alter table monthly_duel_rating_season
  add column settings_snapshot jsonb not null default '{}'::jsonb;

alter table monthly_duel_rating_placement
  add column experience integer not null default 0 check (experience >= 0);

alter table monthly_duel_rating_placement
  drop constraint monthly_duel_rating_placement_matches_played_check;
alter table monthly_duel_rating_placement
  add constraint monthly_duel_rating_placement_matches_played_check check (matches_played >= 1);

alter table monthly_duel_rating_economy_event
  add column experience integer not null default 0 check (experience >= 0),
  add column experience_balance_after integer not null default 0 check (experience_balance_after >= 0);

alter table monthly_duel_rating_economy_event
  drop constraint if exists monthly_duel_rating_economy_event_check;

alter table monthly_duel_rating_economy_event
  add constraint monthly_duel_rating_economy_event_positive_v2
  check (coins > 0 or stars > 0 or experience > 0 or tokens > 0);

drop index if exists monthly_duel_rating_pending_idx;
create index monthly_duel_rating_pending_idx
  on monthly_duel_rating_placement (user_id, season_key)
  where viewed_at is null and (coins > 0 or stars > 0 or experience > 0 or tokens > 0);

create table monthly_duel_format_placement (
  id uuid primary key default gen_random_uuid(),
  season_key text not null references monthly_duel_rating_season(season_key) on delete cascade,
  scope text not null check (scope in ('express', 'express_plus', 'classic')),
  user_id uuid not null references users(id) on delete cascade,
  place integer not null check (place > 0),
  points integer not null,
  wins integer not null check (wins >= 0),
  draws integer not null check (draws >= 0),
  losses integer not null check (losses >= 0),
  goals_for integer not null,
  goals_against integer not null,
  matches_played integer not null check (matches_played >= 1),
  active_duration_seconds integer not null,
  coins integer not null default 0 check (coins >= 0),
  stars integer not null default 0 check (stars >= 0),
  experience integer not null default 0 check (experience >= 0),
  tokens integer not null default 0 check (tokens >= 0),
  created_at timestamptz not null,
  viewed_at timestamptz,
  unique (season_key, scope, user_id),
  unique (season_key, scope, place)
);

create index monthly_duel_format_pending_idx
  on monthly_duel_format_placement (user_id, season_key)
  where viewed_at is null and (coins > 0 or stars > 0 or experience > 0 or tokens > 0);

create table monthly_duel_format_economy_event (
  id uuid primary key default gen_random_uuid(),
  season_key text not null,
  scope text not null,
  user_id uuid not null,
  coins integer not null check (coins >= 0),
  stars integer not null check (stars >= 0),
  experience integer not null check (experience >= 0),
  tokens integer not null check (tokens >= 0),
  coin_balance_after bigint not null check (coin_balance_after >= 0),
  star_balance_after bigint not null check (star_balance_after >= 0),
  experience_balance_after integer not null check (experience_balance_after >= 0),
  token_balance_after integer not null check (token_balance_after >= 0),
  created_at timestamptz not null,
  unique (season_key, scope, user_id),
  foreign key (season_key, scope, user_id)
    references monthly_duel_format_placement(season_key, scope, user_id) on delete cascade,
  check (coins > 0 or stars > 0 or experience > 0 or tokens > 0)
);
