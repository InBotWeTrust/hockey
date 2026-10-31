-- Reuse the existing audit log; no identity or arbitrary client payload is copied.
create unique index novice_funnel_dedup on event_log(user_id,(payload->>'event'),(payload->>'key')) where type='novice_funnel';
alter table users add column novice_yard_hint_offered_at timestamptz;
create function record_novice_funnel(actor uuid, event_name text, event_key text, details jsonb default '{}'::jsonb, happened_at timestamptz default now()) returns void language sql as $$
 insert into event_log(user_id,type,payload,created_at)
 values(actor,'novice_funnel',jsonb_build_object('event',event_name,'key',event_key,'scenario_version','novice-start-v1','details',details),happened_at)
 on conflict do nothing;
$$;
create function novice_funnel_lifecycle() returns trigger language plpgsql as $$
declare actor uuid; details jsonb; threshold integer;
begin
 if TG_TABLE_NAME='onboarding_run' then
  if new.source<>'natural' or new.completed_at is null or old.completed_at is not null then return new; end if;
  perform record_novice_funnel(new.user_id,'onboarding_completed',new.chain_key,jsonb_build_object('chain',new.chain_key,'onboarding_version',new.version_id),new.completed_at);
 elsif TG_TABLE_NAME='day_pool' then
  if new.state='period_active' and new.period_started_at is not null and (TG_OP='INSERT' or old.period_started_at is distinct from new.period_started_at or old.current_period<>new.current_period) and new.current_period in (1,2) then
   perform record_novice_funnel(new.user_id,case when new.current_period=1 then 'daily_first_period_started' else 'daily_second_period_started' end,new.id::text,jsonb_build_object('day',new.day_date,'period',new.current_period),new.period_started_at);
  end if;
 elsif TG_TABLE_NAME='period_log' then
  select user_id into actor from day_pool where id=new.day_pool_id;
  details=jsonb_build_object('period',new.period_number,'shots',new.shots_taken,'goals',new.goals,'reason',new.closed_reason);
  if new.closed_reason in ('quota','timeout') and new.period_number=1 then
   perform record_novice_funnel(actor,'daily_first_period_completed',new.day_pool_id::text,details,new.ended_at);
  end if;
  if new.closed_reason in ('quota','timeout') and new.period_number=3 then
   perform record_novice_funnel(actor,'daily_day_completed',new.day_pool_id::text,details,new.ended_at);
  end if;
 elsif TG_TABLE_NAME='initial_training_completion' then
  perform record_novice_funnel(new.user_id,'novice_exercise_completed',new.exercise_key,jsonb_build_object('exercise',new.exercise_key),new.completed_at);
 elsif TG_TABLE_NAME='achievement_notifications' then
  perform record_novice_funnel(new.user_id,'achievement_unlocked',new.achievement_id||':'||new.stage_number,jsonb_build_object('achievement',new.achievement_id,'stage',new.stage_number),new.created_at);
 elsif TG_TABLE_NAME in ('user_achievements','user_achievement_stages') then
  if new.claimed_at is null or old.claimed_at is not null then return new; end if;
  if TG_TABLE_NAME='user_achievements' then
   if exists(select 1 from achievement_stages where achievement_id=new.achievement_id and is_enabled) then return new; end if;
   details=jsonb_build_object('achievement',new.achievement_id,'stage',0);
  else details=jsonb_build_object('achievement',new.achievement_id,'stage',new.stage_number); end if;
  perform record_novice_funnel(new.user_id,'achievement_claimed',new.achievement_id||':'||(details->>'stage'),details,new.claimed_at);
 elsif TG_TABLE_NAME='users' then
  if new.amateur_access_preserved or old.level>=2 then return new; end if;
  select coalesce((select least(1000000,greatest(0,trunc((value#>>'{}')::numeric)))::int from game_settings where key='amateur.unlock_goals_required' and (value#>>'{}') ~ '^-?[0-9]+(\.[0-9]+)?$'),300) into threshold;
  if (old.daily_goals_total<threshold and new.daily_goals_total>=threshold) or (old.level<2 and new.level>=2) then
   perform record_novice_funnel(new.id,'novice_promoted_to_amateur','once',jsonb_build_object('qualifying_goals',new.daily_goals_total,'threshold',threshold));
  end if;
 end if;
 return new;
end;
$$;
create trigger novice_funnel_onboarding after update of completed_at on onboarding_run for each row execute function novice_funnel_lifecycle();
create trigger novice_funnel_start after insert or update of state,current_period,period_started_at on day_pool for each row execute function novice_funnel_lifecycle();
create trigger novice_funnel_period after insert on period_log for each row execute function novice_funnel_lifecycle();
create trigger novice_funnel_exercise after insert on initial_training_completion for each row execute function novice_funnel_lifecycle();
create trigger novice_funnel_unlock after insert on achievement_notifications for each row execute function novice_funnel_lifecycle();
create trigger novice_funnel_claim after update of claimed_at on user_achievements for each row execute function novice_funnel_lifecycle();
create trigger novice_funnel_stage_claim after update of claimed_at on user_achievement_stages for each row execute function novice_funnel_lifecycle();
create trigger novice_funnel_promotion after update of daily_goals_total,level on users for each row execute function novice_funnel_lifecycle();
create view novice_funnel_events as select user_id as player_id,created_at as occurred_at,payload->>'event' as event,payload->>'scenario_version' as scenario_version,payload->'details' as details from event_log where type='novice_funnel';
