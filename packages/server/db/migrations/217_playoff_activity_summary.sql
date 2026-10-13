create or replace function social_capture_playoff_day(series_uuid uuid,day_uuid uuid) returns void language plpgsql as $$
declare s tournament_playoff_series%rowtype; d tournament_round_game_day%rowtype;
 home_id uuid; away_id uuid; game_count int; home_wins int; away_wins int; ended timestamptz; games jsonb; title text;
begin
 select * into s from tournament_playoff_series where id=series_uuid;
 select * into d from tournament_round_game_day where id=day_uuid;
 if s.id is null or d.id is null then return; end if;
 select user_id into home_id from tournament_participant where id=s.higher_seed_participant_id;
 select user_id into away_id from tournament_participant where id=s.lower_seed_participant_id;
 select t.title into title from tournament t where id=s.tournament_id;
 with final_games as (
  select distinct on(f.id) f.id,f.fixture_number,f.home_participant_id,f.away_participant_id,f.home_score,f.away_score,
   f.winner_participant_id,f.outcome,a.round_game_day_id,a.settled_at,a.outcome as attempt_outcome
  from tournament_fixture f join tournament_fixture_attempt a on a.fixture_id=f.id
  where f.series_id=s.id and f.status in ('settled','forfeit') and a.status in ('settled','technical_result') and a.outcome is distinct from 'replay'
  order by f.id,a.settled_at desc nulls last,a.attempt_number desc
 )
 select count(*)::int,max(g.settled_at),jsonb_agg(jsonb_build_object(
   'homeId',hp.user_id,'awayId',ap.user_id,'homeScore',g.home_score,'awayScore',g.away_score,
   'outcome',coalesce(g.attempt_outcome,g.outcome)) order by g.fixture_number)
 into game_count,ended,games from final_games g
 join tournament_participant hp on hp.id=g.home_participant_id join tournament_participant ap on ap.id=g.away_participant_id
 where g.round_game_day_id=d.id;
 if game_count=0 then return; end if;
 if s.status<>'completed' and d.status<>'closed' and game_count<d.max_result_bearing_games then return; end if;
 if exists(select 1 from tournament_fixture_attempt a join tournament_fixture f on f.id=a.fixture_id
  where f.series_id=s.id and a.round_game_day_id=d.id and a.status in ('pending','ready_check','active','needs_admin_decision','needs_reschedule')) then return; end if;
 select count(*) filter(where f.winner_participant_id=s.higher_seed_participant_id)::int,
        count(*) filter(where f.winner_participant_id=s.lower_seed_participant_id)::int
 into home_wins,away_wins from tournament_fixture f
 where f.series_id=s.id and f.status in ('settled','forfeit') and exists(
  select 1 from tournament_fixture_attempt a join tournament_round_game_day gd on gd.id=a.round_game_day_id
  where a.fixture_id=f.id and a.status in ('settled','technical_result') and a.outcome is distinct from 'replay' and gd.day_number<=d.day_number);
 perform social_record_activity('playoff:'||s.id||':'||d.id,'playoff',ended,array[home_id,away_id],
  jsonb_build_object('tournamentTitle',title,'day',d.day_number,'games',games,
   'seriesCompleted',greatest(home_wins,away_wins)>=s.wins_required,
   'seriesWinnerId',case when home_wins>=s.wins_required then home_id when away_wins>=s.wins_required then away_id else null end,
   'roundName',(select name from tournament_round where id=s.round_id),'seriesKind',s.kind,
   'seriesScore',jsonb_build_object('home',home_wins,'away',away_wins,'homeId',home_id,'awayId',away_id)));
end $$;
