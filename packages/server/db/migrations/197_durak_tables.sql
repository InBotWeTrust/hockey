create table if not exists bar_card_rooms (
  id uuid primary key,
  data jsonb not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bar_card_rooms_open on bar_card_rooms(created_at) where ended_at is null;
create table if not exists bar_card_room_players (
  user_id uuid primary key references users(id),
  room_id uuid not null references bar_card_rooms(id)
);
create index if not exists bar_card_room_players_room on bar_card_room_players(room_id);
alter table bar_card_invites add column if not exists room_id uuid references bar_card_rooms(id);
