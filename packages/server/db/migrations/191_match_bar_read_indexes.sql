-- hockey:migration-mode non-transactional
-- Concurrent indexes keep gameplay writes available while existing shot history is indexed.
create index concurrently if not exists shot_session_bar_recent_idx
  on shot_session (amateur_duel_match_id, created_at desc, id desc)
  where mode = 'amateur_duel';
-- hockey:migration-statement
create index concurrently if not exists amateur_duel_match_bar_open_idx
  on amateur_duel_match (starts_at, id, ends_at)
  where status in ('invited', 'ready_check', 'active');
