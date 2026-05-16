alter table users
  add column if not exists custom_display_name text,
  add column if not exists custom_first_name text,
  add column if not exists custom_last_name text,
  add column if not exists custom_avatar_url text;

alter table chats
  add column if not exists avatar_url text;

update users
   set custom_display_name = display_name
 where custom_display_name is null;

alter table users
  drop constraint if exists users_display_source_check;

alter table users
  add constraint users_display_source_check
  check (display_source in ('telegram', 'vk', 'custom'));

create table media_objects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('chat_attachment', 'profile_avatar', 'chat_avatar')),
  object_key text not null unique,
  url text not null,
  content_type text not null,
  size_bytes int not null check (size_bytes > 0),
  original_name text not null default '',
  created_at timestamptz not null default now()
);

create index media_objects_owner_created_idx
  on media_objects (owner_user_id, created_at desc);

create index media_objects_purpose_created_idx
  on media_objects (purpose, created_at desc);
