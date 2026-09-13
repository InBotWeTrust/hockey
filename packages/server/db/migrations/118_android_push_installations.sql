create table android_push_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  installation_id uuid not null,
  fcm_token text not null,
  platform text not null check (platform = 'android'),
  app_version_code int not null check (app_version_code > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_at timestamptz,
  disabled_at timestamptz,
  unique (user_id, installation_id),
  unique (fcm_token)
);

create index android_push_installations_active_user_idx
  on android_push_installations (user_id, updated_at desc)
  where disabled_at is null;
