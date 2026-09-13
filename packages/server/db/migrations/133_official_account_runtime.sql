insert into users (id, display_name, avatar_url, timezone, role, account_kind)
values (
  '00000000-0000-4000-8000-000000000099',
  'Ультимейт Хоккей',
  '/icons/official-account.webp',
  'Europe/Moscow',
  'player',
  'official'
)
on conflict (id) do update
   set display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       timezone = excluded.timezone,
       account_kind = excluded.account_kind;
