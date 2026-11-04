-- Accepted shots and their deferred progress are committed atomically.
create table duel_shot_progress (
 event_key text primary key,
 match_id uuid not null references amateur_duel_match(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade,
 occurred_at timestamptz not null,
 payload jsonb not null,
 retry_at timestamptz not null default now()
);
create index duel_shot_progress_pending on duel_shot_progress(retry_at,occurred_at,event_key);
create index duel_shot_progress_user_order on duel_shot_progress(user_id,occurred_at,event_key);
