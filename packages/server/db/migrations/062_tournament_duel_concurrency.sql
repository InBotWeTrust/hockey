drop index if exists amateur_duel_match_one_open_pair_idx;

create unique index amateur_duel_match_one_open_pair_idx
  on amateur_duel_match (
    least(challenger_user_id, opponent_user_id),
    greatest(challenger_user_id, opponent_user_id)
  )
  where status in ('invited', 'ready_check', 'active') and source <> 'tournament';

create index amateur_duel_match_tournament_open_pair_idx
  on amateur_duel_match (
    least(challenger_user_id, opponent_user_id),
    greatest(challenger_user_id, opponent_user_id),
    created_at
  )
  where status in ('ready_check', 'active') and source = 'tournament';
