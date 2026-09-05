alter table currency_ledger
  drop constraint if exists currency_ledger_reason_check,
  add constraint currency_ledger_reason_check
    check (reason in (
      'admin_adjustment',
      'purchase',
      'duel_stake_hold',
      'duel_entry_fee',
      'duel_stake_refund',
      'duel_stake_payout',
      'duel_stake_burn',
      'duel_reward',
      'inventory_purchase',
      'weekly_challenge_reward',
      'bonus_game_reward',
      'tournament_entry_fee',
      'tournament_entry_refund',
      'tournament_reward',
      'achievement_reward'
    ));

insert into currency_ledger
  (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata, created_at)
select ua.user_id,
       'achievement_reward',
       a.reward_currency,
       0,
       account.balance,
       account.reserved_balance,
       jsonb_build_object(
         'achievement_id', a.id,
         'title', 'Награда за достижение «' || a.title || '»',
         'stars', a.reward_stars,
         'experience', a.reward_experience
       ),
       ua.claimed_at
  from user_achievements ua
  join achievements a on a.id = ua.achievement_id
  join user_currency_account account on account.user_id = ua.user_id
 where ua.claimed_at is not null
   and (a.reward_currency <> 0 or a.reward_stars <> 0 or a.reward_experience <> 0)
   and not exists (
     select 1
       from currency_ledger ledger
      where ledger.user_id = ua.user_id
        and ledger.reason = 'achievement_reward'
        and ledger.metadata->>'achievement_id' = ua.achievement_id
   );
