alter table users add column first_daily_period_started_at timestamptz;
-- Preserve already-started players, including pools whose active timestamps were cleared.
with starts as (
 select user_id,period_started_at as started_at from day_pool where current_period>0 and period_started_at is not null
 union all select d.user_id,p.started_at from period_log p join day_pool d on d.id=p.day_pool_id
 union all select user_id,created_at from day_pool where current_period>0
)
update users u set first_daily_period_started_at=s.started_at from (select user_id,min(started_at) as started_at from starts group by user_id) s where u.id=s.user_id;
create function remember_first_daily_start() returns trigger language plpgsql as $$
begin
 if new.current_period>0 and new.period_started_at is not null then
  update users set first_daily_period_started_at=new.period_started_at where id=new.user_id and first_daily_period_started_at is null;
 end if;
 return new;
end;
$$;
create trigger remember_first_daily_start after insert or update of current_period,period_started_at on day_pool for each row execute function remember_first_daily_start();
create table user_city_tour (
 user_id uuid primary key references users(id) on delete cascade,
 viewed text[] not null default '{}',
 last_location text not null default 'yard',
 auto_offered_at timestamptz,
 dismissed_at timestamptz,
 completed_at timestamptz,
 updated_at timestamptz not null default now()
);
