create table dev_access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text not null,
  telegram_provider_uid text,
  display_name text not null,
  role text not null default 'player' check (role in ('player', 'admin')),
  user_id uuid references users(id) on delete set null,
  uses int not null default 0,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index dev_access_codes_user_idx
  on dev_access_codes (user_id)
  where user_id is not null;

create index dev_access_codes_active_idx
  on dev_access_codes (created_at desc)
  where revoked_at is null;
