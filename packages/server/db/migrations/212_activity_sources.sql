-- Deferred capture reads the final committed transaction state, including final shots,
-- series advancement and the actual bar restriction. No live gameplay rules change.
create function social_capture_result() returns trigger language plpgsql as $$
declare r jsonb:=to_jsonb(new); prior jsonb; actor uuid; actors uuid[]; snapshot jsonb; key text; kind text; happened timestamptz;
 total int; goals int; shots int; periods jsonb; blocked_until timestamptz; all_keys text[];
begin
 if tg_op='UPDATE' then prior:=to_jsonb(old); else prior:='{}'::jsonb; end if;
 actor:=nullif(r->>'user_id','')::uuid;
 if tg_table_name='day_pool' then
  if r->>'state'<>'closed' or prior->>'state'='closed' then return null; end if;
  select count(*)::int,coalesce(sum(shots_taken),0)::int,coalesce(sum(p.goals),0)::int,
   jsonb_agg(jsonb_build_object('period_number',period_number,'shots_taken',shots_taken,'goals',p.goals,
    'closed_reason',closed_reason,'duration_ms',round(extract(epoch from ended_at-started_at)*1000),'ended_at',ended_at) order by period_number)
   into total,shots,goals,periods from period_log p where day_pool_id=new.id;
  -- Count periods separately from the row's shots aggregate.
  if total<3 then return null; end if;
  snapshot:=jsonb_build_object('daily',jsonb_build_object('day_date',r->>'day_date','total_shots',shots,'total_goals',goals,'total_duration_ms',(select coalesce(sum(round(extract(epoch from ended_at-started_at)*1000)),0) from period_log where day_pool_id=new.id),'periods',periods));
  kind:='daily'; key:='daily:'||new.id; happened:=new.closed_at;
 elsif tg_table_name='training_session' or tg_table_name='shot_session' then
  if tg_table_name='shot_session' then
   if r->>'mode'<>'training' then return null; end if;
   select to_jsonb(t) into r from training_session t where id=new.training_session_id;
   actor:=(r->>'user_id')::uuid;
  end if;
  if r->>'state'<>'closed' then return null; end if;
  select count(*)::int,count(*) filter(where server_result='goal')::int into total,goals from shot_session where training_session_id=(r->>'id')::uuid;
  if total<(r->>'shots_limit')::int then return null; end if;
  kind:='training';key:='training:'||(r->>'id');happened:=(r->>'closed_at')::timestamptz;
  snapshot:=jsonb_build_object('training',jsonb_build_object('day_date',r->>'day_date','selected_period',r->'selected_period','shots_limit',r->'shots_limit','total_shots',total,'total_goals',goals,'completed',true));
 elsif tg_table_name in ('initial_training_completion','advanced_training_completion','advanced_training_v2_completion') then
  if tg_table_name='initial_training_completion' then
   all_keys:=array['first-shot','three-positions','follow-the-goal','moving-goal','find-the-gap','pressure-window','game-pace'];kind:='initial_course';
  elsif tg_table_name='advanced_training_v2_completion' then
   all_keys:=array['near_goalie','counter_direction','complex','precise','behind_goalie','corner','edge','super_precise'];kind:='advanced_course';
  else
   all_keys:=array['board-side','open-net','crossing','goalie-leaving','narrow-gap','counter-direction','second-tempo','rhythm-reset'];kind:='advanced_course';
  end if;
  execute format('select count(*)::int from %I where user_id=$1 and exercise_key=any($2)',tg_table_name) into total using actor,all_keys;
  if total<>cardinality(all_keys) then return null; end if;
  key:=kind||':'||actor;happened:=new.completed_at;snapshot:=jsonb_build_object('exercises',total);
 elsif tg_table_name in ('user_achievements','user_achievement_stages') then
  if r->>'claimed_at' is null or prior->>'claimed_at' is not null then return null; end if;
  select jsonb_build_object('id',id,'title',title,'photoUrl',photo_url,'description',description,'requirement',requirement,'category',category,'availability',availability,'futureTag',future_tag,
    'rewardCurrency',reward_currency,'rewardStars',reward_stars,'rewardExperience',reward_experience,'rewardTokens',reward_tokens,'status','claimed','isUnlocked',true,'isClaimable',false)
    into snapshot from achievements where id=new.achievement_id;
  if tg_table_name='user_achievement_stages' then
   snapshot:=snapshot||jsonb_build_object('rewardCurrency',coalesce((new.reward_snapshot->>'currency')::int,0),'rewardStars',coalesce((new.reward_snapshot->>'stars')::int,0),'rewardExperience',coalesce((new.reward_snapshot->>'experience')::int,0),'rewardTokens',coalesce((new.reward_snapshot->>'tokens')::int,0));
  end if;
  snapshot:=jsonb_build_object('achievement',snapshot,'stage',r->'stage_number');kind:='achievement';
  key:='achievement:'||actor||':'||new.achievement_id||':'||coalesce(r->>'stage_number','single');happened:=new.claimed_at;
 elsif tg_table_name='amateur_duel_match' then
  if new.status<>'settled' or prior->>'status'='settled' or new.source='tournament' then return null; end if;
  actors:=array[new.challenger_user_id,new.opponent_user_id];kind:='duel';key:='duel:'||new.id;happened:=new.settled_at;
  select jsonb_agg(jsonb_build_object('userId',p.user_id,'goals',p.goals,'shots',p.shots_taken,'score',case when new.rules_snapshot->>'duelKind' in ('sniper','marathon') then p.format_score else p.goals end,'durationMs',p.active_duration_ms,'points',p.result_points,'side',p.side) order by p.side)
   into periods from amateur_duel_participant p where match_id=new.id;
  snapshot:=jsonb_build_object('participants',periods,'winnerId',new.winner_user_id,'outcome',new.outcome,'reason',new.settled_reason,'format',coalesce(new.rules_snapshot->>'duelKind','classic'),'rules',jsonb_build_object('totalPeriods',new.rules_snapshot->'totalPeriods'),'matchId',new.id);
 elsif tg_table_name='bar_computer_card_history' then
  kind:='bar_cards';key:='cards:computer:'||new.id;happened:=new.ended_at;
  snapshot:=jsonb_build_object('character',new.character_id,'outcome',new.result,'game','Дурак','surrendered',new.surrendered,'provenance',new.provenance);
 elsif tg_table_name='bar_oleg_fights' then
  if new.status<>'resolved' or prior->>'status'='resolved' or new.outcome not in ('win','loss','draw') then return null; end if;
  -- Interrupted runtime cancellation must not be advertised as a played draw.
  if new.runtime->'state'->>'status'='cancelled' then return null; end if;
  kind:='bar_fight';key:='fight:bar:'||new.id;happened:=new.ended_at;
  select c.blocked_until into blocked_until from bar_conflicts c where user_id=actor;
  snapshot:=jsonb_build_object('character','oleg','outcome',new.outcome,'blockedUntil',case when new.outcome='loss' then blocked_until else null end,'timezone',(select timezone from users where id=actor));
 elsif tg_table_name='bar_card_matches' then
  if new.ended_at is null or prior->>'ended_at' is not null or new.state->>'result' is null then return null; end if;
  actors:=array[new.player_a,new.player_b];kind:='bar_cards';key:='cards:online:'||new.id;happened:=new.ended_at;
  snapshot:=jsonb_build_object('game','Дурак','winnerId',case new.state->>'result' when '0' then new.player_a when '1' then new.player_b else null end,'outcome',case when new.state->>'result'='draw' then 'draw' else 'win' end,'participants',jsonb_build_array(jsonb_build_object('userId',new.player_a),jsonb_build_object('userId',new.player_b)),'provenance','server');
 else return null;
 end if;
 if happened is not null then perform social_record_activity(key,kind,happened,coalesce(actors,array[actor]),snapshot); end if;
 return null;
end $$;

create constraint trigger social_daily after insert or update on day_pool deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_training after insert or update on training_session deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_training_shot after insert on shot_session deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_initial_course after insert on initial_training_completion deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_advanced_course after insert on advanced_training_completion deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_advanced_course_v2 after insert on advanced_training_v2_completion deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_achievement after insert or update on user_achievements deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_achievement_stage after insert or update on user_achievement_stages deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_duel after insert or update on amateur_duel_match deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_computer_cards after insert on bar_computer_card_history deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_online_cards after insert or update on bar_card_matches deferrable initially deferred for each row execute function social_capture_result();
create constraint trigger social_bar_fight after insert or update on bar_oleg_fights deferrable initially deferred for each row execute function social_capture_result();
