-- Telegram-like channels. Posts are stored as messages in a chat with
-- type='channel' so reactions, unread counts and realtime delivery reuse the
-- existing chat pipeline. Comments and view history stay separate from the
-- channel feed.

alter table chats
  drop constraint if exists chats_type_check;

alter table chats
  add constraint chats_type_check
  check (type in ('direct', 'group', 'system', 'channel'));

alter table chats
  add column if not exists channel_slug text;

alter table chats
  add constraint chats_channel_slug_type_check
  check (
    (type = 'channel' and channel_slug is not null)
    or
    (type <> 'channel' and channel_slug is null)
  );

create unique index if not exists idx_chats_channel_slug_active
  on chats (channel_slug)
  where type = 'channel' and is_active = true;

create table channel_post_views (
  id uuid primary key default gen_random_uuid(),
  post_message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  view_count integer not null default 1 check (view_count > 0),
  unique (post_message_id, user_id)
);

create index idx_channel_post_views_post
  on channel_post_views (post_message_id, last_viewed_at desc);

create index idx_channel_post_views_user
  on channel_post_views (user_id, last_viewed_at desc);

create table channel_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_message_id uuid not null references messages(id) on delete cascade,
  author_id uuid not null references users(id),
  content text not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_channel_post_comments_post_created_alive
  on channel_post_comments (post_message_id, created_at asc)
  where is_deleted = false;
