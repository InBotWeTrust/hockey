-- Only live invitation cards are reconciled by game admission transactions.
create index if not exists messages_pending_bar_invites
  on messages ((metadata->>'inviteId'))
  where metadata->>'type'='bar_game_invite' and metadata->>'status'='pending';
create unique index if not exists messages_bar_invite_once
  on messages ((metadata->>'inviteId'))
  where metadata->>'type'='bar_game_invite';
