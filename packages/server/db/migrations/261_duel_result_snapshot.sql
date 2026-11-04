-- Immutable display summaries avoid replaying completed Rhythm movement on every read.
create table amateur_duel_result_snapshot (
 match_id uuid not null references amateur_duel_match(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade,
 version integer not null,
 result jsonb not null,
 primary key(match_id,user_id,version)
);
