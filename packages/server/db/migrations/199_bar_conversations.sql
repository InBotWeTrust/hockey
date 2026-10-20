create table if not exists bar_conversations (
  user_id uuid not null references users(id) on delete cascade,
  character_id text not null check(character_id in ('maria','daria','grigory','arsenich','veronika','oleg','timofey')),
  revision integer not null default 0,
  turns jsonb not null default '[]'::jsonb,
  pending_id uuid,
  pending_until timestamptz,
  primary key(user_id,character_id)
);
create table if not exists bar_conversation_usage (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  requests integer not null default 0,
  primary key(user_id,day)
);
