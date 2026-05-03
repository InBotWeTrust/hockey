alter table channel_post_comments
  add column if not exists reply_to_id uuid references channel_post_comments(id) on delete set null;

alter table channel_post_comments
  drop constraint if exists channel_post_comments_reply_not_self_check;

alter table channel_post_comments
  add constraint channel_post_comments_reply_not_self_check
  check (reply_to_id is null or reply_to_id <> id);

create index if not exists idx_channel_post_comments_reply_to
  on channel_post_comments (reply_to_id)
  where reply_to_id is not null;

create table if not exists channel_post_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references channel_post_comments(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists idx_channel_post_comment_reactions_comment
  on channel_post_comment_reactions (comment_id);
