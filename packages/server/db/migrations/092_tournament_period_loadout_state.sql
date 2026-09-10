alter table amateur_duel_participant
  add column if not exists tournament_loadout_period smallint
    check (tournament_loadout_period between 1 and 9),
  add column if not exists tournament_loadout_version int not null default 0
    check (tournament_loadout_version >= 0),
  add column if not exists tournament_loadout_confirmed_at timestamptz;

comment on column amateur_duel_participant.tournament_loadout_period is
  'Latest explicitly confirmed tournament period boundary; null for legacy and ordinary duels.';

comment on column amateur_duel_participant.tournament_loadout_version is
  'Monotonic tournament-local selection version. Retries of the same boundary selection do not increment it.';
