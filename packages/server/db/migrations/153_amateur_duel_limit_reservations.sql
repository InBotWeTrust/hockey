create table amateur_duel_limit_reservation (
  match_id uuid not null references amateur_duel_match(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  duel_kind text not null check (duel_kind in ('express', 'express_plus', 'classic')),
  accepted_at timestamptz not null,
  released_at timestamptz,
  primary key (match_id, user_id)
);

create index amateur_duel_limit_reservation_user_active_idx
  on amateur_duel_limit_reservation (user_id, accepted_at, duel_kind)
  where released_at is null;

insert into amateur_duel_limit_reservation (match_id, user_id, duel_kind, accepted_at)
select m.id, participant.user_id, m.duel_kind, m.accepted_at
  from amateur_duel_match m
  join amateur_duel_participant participant on participant.match_id = m.id
 where m.source <> 'tournament'
   and m.accepted_at is not null
   and m.status in ('active', 'settled');
