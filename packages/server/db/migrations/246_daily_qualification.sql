-- Freeze source writes during backfill; the trigger also covers old server instances
-- during the deployment compatibility window.
lock table shot_session, period_log in share row exclusive mode;
alter table users
  add column daily_goals_total int not null default 0 check (daily_goals_total >= 0),
  add column amateur_access_preserved boolean not null default false;

with threshold as (
  select coalesce((select least(1000000, greatest(0, trunc((value #>> '{}')::numeric)))
    from game_settings where key = 'amateur.unlock_goals_required'
      and (value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'), 300) as goals
)
update users set amateur_access_preserved = true
from threshold where level >= 2 or lifetime_goals_total >= threshold.goals;

with archived as (
  select dp.user_id, sum(pl.goals)::int as goals
  from period_log pl join day_pool dp on dp.id = pl.day_pool_id group by dp.user_id
), pending as (
  select s.user_id, count(*)::int as goals from shot_session s
  where s.mode = 'daily' and s.server_result = 'goal'
    and not exists (select 1 from period_log pl
      where pl.day_pool_id = s.day_pool_id and pl.period_number = s.period_number)
  group by s.user_id
)
update users u set daily_goals_total = coalesce(a.goals, 0) + coalesce(p.goals, 0)
from (select id from users) ids
left join archived a on a.user_id = ids.id
left join pending p on p.user_id = ids.id
where u.id = ids.id;

create function credit_daily_qualification_goal() returns trigger language plpgsql as $$
begin
  update users set daily_goals_total = daily_goals_total + 1 where id = new.user_id;
  return new;
end;
$$;
create trigger shot_session_daily_qualification_goal
  after insert on shot_session for each row
  when (new.mode = 'daily' and new.server_result = 'goal')
  execute function credit_daily_qualification_goal();
