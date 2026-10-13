create function social_capture_playoff_day(series_uuid uuid,day_uuid uuid) returns void language plpgsql as $$
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
   'seriesScore',jsonb_build_object('home',home_wins,'away',away_wins,'homeId',home_id,'awayId',away_id)));
end $$;

create function social_capture_tournament_result() returns trigger language plpgsql as $$
declare f tournament_fixture%rowtype; home_id uuid; away_id uuid; winner_id uuid; snapshot jsonb; title text; day_id uuid; old_data jsonb;
begin
 if tg_op='UPDATE' then old_data:=to_jsonb(old); else old_data:='{}'; end if;
 if tg_table_name='tournament_round_game_day' then
  if new.status='closed' and old_data->>'status' is distinct from 'closed' then
   for f in select distinct fixture.* from tournament_fixture fixture join tournament_fixture_attempt a on a.fixture_id=fixture.id where a.round_game_day_id=new.id and fixture.series_id is not null
   loop perform social_capture_playoff_day(f.series_id,new.id); end loop;
  end if; return null;
 elsif tg_table_name='tournament_fixture_attempt' then
  if new.status not in ('settled','technical_result') then return null; end if;
  select * into f from tournament_fixture where id=new.fixture_id;
  day_id:=new.round_game_day_id;
 else
  select * into f from tournament_fixture where id=new.id;
  if f.status not in ('settled','forfeit') or old_data->>'status' in ('settled','forfeit') then return null; end if;
  select round_game_day_id into day_id from tournament_fixture_attempt where fixture_id=f.id and status in ('settled','technical_result') order by settled_at desc nulls last,attempt_number desc limit 1;
 end if;
 if f.series_id is not null then
  if day_id is not null then perform social_capture_playoff_day(f.series_id,day_id); end if;
  return null;
 end if;
 if f.status not in ('settled','forfeit') or f.settled_at is null then return null; end if;
 select user_id into home_id from tournament_participant where id=f.home_participant_id;
 select user_id into away_id from tournament_participant where id=f.away_participant_id;
 select user_id into winner_id from tournament_participant where id=f.winner_participant_id;
 select t.title into title from tournament t where id=f.tournament_id;
 snapshot:=jsonb_build_object('tournamentTitle',title,'matchId',f.id,'winnerId',winner_id,'outcome',f.outcome,
  'reason',case when f.status='forfeit' then 'forfeit' else null end,
  'participants',jsonb_build_array(jsonb_build_object('userId',home_id,'score',f.home_score),jsonb_build_object('userId',away_id,'score',f.away_score)));
 perform social_record_activity('regular:'||f.id,'regular',f.settled_at,array[home_id,away_id],snapshot);
 return null;
end $$;
create constraint trigger social_regular after insert or update on tournament_fixture deferrable initially deferred for each row execute function social_capture_tournament_result();
create constraint trigger social_playoff_attempt after insert or update on tournament_fixture_attempt deferrable initially deferred for each row execute function social_capture_tournament_result();
create constraint trigger social_playoff_day after insert or update on tournament_round_game_day deferrable initially deferred for each row execute function social_capture_tournament_result();
