alter table day_pool add column caretaker_ready_at timestamptz;
create table daily_caretaker_user (
 user_id uuid primary key references users(id) on delete cascade,
 deck text[] not null default array['push','trail','piles','turn','throw'],
 introduced_at timestamptz
);
create table daily_caretaker (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 day_pool_id uuid not null references day_pool(id) on delete cascade,
 period_number int not null,
 kind text not null check(kind in ('push','trail','piles','turn','throw')),
 period_end timestamptz not null,
 original_ready_at timestamptz not null,
 attempt_id uuid not null,
 attempt_ids uuid[] not null default array[]::uuid[],
 started_at timestamptz not null,
 updated_at timestamptz not null,
 seq int not null default 0,
 progress jsonb not null default '{"value":0,"cycle":-1}',
 last_input jsonb,
 completed_at timestamptz,
 unique(day_pool_id,period_number)
);
create index daily_caretaker_attempt on daily_caretaker(user_id,attempt_id);
