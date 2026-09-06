create table amateur_duel_rating_match (
  match_id uuid not null references amateur_duel_match(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  season_key text not null,
  points int not null default 0,
  wins int not null default 0 check (wins in (0, 1)),
  draws int not null default 0 check (draws in (0, 1)),
  losses int not null default 0 check (losses in (0, 1)),
  goals_for int not null default 0,
  goals_against int not null default 0,
  active_duration_seconds int not null default 0,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create index amateur_duel_rating_match_season_user_idx
  on amateur_duel_rating_match (season_key, user_id);

insert into amateur_duel_rating_match
  (match_id, user_id, season_key, points, wins, draws, losses,
   goals_for, goals_against, active_duration_seconds, created_at)
select match.id,
       participant.user_id,
       match.season_key,
       participant.result_points,
       case when match.outcome <> 'draw' and match.winner_user_id = participant.user_id
            then 1 else 0 end,
       case when match.outcome = 'draw' then 1 else 0 end,
       case when match.outcome <> 'draw'
                  and match.winner_user_id is distinct from participant.user_id
            then 1 else 0 end,
       participant.goals,
       opponent.goals,
       greatest(0, round(participant.active_duration_ms / 1000.0))::int,
       coalesce(match.settled_at, match.updated_at, now())
  from amateur_duel_match match
  join amateur_duel_participant participant on participant.match_id = match.id
  join amateur_duel_participant opponent
    on opponent.match_id = match.id and opponent.user_id <> participant.user_id
 where match.status = 'settled'
   and match.ranked
   and match.source <> 'tournament'
on conflict (match_id, user_id) do nothing;

create view amateur_duel_rating_live as
select entry.season_key,
       entry.user_id,
       sum(entry.points)::int as points,
       sum(entry.wins)::int as wins,
       sum(entry.draws)::int as draws,
       sum(entry.losses)::int as losses,
       sum(entry.goals_for)::int as goals_for,
       sum(entry.goals_against)::int as goals_against,
       count(*)::int as matches_played,
       sum(entry.active_duration_seconds)::int as active_duration_seconds,
       max(entry.created_at) as updated_at
  from amateur_duel_rating_match entry
  join amateur_duel_match match on match.id = entry.match_id
 where match.status = 'settled'
   and match.ranked
   and match.source <> 'tournament'
 group by entry.season_key, entry.user_id;
