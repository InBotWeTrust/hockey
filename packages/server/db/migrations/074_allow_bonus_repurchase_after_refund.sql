-- A catalogue reset can refund and remove an unlock while preserving its audit events.
-- Purchases therefore represent history, not a one-per-user/game invariant. The current
-- unlock remains unique through user_bonus_game_unlock's (user_id, bonus_game_id) key.

drop index bonus_game_economy_one_unlock_purchase_idx;

create index bonus_game_economy_unlock_purchase_idx
  on bonus_game_economy_event (user_id, bonus_game_id)
  where kind = 'unlock_purchase';
