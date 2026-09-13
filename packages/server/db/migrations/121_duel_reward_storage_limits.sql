-- Forward-only validation. Preserve existing balances, ledgers and snapshots.
-- NOT VALID checks enforce new writes without rewriting historical configuration.
create or replace function duel_reward_amount_valid(amount jsonb)
returns boolean language sql immutable as $$
  select case when jsonb_typeof(amount) = 'object' then
    amount ?& array['coins','stars','tokens']
    and amount - array['coins','stars','tokens']::text[] = '{}'::jsonb
    and not exists (
      select 1 from jsonb_each(amount) entry
      where case when jsonb_typeof(entry.value) = 'number'
        then (entry.value::text)::numeric < 0
          or (entry.value::text)::numeric > 2147483647
          or (entry.value::text)::numeric <> trunc((entry.value::text)::numeric)
        else true end
    )
    else false end;
$$;

create function duel_reward_storage_valid(rules jsonb, win_coins numeric, draw_coins numeric,
  win_stars numeric, stake numeric, fee numeric)
returns boolean language sql immutable as $$
  select coalesce(duel_reward_rules_valid(rules)
    and win_coins between 0 and 2147483647
    and draw_coins between 0 and 2147483647
    and win_stars between 0 and 2147483647
    and stake between 0 and 1073741823
    and fee between 0 and 2147483647
    and stake + fee <= 2147483647
    and not exists (
      select 1 from jsonb_each(rules) category
      where category.key in ('strongerWin','equalWin','weakerWin','draw','loss')
        and (
          (category.value->>'coins')::numeric
            + case when category.key in ('strongerWin','equalWin','weakerWin') then win_coins + stake*2
                   when category.key = 'draw' then draw_coins + stake else 0 end > 2147483647
          or (category.value->>'stars')::numeric
            + case when category.key in ('strongerWin','equalWin','weakerWin') then win_stars else 0 end > 2147483647
        )
    ), false);
$$;

alter table amateur_duel_template add constraint amateur_duel_template_reward_storage
  check (duel_reward_storage_valid(reward_rules, win_currency_reward, draw_currency_reward,
    win_star_reward, stake_amount, entry_fee_amount)) not valid;

alter table amateur_duel_match add constraint amateur_duel_match_reward_storage
  check (duel_reward_storage_valid(reward_rules,
    coalesce((rules_snapshot->>'winCurrencyReward')::numeric,0),
    coalesce((rules_snapshot->>'drawCurrencyReward')::numeric,0),
    coalesce((rules_snapshot->>'winStarReward')::numeric,0),stake_amount,entry_fee_amount)) not valid;
