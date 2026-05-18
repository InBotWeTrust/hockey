alter table users
  add column if not exists tg_first_name text,
  add column if not exists tg_last_name text,
  add column if not exists tg_avatar_url text,
  add column if not exists tg_username text,
  add column if not exists vk_first_name text,
  add column if not exists vk_last_name text,
  add column if not exists vk_avatar_url text,
  add column if not exists vk_username text,
  add column if not exists custom_display_name text,
  add column if not exists custom_first_name text,
  add column if not exists custom_last_name text,
  add column if not exists custom_avatar_url text,
  add column if not exists display_source text not null default 'telegram';

update users
   set custom_display_name = display_name
 where custom_display_name is null;

alter table users
  drop constraint if exists users_display_source_check;

alter table users
  add constraint users_display_source_check
  check (display_source in ('telegram', 'vk', 'custom'));
