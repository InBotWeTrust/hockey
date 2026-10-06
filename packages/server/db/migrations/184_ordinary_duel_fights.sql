create table amateur_duel_fight (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null unique references amateur_duel_match(id) on delete cascade,
 initiator_user_id uuid not null references users(id),
 request_id uuid not null,
 response_request_id uuid,
 response_decision text check (response_decision in ('accept','decline')),
 status text not null check (status in ('offered','starting','fighting','sudden_death','resolved','declined','cancelled')),
 offered_at timestamptz not null,
 response_deadline_at timestamptz not null,
 starts_at timestamptz,
 rules jsonb not null,
 engine_state jsonb,
 winner_user_id uuid references users(id),
 resolved_at timestamptz,
 reason text,
 compensation_ms jsonb not null default '[0,0]'::jsonb,
 revision bigint not null default 1
);
create table amateur_duel_fight_presence (
 match_id uuid not null references amateur_duel_match(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade,
 connection_id uuid not null,
 expires_at timestamptz not null,
 compensation_ms integer not null default 0 check (compensation_ms between 0 and 150),
 primary key(match_id,user_id)
);
create table amateur_duel_fight_command (
 fight_id uuid not null references amateur_duel_fight(id) on delete cascade,
 user_id uuid not null references users(id),
 action_id uuid not null,
 seq integer not null check(seq > 0),
 phase_id integer not null,
 received_at timestamptz not null,
 effective_at_ms bigint not null,
 payload jsonb not null,
 ack jsonb not null,
 primary key(fight_id,user_id,seq),
 unique(fight_id,user_id,action_id)
);
create table amateur_duel_fight_reward (
 fight_id uuid not null references amateur_duel_fight(id) on delete cascade,
 user_id uuid not null references users(id),
 stars integer not null check(stars between 0 and 1),
 experience integer not null check(experience = 1),
 won boolean not null,
 created_at timestamptz not null default now(),
 primary key(fight_id,user_id)
);
create table amateur_duel_fight_outbox (
 id bigint generated always as identity primary key,
 match_id uuid not null references amateur_duel_match(id) on delete cascade,
 revision bigint not null,
 published_at timestamptz,
 created_at timestamptz not null default now(),
 unique(match_id,revision)
);
create index amateur_duel_fight_pending on amateur_duel_fight(status) where status in ('offered','starting','fighting','sudden_death');
insert into game_settings(key,value,label,description)
 values ('duels.fights.enabled','false'::jsonb,'Драки в обычных дуэлях','Разрешает новые вызовы после двухклиентной проверки') on conflict(key) do nothing;
