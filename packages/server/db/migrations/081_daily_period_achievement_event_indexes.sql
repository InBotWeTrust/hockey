-- hockey:migration-mode non-transactional
-- Keep durable daily-period achievement recovery proportional to one user's
-- pending events instead of scanning the append-only audit log.
-- Drop first so a previously interrupted concurrent build cannot leave an
-- invalid index that IF NOT EXISTS would otherwise mistake for a usable one.
drop index concurrently if exists event_log_daily_period_closed_achievement_idx;
-- hockey:migration-statement
drop index concurrently if exists event_log_daily_period_achievements_evaluated_idx;

-- hockey:migration-statement
create index concurrently if not exists event_log_daily_period_closed_achievement_idx
  on event_log (
    user_id,
    (payload->>'day_pool_id'),
    (payload->>'period_number')
  )
  where type = 'period_closed';

-- hockey:migration-statement
create unique index concurrently if not exists event_log_daily_period_achievements_evaluated_idx
  on event_log (
    user_id,
    (payload->>'day_pool_id'),
    (payload->>'period_number')
  )
  where type = 'daily_period_achievements_evaluated';
