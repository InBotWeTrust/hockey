-- Read-only reports. Cohort: natural beginner onboarding completed under v1.
-- Dates use UTC. Do not include immature cohorts in D1/D3/D7 or timed conversion denominators.
begin read only;
set local timezone='UTC';

-- First occurrence of each step, relative to cohort entry (server and client sources distinguished in details).
with cohort as (
 select player_id,min(occurred_at) as joined_at from novice_funnel_events
 where event='onboarding_completed' and details->>'chain'='beginner' and scenario_version='novice-start-v1' group by player_id
), steps as (
 select c.player_id,e.event,min(e.occurred_at) as first_at,c.joined_at
 from cohort c join novice_funnel_events e using(player_id)
 where e.occurred_at>=c.joined_at group by c.player_id,e.event,c.joined_at
)
select event,count(*) as players,avg(extract(epoch from(first_at-joined_at))/3600) as average_hours
from steps group by event order by event;

-- Exact-day observed retention. Missing telemetry is not proof that the player did not return.
with cohort as (
 select player_id,min(occurred_at)::date as joined_date from novice_funnel_events
 where event='onboarding_completed' and details->>'chain'='beginner' and scenario_version='novice-start-v1' group by player_id
)
select d.day,count(*) as mature_players,
 count(*) filter(where exists(select 1 from novice_funnel_events e where e.player_id=c.player_id and e.event='app_active' and e.occurred_at::date=c.joined_date+d.day)) as returned_players
from cohort c cross join (values(1),(3),(7)) d(day)
where current_date>c.joined_date+d.day group by d.day order by d.day;

-- Promotion within 3/7/14 days, with only mature cohorts in each denominator.
with cohort as (
 select player_id,min(occurred_at) as joined_at from novice_funnel_events
 where event='onboarding_completed' and details->>'chain'='beginner' and scenario_version='novice-start-v1' group by player_id
)
select d.days,count(*) as mature_players,
 count(*) filter(where exists(select 1 from novice_funnel_events e where e.player_id=c.player_id and e.event='novice_promoted_to_amateur' and e.occurred_at between c.joined_at and c.joined_at+make_interval(days=>d.days))) as promoted_players
from cohort c cross join (values(3),(7),(14)) d(days)
where now()>=c.joined_at+make_interval(days=>d.days) group by d.days order by d.days;

-- Time and observed sessions to promotion, among converters only (not the full cohort).
with cohort as (
 select player_id,min(occurred_at) as joined_at from novice_funnel_events
 where event='onboarding_completed' and details->>'chain'='beginner' and scenario_version='novice-start-v1' group by player_id
), converted as (
 select c.player_id,c.joined_at,min(e.occurred_at) as promoted_at from cohort c join novice_funnel_events e using(player_id)
 where e.event='novice_promoted_to_amateur' and e.occurred_at>=c.joined_at group by c.player_id,c.joined_at
), measured as (
 select extract(epoch from(promoted_at-joined_at))/3600 as hours,
 -- Include the observed session that was active at cohort entry.
 (select count(*) from novice_funnel_events e where e.player_id=c.player_id and e.event='app_session_started' and e.occurred_at>c.joined_at and e.occurred_at<=c.promoted_at)
 + case when exists(select 1 from novice_funnel_events e where e.player_id=c.player_id and e.event='app_session_started' and e.occurred_at between c.joined_at-interval '30 minutes' and c.joined_at) then 1 else 0 end as sessions
 from converted c
)
select count(*) as converters,avg(hours) as average_hours,percentile_cont(0.5) within group(order by hours) as median_hours,avg(sessions) as average_observed_sessions,percentile_cont(0.5) within group(order by sessions) as median_observed_sessions from measured;

-- First-period -> second-period return within the SAME daily pool.
select count(*) as first_periods_started,count(*) filter(where exists(
 select 1 from event_log second where second.user_id=first.user_id and second.type='novice_funnel'
 and second.payload->>'event'='daily_second_period_started' and second.payload->>'key'=first.payload->>'key'
)) as second_periods_started from event_log first where first.type='novice_funnel' and first.payload->>'event'='daily_first_period_started'
 and exists(select 1 from novice_funnel_events c where c.player_id=first.user_id and c.event='onboarding_completed' and c.details->>'chain'='beginner' and c.occurred_at<=first.created_at)
 and not exists(select 1 from novice_funnel_events p where p.player_id=first.user_id and p.event='novice_promoted_to_amateur' and p.occurred_at<first.created_at);

-- Shot-normalized outcomes (never compare raw goals/day across different shot counts).
select closed_reason,count(*) as periods,sum(goals) as goals,sum(shots_taken) as shots,
 sum(goals)::numeric/nullif(sum(shots_taken),0) as goals_per_shot
from period_log log join day_pool pool on pool.id=log.day_pool_id
where exists(select 1 from novice_funnel_events c where c.player_id=pool.user_id and c.event='onboarding_completed' and c.details->>'chain'='beginner' and c.occurred_at<=log.started_at)
 and not exists(select 1 from novice_funnel_events p where p.player_id=pool.user_id and p.event='novice_promoted_to_amateur' and p.occurred_at<log.started_at)
group by closed_reason;
commit;
