-- Production kept the achievement catalogue from migration 047 after the
-- application rollback. The rolled-back server still granted `first-game`,
-- while the catalogue only contained `first-daily-game`. Repair players who
-- completed the third period during that compatibility window.
--
-- On a legacy schema (such as a clean checkout of the rolled-back main
-- branch), the canonical achievement/columns are absent and this migration is
-- intentionally a no-op. When dev is merged later, migration 047 runs before
-- this file and the same backfill remains valid.
do $$
begin
  if exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_achievements'
          and column_name = 'completed_at'
     )
     and exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_achievements'
          and column_name = 'completion_context'
     )
     and exists (
       select 1
         from achievements
        where id = 'first-daily-game'
     ) then
    insert into user_achievements
      (user_id, achievement_id, completed_at, completion_context)
    select dp.user_id,
           'first-daily-game',
           min(dp.closed_at),
           jsonb_build_object('source', 'prod_compat_backfill')
      from day_pool dp
     where dp.state = 'closed'
       and dp.current_period = 3
       and dp.closed_at is not null
       and exists (
         select 1
           from period_log pl
          where pl.day_pool_id = dp.id
            and pl.period_number = 3
            and pl.closed_reason in ('quota', 'timeout')
       )
     group by dp.user_id
    on conflict (user_id, achievement_id) do nothing;
  end if;
end
$$;
