create table tournament_series_game_day_schedule (
  series_id uuid not null references tournament_playoff_series(id) on delete cascade,
  round_game_day_id uuid not null references tournament_round_game_day(id) on delete cascade,
  starts_at timestamptz,
  schedule_revision integer not null default 1 check (schedule_revision > 0),
  primary key (series_id, round_game_day_id)
);
