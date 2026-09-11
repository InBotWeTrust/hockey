alter table monthly_duel_rating_placement
  drop constraint if exists monthly_duel_rating_placement_matches_played_check;

alter table monthly_duel_rating_placement
  add constraint monthly_duel_rating_placement_matches_played_check
    check (matches_played >= 1);

alter table monthly_duel_rating_placement
  add column if not exists draws integer not null default 0,
  add column if not exists losses integer not null default 0,
  add column if not exists goals_for integer not null default 0,
  add column if not exists goals_against integer not null default 0;

with live as (
  select entry.season_key,
         entry.user_id,
         sum(entry.points)::int as points,
         sum(entry.wins)::int as wins,
         sum(entry.draws)::int as draws,
         sum(entry.losses)::int as losses,
         sum(entry.goals_for)::int as goals_for,
         sum(entry.goals_against)::int as goals_against,
         count(*)::int as matches_played,
         sum(entry.active_duration_seconds)::int as active_duration_seconds
    from amateur_duel_rating_match entry
    join amateur_duel_match match on match.id = entry.match_id
    join monthly_duel_rating_season season on season.season_key = entry.season_key
   where match.status = 'settled'
     and match.ranked
     and match.source <> 'tournament'
   group by entry.season_key, entry.user_id
), ranked as (
  select live.season_key,
         live.user_id,
         live.points,
         live.wins,
         live.draws,
         live.losses,
         live.goals_for,
         live.goals_against,
         live.matches_played,
         live.active_duration_seconds,
         coalesce(sum(
           case when opponent_live.points = live.points then own_entry.points else 0 end
         ), 0)::int as head_to_head_points
    from live
    left join amateur_duel_rating_match own_entry
      on own_entry.season_key = live.season_key and own_entry.user_id = live.user_id
    left join amateur_duel_rating_match opponent_entry
      on opponent_entry.match_id = own_entry.match_id and opponent_entry.user_id <> live.user_id
    left join live opponent_live
      on opponent_live.season_key = live.season_key and opponent_live.user_id = opponent_entry.user_id
   group by live.season_key, live.user_id, live.points, live.wins, live.draws, live.losses,
            live.goals_for, live.goals_against, live.matches_played, live.active_duration_seconds
), final_rank as (
  select ranked.*,
         row_number() over (
           partition by ranked.season_key
           order by ranked.points desc, ranked.head_to_head_points desc, ranked.matches_played desc,
                    ranked.wins desc, users.display_name asc, ranked.user_id asc
         )::int as place
    from ranked
    join users on users.id = ranked.user_id
)
update monthly_duel_rating_placement placement
   set place = placement.place + 1000000
 where exists (
   select 1 from final_rank where final_rank.season_key = placement.season_key
 );

with live as (
  select entry.season_key,
         entry.user_id,
         sum(entry.points)::int as points,
         sum(entry.wins)::int as wins,
         sum(entry.draws)::int as draws,
         sum(entry.losses)::int as losses,
         sum(entry.goals_for)::int as goals_for,
         sum(entry.goals_against)::int as goals_against,
         count(*)::int as matches_played,
         sum(entry.active_duration_seconds)::int as active_duration_seconds
    from amateur_duel_rating_match entry
    join amateur_duel_match match on match.id = entry.match_id
    join monthly_duel_rating_season season on season.season_key = entry.season_key
   where match.status = 'settled'
     and match.ranked
     and match.source <> 'tournament'
   group by entry.season_key, entry.user_id
), ranked as (
  select live.season_key,
         live.user_id,
         live.points,
         live.wins,
         live.draws,
         live.losses,
         live.goals_for,
         live.goals_against,
         live.matches_played,
         live.active_duration_seconds,
         coalesce(sum(
           case when opponent_live.points = live.points then own_entry.points else 0 end
         ), 0)::int as head_to_head_points
    from live
    left join amateur_duel_rating_match own_entry
      on own_entry.season_key = live.season_key and own_entry.user_id = live.user_id
    left join amateur_duel_rating_match opponent_entry
      on opponent_entry.match_id = own_entry.match_id and opponent_entry.user_id <> live.user_id
    left join live opponent_live
      on opponent_live.season_key = live.season_key and opponent_live.user_id = opponent_entry.user_id
   group by live.season_key, live.user_id, live.points, live.wins, live.draws, live.losses,
            live.goals_for, live.goals_against, live.matches_played, live.active_duration_seconds
), final_rank as (
  select ranked.*,
         row_number() over (
           partition by ranked.season_key
           order by ranked.points desc, ranked.head_to_head_points desc, ranked.matches_played desc,
                    ranked.wins desc, users.display_name asc, ranked.user_id asc
         )::int as place
    from ranked
    join users on users.id = ranked.user_id
)
update monthly_duel_rating_placement placement
   set place = final_rank.place,
       points = final_rank.points,
       wins = final_rank.wins,
       draws = final_rank.draws,
       losses = final_rank.losses,
       goals_for = final_rank.goals_for,
       goals_against = final_rank.goals_against,
       matches_played = final_rank.matches_played,
       active_duration_seconds = final_rank.active_duration_seconds
  from final_rank
 where placement.season_key = final_rank.season_key
   and placement.user_id = final_rank.user_id;

with live as (
  select entry.season_key,
         entry.user_id,
         sum(entry.points)::int as points,
         sum(entry.wins)::int as wins,
         sum(entry.draws)::int as draws,
         sum(entry.losses)::int as losses,
         sum(entry.goals_for)::int as goals_for,
         sum(entry.goals_against)::int as goals_against,
         count(*)::int as matches_played,
         sum(entry.active_duration_seconds)::int as active_duration_seconds
    from amateur_duel_rating_match entry
    join amateur_duel_match match on match.id = entry.match_id
    join monthly_duel_rating_season season on season.season_key = entry.season_key
   where match.status = 'settled'
     and match.ranked
     and match.source <> 'tournament'
   group by entry.season_key, entry.user_id
), ranked as (
  select live.season_key,
         live.user_id,
         live.points,
         live.wins,
         live.draws,
         live.losses,
         live.goals_for,
         live.goals_against,
         live.matches_played,
         live.active_duration_seconds,
         coalesce(sum(
           case when opponent_live.points = live.points then own_entry.points else 0 end
         ), 0)::int as head_to_head_points
    from live
    left join amateur_duel_rating_match own_entry
      on own_entry.season_key = live.season_key and own_entry.user_id = live.user_id
    left join amateur_duel_rating_match opponent_entry
      on opponent_entry.match_id = own_entry.match_id and opponent_entry.user_id <> live.user_id
    left join live opponent_live
      on opponent_live.season_key = live.season_key and opponent_live.user_id = opponent_entry.user_id
   group by live.season_key, live.user_id, live.points, live.wins, live.draws, live.losses,
            live.goals_for, live.goals_against, live.matches_played, live.active_duration_seconds
), final_rank as (
  select ranked.*,
         row_number() over (
           partition by ranked.season_key
           order by ranked.points desc, ranked.head_to_head_points desc, ranked.matches_played desc,
                    ranked.wins desc, users.display_name asc, ranked.user_id asc
         )::int as place
    from ranked
    join users on users.id = ranked.user_id
)
insert into monthly_duel_rating_placement
  (season_key, user_id, place, points, wins, draws, losses, goals_for, goals_against,
   matches_played, active_duration_seconds, coins, stars, tokens, created_at)
select final_rank.season_key,
       final_rank.user_id,
       final_rank.place,
       final_rank.points,
       final_rank.wins,
       final_rank.draws,
       final_rank.losses,
       final_rank.goals_for,
       final_rank.goals_against,
       final_rank.matches_played,
       final_rank.active_duration_seconds,
       0,
       0,
       0,
       season.closed_at
  from final_rank
  join monthly_duel_rating_season season using (season_key)
  left join monthly_duel_rating_placement placement
    on placement.season_key = final_rank.season_key and placement.user_id = final_rank.user_id
 where placement.user_id is null;
