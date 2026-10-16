-- Preserve existing history reasons and add paid Ochko entries.
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
      'bar_ochko_stake', 'bar_ochko_payout', 'bar_ochko_refund'
    ));
