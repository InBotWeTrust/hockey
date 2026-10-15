create table if not exists bar_game_matches (
 id uuid primary key, kind text not null check(kind in ('darts','billiards','checkers')),
 player_a uuid not null references users(id), player_b uuid references users(id),
 character text check(character in ('maria','veronika','arsenich')), data jsonb not null,
 created_at timestamptz not null default now(), ended_at timestamptz,
 check((player_b is not null and character is null and player_a<>player_b) or (player_b is null and character is not null))
);
create index if not exists bar_game_active_a on bar_game_matches(player_a) where ended_at is null;
create index if not exists bar_game_active_b on bar_game_matches(player_b) where ended_at is null;
create table if not exists bar_game_commands (
 match_id uuid not null references bar_game_matches(id), request_id uuid not null,
 user_id uuid not null references users(id), payload text not null, primary key(match_id,request_id)
);
create table if not exists bar_game_queue (
 user_id uuid primary key references users(id), kind text not null check(kind in ('darts','billiards','checkers')),
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists bar_game_invites (
 id uuid primary key, kind text not null check(kind in ('darts','billiards','checkers')),
 sender_id uuid not null references users(id), receiver_id uuid not null references users(id),
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','expired')),
 match_id uuid references bar_game_matches(id), expires_at timestamptz not null, created_at timestamptz not null default now(),
 check(sender_id<>receiver_id)
);
create index if not exists bar_game_pending_invites on bar_game_invites(receiver_id,expires_at) where status='pending';
-- Existing local Durak keeps its engine and history; this lease only reserves admission.
create table if not exists bar_local_card_sessions (
 user_id uuid primary key references users(id), session_id uuid not null, expires_at timestamptz not null
);
