alter table users
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid references users(id) on delete set null,
  add column if not exists block_reason text;

create index if not exists users_blocked_at_idx
  on users (blocked_at)
  where blocked_at is not null;
