-- Per-provider profile fields mirrored on users for fast reads.
alter table users
  add column tg_first_name text,
  add column tg_last_name text,
  add column tg_avatar_url text,
  add column tg_username text,
  add column vk_first_name text,
  add column vk_last_name text,
  add column vk_avatar_url text,
  add column vk_username text,
  add column display_source text not null default 'telegram'
    check (display_source in ('telegram', 'vk'));

-- Existing avatar_url values are Telegram-sourced because VK auth did not exist yet.
update users u set
  tg_first_name = nullif(ap.provider_data->>'firstName', ''),
  tg_last_name = nullif(ap.provider_data->>'lastName', ''),
  tg_username = nullif(ap.provider_data->>'username', ''),
  tg_avatar_url = u.avatar_url
from auth_providers ap
where ap.user_id = u.id
  and ap.provider = 'telegram';
