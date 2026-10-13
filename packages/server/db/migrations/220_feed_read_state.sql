alter table users add column social_feed_read_until timestamptz not null default 'epoch';
alter table social_activity add column published_at timestamptz not null default now();
create table social_feed_read (
  user_id uuid not null references users(id) on delete cascade,
  event_id uuid not null,
  primary key(user_id,event_id)
);
create index social_activity_published_idx on social_activity(published_at desc,id);
