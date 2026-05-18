alter table amateur_duel_template
  add column if not exists win_points int not null default 3 check (win_points >= 0),
  add column if not exists draw_points int not null default 1 check (draw_points >= 0),
  add column if not exists win_currency_reward int not null default 0 check (win_currency_reward >= 0),
  add column if not exists draw_currency_reward int not null default 0 check (draw_currency_reward >= 0);

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
      'inventory_purchase'
    ));

update amateur_duel_template
   set updated_at = now()
 where win_points <> 3
    or draw_points <> 1
    or win_currency_reward <> 0
    or draw_currency_reward <> 0;
