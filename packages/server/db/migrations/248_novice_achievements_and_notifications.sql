-- Manual rewards use the existing claim transaction and reward ledger.
insert into achievements (id,photo_url,title,description,requirement,category,availability,reward_currency,reward_stars,reward_experience,reward_tokens,sort_order)
values
 ('first-period','/achievements/first-daily-game.webp','Первый период','Первый шаг на игровом льду сделан.','Штатно завершить первый период ежедневной игры: по броскам или по времени.','daily','active',0,2,2,0,(select coalesce(max(sort_order),0)+10 from achievements)),
 ('hockey-school','/achievements/first-training.webp','Школа хоккея','Все упражнения начального курса позади.','Пройти все 7 упражнений начального курса.','training','active',0,10,10,0,(select coalesce(max(sort_order),0)+20 from achievements));

alter table users add column achievement_map_hint_shown_at timestamptz;

-- A notification acknowledgement never claims a reward. Existing completions
-- are intentionally not copied: only new completion events enter this inbox.
create table achievement_notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 achievement_id text not null references achievements(id) on delete cascade,
 stage_number integer not null default 0,
 created_at timestamptz not null default now(),
 shown_at timestamptz,
 unique(user_id,achievement_id,stage_number)
);
create index achievement_notifications_pending on achievement_notifications(user_id,created_at) where shown_at is null;
create function enqueue_achievement_notification() returns trigger language plpgsql as $$
begin
 if new.completed_at is null then return new; end if;
 if TG_OP = 'UPDATE' and old.completed_at is not null then return new; end if;
 if not exists(select 1 from achievements where id=new.achievement_id and availability='active') then return new; end if;
 if TG_TABLE_NAME = 'user_achievements' then
   if exists(select 1 from achievement_stages where achievement_id=new.achievement_id and is_enabled) then return new; end if;
   insert into achievement_notifications(user_id,achievement_id) values(new.user_id,new.achievement_id) on conflict do nothing;
 else
   insert into achievement_notifications(user_id,achievement_id,stage_number) values(new.user_id,new.achievement_id,new.stage_number) on conflict do nothing;
 end if;
 return new;
end;
$$;
create trigger achievement_notification_completed after insert or update of completed_at on user_achievements for each row execute function enqueue_achievement_notification();
create trigger achievement_stage_notification_completed after insert or update of completed_at on user_achievement_stages for each row execute function enqueue_achievement_notification();

-- Archive insert and completion are committed together, including timeout paths.
create function complete_novice_first_period() returns trigger language plpgsql as $$
begin
 if new.period_number=1 and new.closed_reason in ('quota','timeout') then
   insert into user_achievements(user_id,achievement_id,completed_at,completion_context)
   select p.user_id,a.id,new.ended_at,jsonb_build_object('source','daily_period','period_log_id',new.id)
   from day_pool p cross join achievements a
   where p.id=new.day_pool_id and a.id='first-period' and a.availability='active'
   on conflict(user_id,achievement_id) do nothing;
 end if;
 return new;
end;
$$;
create trigger novice_first_period after insert on period_log for each row execute function complete_novice_first_period();

create function complete_novice_hockey_school() returns trigger language plpgsql as $$
begin
 perform 1 from users where id=new.user_id for update;
 if (select count(distinct exercise_key) from initial_training_completion
     where user_id=new.user_id and exercise_key in ('first-shot','three-positions','follow-the-goal','moving-goal','find-the-gap','pressure-window','game-pace'))=7 then
   insert into user_achievements(user_id,achievement_id,completed_at,completion_context)
   select new.user_id,id,new.completed_at,'{"source":"initial_course"}'::jsonb
   from achievements where id='hockey-school' and availability='active'
   on conflict(user_id,achievement_id) do nothing;
 end if;
 return new;
end;
$$;
create trigger novice_hockey_school after insert on initial_training_completion for each row execute function complete_novice_hockey_school();
