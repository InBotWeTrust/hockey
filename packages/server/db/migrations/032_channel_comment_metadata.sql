alter table channel_post_comments
  add column if not exists metadata jsonb not null default '{}'::jsonb;
