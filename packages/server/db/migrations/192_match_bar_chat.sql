-- Embedded match chats reuse guarded messages, replies and reactions.
create table bar_match_chat (
  kind text not null check (kind in ('duel', 'tournament')),
  match_id uuid not null,
  chat_id uuid not null unique references chats(id) on delete cascade,
  primary key (kind, match_id)
);
