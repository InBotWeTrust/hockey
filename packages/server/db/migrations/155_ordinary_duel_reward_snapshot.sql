alter table amateur_duel_match
  add column ordinary_reward_snapshot jsonb;

alter table amateur_duel_match
  add constraint amateur_duel_match_ordinary_reward_snapshot_object
  check (ordinary_reward_snapshot is null or jsonb_typeof(ordinary_reward_snapshot) = 'object');
