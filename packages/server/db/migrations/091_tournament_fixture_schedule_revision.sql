alter table tournament_round
  add column if not exists schedule_revision int not null default 0,
  add column if not exists rescheduled_starts_at timestamptz;

alter table tournament_round_game_day
  add column if not exists schedule_revision int not null default 0,
  add column if not exists rescheduled_starts_at timestamptz;
