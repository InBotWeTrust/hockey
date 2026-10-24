-- Persist profile counters on completion changes, never on public profile reads.
create table achievement_catalog_summary (
  singleton boolean primary key default true check (singleton),
  total_tasks integer not null default 0 check (total_tasks >= 0),
  total_levels integer not null default 0 check (total_levels >= 0)
);
insert into achievement_catalog_summary(singleton) values (true);

create table user_achievement_summary (
  user_id uuid primary key references users(id) on delete cascade,
  completed_tasks integer not null default 0 check (completed_tasks >= 0),
  completed_levels integer not null default 0 check (completed_levels >= 0)
);

-- Canonical completion counts: a stage reward claim is not a second completion.
create function calculate_achievement_summary(player_id uuid)
returns table(completed_tasks integer, completed_levels integer)
language sql stable as $$
  with progress as (
    select greatest(definition.total, 1) as total,
           case when definition.total > 0 then least(definition.total, coalesce(stages.completed, 0))
                else case when legacy.completed_at is not null or legacy.claimed_at is not null then 1 else 0 end
           end as completed
      from achievements a
      cross join lateral (
        select count(*)::int as total from achievement_stages s
         where s.achievement_id = a.id and s.is_enabled
      ) definition
      left join user_achievements legacy on legacy.achievement_id = a.id and legacy.user_id = player_id
      left join lateral (
        select count(*)::int as completed from user_achievement_stages s
         where s.achievement_id = a.id and s.user_id = player_id
           and (s.completed_at is not null or s.claimed_at is not null)
      ) stages on true
     where a.availability <> 'hidden'
  )
  select count(*) filter (where completed = total)::int,
         coalesce(sum(completed), 0)::int from progress;
$$;

create function refresh_user_achievement_summary(player_id uuid)
returns void language plpgsql as $$
begin
  if not exists(select 1 from users where id = player_id) then return; end if;
  -- Catalogue rebuilds and player completion updates use the same lock order.
  perform 1 from achievement_catalog_summary where singleton for share;
  insert into user_achievement_summary(user_id) values (player_id) on conflict do nothing;
  perform 1 from user_achievement_summary where user_id = player_id for update;
  update user_achievement_summary target
     set completed_tasks = result.completed_tasks, completed_levels = result.completed_levels
    from calculate_achievement_summary(player_id) result where target.user_id = player_id;
end;
$$;

create function rebuild_achievement_summaries()
returns trigger language plpgsql as $$
begin
  perform 1 from achievement_catalog_summary where singleton for update;
  update achievement_catalog_summary
     set (total_tasks, total_levels) = (
       select count(*)::int, coalesce(sum(greatest(stage_count.total, 1)),0)::int
         from achievements a cross join lateral (
           select count(*)::int as total from achievement_stages s
            where s.achievement_id = a.id and s.is_enabled
         ) stage_count where a.availability <> 'hidden'
     ) where singleton;
  insert into user_achievement_summary(user_id, completed_tasks, completed_levels)
    select u.id, result.completed_tasks, result.completed_levels from users u
    cross join lateral calculate_achievement_summary(u.id) result
  on conflict(user_id) do update set completed_tasks = excluded.completed_tasks,
                                    completed_levels = excluded.completed_levels;
  return null;
end;
$$;

create function achievement_completion_summary_changed()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.completed_at is null and new.claimed_at is null then return null; end if;
    perform refresh_user_achievement_summary(new.user_id);
  elsif tg_op = 'DELETE' then
    if old.completed_at is null and old.claimed_at is null then return null; end if;
    perform refresh_user_achievement_summary(old.user_id);
  else
    if (old.completed_at is not null or old.claimed_at is not null) =
       (new.completed_at is not null or new.claimed_at is not null)
       and old.user_id = new.user_id and old.achievement_id = new.achievement_id then
      return null;
    end if;
    perform refresh_user_achievement_summary(old.user_id);
    if old.user_id <> new.user_id then perform refresh_user_achievement_summary(new.user_id); end if;
  end if;
  return null;
end;
$$;

create function initialize_user_achievement_summary()
returns trigger language plpgsql as $$
begin
  insert into user_achievement_summary(user_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;

create trigger achievement_catalog_summary_changed
  after insert or delete or update of availability on achievements
  for each statement execute function rebuild_achievement_summaries();
create trigger achievement_stage_catalog_summary_changed
  after insert or delete or update of is_enabled, achievement_id on achievement_stages
  for each statement execute function rebuild_achievement_summaries();
create trigger user_achievement_completion_summary_changed
  after insert or delete or update of completed_at, claimed_at, user_id, achievement_id on user_achievements
  for each row execute function achievement_completion_summary_changed();
create trigger user_stage_completion_summary_changed
  after insert or delete or update of completed_at, claimed_at, user_id, achievement_id on user_achievement_stages
  for each row execute function achievement_completion_summary_changed();
create trigger user_achievement_summary_initialized
  after insert on users for each row execute function initialize_user_achievement_summary();

-- Replace the old profile-read repair for historical verified purchases. Rewards remain unclaimed.
insert into user_achievements(user_id, achievement_id, completed_at)
  select p.user_id, 'wallet', coalesce(min(p.paid_at), now())
    from payments p join users u on u.id = p.user_id
    join achievements a on a.id = 'wallet' and a.availability = 'active'
   where p.status = 'paid'
   group by p.user_id
on conflict(user_id, achievement_id) do nothing;

-- One transactional backfill; future catalogue statements maintain both totals and progress.
update achievements set availability = availability where false;
