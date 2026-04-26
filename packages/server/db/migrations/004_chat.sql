-- Internal chat foundation: chats, chat_members, messages, message_reactions.
-- See: docs/superpowers/specs/2026-04-26-internal-chat-design.md §3

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────
-- chats: top-level chat row. type discriminates DM / group / system channel.
-- entity_type/entity_id are reserved for future team/tournament wiring.
-- ─────────────────────────────────────────────────────────────────────────
create table chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group', 'system')),
  name text,
  created_by uuid not null references users(id),
  entity_type text check (entity_type in ('team', 'tournament')),
  entity_id uuid,
  last_message_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_chats_last_message
  on chats (last_message_at desc nulls last)
  where is_active = true;

-- ─────────────────────────────────────────────────────────────────────────
-- chat_members: membership for direct/group chats. For system channels rows
-- are created lazily on first markAsRead or first message.
-- ─────────────────────────────────────────────────────────────────────────
create table chat_members (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique (chat_id, user_id)
);

create index idx_chat_members_user on chat_members (user_id);
create index idx_chat_members_chat on chat_members (chat_id);

-- ─────────────────────────────────────────────────────────────────────────
-- messages: text messages with reply, soft-delete, generated tsvector for FT.
-- sender_id has no on-delete cascade — orphan messages survive user deletion.
-- ─────────────────────────────────────────────────────────────────────────
create table messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  sender_id uuid not null references users(id),
  content text not null,
  reply_to_id uuid references messages(id) on delete set null,
  is_deleted boolean not null default false,
  search_vector tsvector generated always as (to_tsvector('russian', coalesce(content, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_messages_chat_created_alive
  on messages (chat_id, created_at desc)
  where is_deleted = false;

create index idx_messages_reply
  on messages (reply_to_id)
  where reply_to_id is not null;

create index idx_messages_search
  on messages using gin (search_vector);

-- ─────────────────────────────────────────────────────────────────────────
-- message_reactions: one row per (message, user, emoji). User can stack
-- multiple distinct emojis on the same message.
-- ─────────────────────────────────────────────────────────────────────────
create table message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  emoji varchar(16) not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index idx_message_reactions_message on message_reactions (message_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger: keep chats.last_message_at in sync with newest message.
-- Monotonic update via greatest(): never rewinds last_message_at on out-of-order
-- inserts (replay during reconnect, admin backfill). Without it an older
-- created_at would corrupt chat-list ordering used by getMyChats LATERAL JOIN.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function update_chat_last_message() returns trigger as $$
begin
  update chats
  set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at),
      updated_at = now()
  where id = new.chat_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_update_chat_last_message
after insert on messages for each row
execute function update_chat_last_message();

-- ─────────────────────────────────────────────────────────────────────────
-- pg_trgm GIN index on users.display_name for fast user picker (LIKE %q%).
-- ─────────────────────────────────────────────────────────────────────────
create index idx_users_display_name_trgm
  on users using gin (display_name gin_trgm_ops);
