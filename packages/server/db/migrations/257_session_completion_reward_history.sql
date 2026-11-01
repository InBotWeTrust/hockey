alter table currency_ledger
  drop constraint if exists currency_ledger_reason_check,
  add constraint currency_ledger_reason_check
    check (reason in (
      'admin_adjustment', 'purchase', 'duel_stake_hold', 'duel_entry_fee',
      'duel_stake_refund', 'duel_stake_payout', 'duel_stake_burn', 'duel_reward',
      'inventory_purchase', 'weekly_challenge_reward', 'bonus_game_reward',
      'tournament_entry_fee', 'tournament_entry_refund', 'tournament_reward',
      'achievement_reward', 'recovery_kit_use', 'monthly_duel_rating_reward',
      'referral_reward', 'duel_fight_reward',
      'bar_ochko_stake', 'bar_ochko_payout', 'bar_ochko_refund', 'bar_purchase',
      'daily_completion_reward', 'training_completion_reward'
    ));

-- Restore bank history for rewards already granted; do not change balances.
insert into currency_ledger
  (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata, created_at)
select reward.user_id, reward.mode || '_completion_reward', 0, 0,
       coalesce(account.balance, 0), coalesce(account.reserved_balance, 0),
       jsonb_build_object('session_id', reward.session_id, 'stars', reward.stars, 'experience', reward.experience),
       reward.created_at
  from session_completion_reward reward
  left join user_currency_account account on account.user_id = reward.user_id
 where not exists (
   select 1 from currency_ledger ledger
    where ledger.user_id = reward.user_id
      and ledger.reason = reward.mode || '_completion_reward'
      and ledger.metadata->>'session_id' = reward.session_id::text
 );
