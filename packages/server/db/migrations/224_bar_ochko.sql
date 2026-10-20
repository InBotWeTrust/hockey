alter table bar_game_matches drop constraint if exists bar_game_matches_kind_check;
alter table bar_game_matches add constraint bar_game_matches_kind_check check(kind in ('darts','billiards','checkers','ochko'));
alter table bar_game_queue drop constraint if exists bar_game_queue_kind_check;
alter table bar_game_queue add constraint bar_game_queue_kind_check check(kind in ('darts','billiards','checkers','ochko'));
alter table bar_game_invites drop constraint if exists bar_game_invites_kind_check;
alter table bar_game_invites add constraint bar_game_invites_kind_check check(kind in ('darts','billiards','checkers','ochko'));
alter table bar_game_matches drop constraint if exists bar_game_matches_character_check;
alter table bar_game_matches add constraint bar_game_matches_character_check check(character in ('maria','daria','veronika','arsenich','grigory'));
create table if not exists bar_ochko_offers(
 id uuid primary key, user_id uuid not null references users(id), amount bigint not null check(amount between 1 and 30),
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists bar_game_stakes(
 match_id uuid primary key references bar_game_matches(id), user_id uuid not null references users(id),
 offer_id uuid not null unique references bar_ochko_offers(id), amount bigint not null check(amount>0),
 payout bigint check(payout>=0), settled_at timestamptz, created_at timestamptz not null default now(),
 check((payout is null)=(settled_at is null))
);

create index if not exists bar_ochko_offers_expiry on bar_ochko_offers(expires_at);
