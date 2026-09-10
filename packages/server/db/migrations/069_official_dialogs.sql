alter table users
  add column if not exists account_kind text not null default 'player';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_account_kind_check'
  ) then
    alter table users
      add constraint users_account_kind_check
      check (account_kind in ('player', 'official'));
  end if;
end $$;

create index if not exists users_account_kind_idx on users (account_kind);

create table if not exists official_dialog_state (
  chat_id uuid primary key references chats(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  last_admin_read_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists official_dialog_state_status_updated_idx
  on official_dialog_state (status, updated_at desc);

create or replace function sync_official_dialog_state()
returns trigger
language plpgsql
as $$
declare
  sender_kind text;
begin
  if not exists (
    select 1
      from chats c
      join chat_members cm on cm.chat_id = c.id
      join users u on u.id = cm.user_id
     where c.id = new.chat_id
       and c.type = 'direct'
       and u.account_kind = 'official'
  ) then
    return new;
  end if;

  select account_kind into sender_kind from users where id = new.sender_id;
  if sender_kind = 'player' then
    insert into official_dialog_state (chat_id, status, closed_at, closed_by, updated_at)
    values (new.chat_id, 'open', null, null, new.created_at)
    on conflict (chat_id) do update
      set status = 'open',
          closed_at = null,
          closed_by = null,
          updated_at = excluded.updated_at;
  else
    insert into official_dialog_state (chat_id, status, updated_at)
    values (new.chat_id, 'open', new.created_at)
    on conflict (chat_id) do update
      set updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_sync_official_dialog_state on messages;
create trigger messages_sync_official_dialog_state
after insert on messages
for each row execute function sync_official_dialog_state();
