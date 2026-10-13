-- Reserved shot-result pauses are independent of fight pauses.
alter table amateur_duel_participant
  add column result_paused_ms integer not null default 0,
  add column result_pause_starts_at timestamptz,
  add column result_pause_ends_at timestamptz;
