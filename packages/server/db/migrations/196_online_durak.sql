create table if not exists bar_card_matches (
  id uuid primary key,
  player_a uuid not null references users(id),
  player_b uuid not null references users(id),
  state jsonb not null,
  deadline_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (player_a <> player_b)
);
create index if not exists bar_card_matches_due on bar_card_matches(deadline_at) where ended_at is null;
create index if not exists bar_card_matches_a on bar_card_matches(player_a) where ended_at is null;
create index if not exists bar_card_matches_b on bar_card_matches(player_b) where ended_at is null;
create table if not exists bar_card_queue (
  user_id uuid primary key references users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists bar_card_invites (
  id uuid primary key,
  sender_id uuid not null references users(id),
  receiver_id uuid not null references users(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','expired')),
  match_id uuid references bar_card_matches(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check(sender_id <> receiver_id)
);
create index if not exists bar_card_invites_pending on bar_card_invites(receiver_id,expires_at) where status='pending';
