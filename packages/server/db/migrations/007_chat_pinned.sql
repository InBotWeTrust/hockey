-- Pinned chats: per-user pin timestamp on chat_members. NULL = not pinned.
-- Used for ordering /chat/list (pinned first by pinned_at desc) and the
-- "max 3 pinned" guard (count where pinned_at is not null per user).

alter table chat_members
  add column pinned_at timestamptz null;

-- Helps the per-user limit check (`count(*) where user_id=? and pinned_at is not null`).
create index idx_chat_members_user_pinned
  on chat_members (user_id)
  where pinned_at is not null;
