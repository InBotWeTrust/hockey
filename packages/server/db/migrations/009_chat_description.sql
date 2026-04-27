-- Optional human-readable description for group/system chats. Surfaced on
-- the chat info screen alongside the member list. Nullable: existing rows
-- (and DMs which never show a description) keep null.

alter table chats
  add column description text null;
