-- Add Rhythm without rewriting existing rules snapshots, results or rewards.
alter table bonus_game drop constraint bonus_game_skill_code_check;
alter table bonus_game add constraint bonus_game_skill_code_check check(skill_code in ('speed','accuracy','marksmanship','endurance','challenge','rhythm'));
alter table bonus_game_daily_attempt_slot drop constraint bonus_game_daily_attempt_slot_skill_code_check;
alter table bonus_game_daily_attempt_slot add constraint bonus_game_daily_attempt_slot_skill_code_check check(skill_code in ('speed','accuracy','marksmanship','endurance','challenge','rhythm'));
alter table bonus_game_record drop constraint bonus_game_record_skill_code_check;
alter table bonus_game_record add constraint bonus_game_record_skill_code_check check(skill_code in ('speed','accuracy','marksmanship','endurance','rhythm'));
alter table bonus_game_attempt add column rhythm_shots jsonb not null default '[]'::jsonb check(jsonb_typeof(rhythm_shots)='array');
alter table bonus_game_record add column tertiary_score bigint not null default 0, add column quaternary_score bigint not null default 0;
create index bonus_game_record_rhythm_ranking on bonus_game_record(game_id,rules_version,primary_score,secondary_score,tertiary_score,quaternary_score);

with classic as (
 select p from amateur_duel_template t cross join lateral jsonb_array_elements(t.period_speed_presets) p
 where t.duel_kind='classic' and t.deleted_at is null and p->>'periodNumber'='1'
 order by t.is_active desc,t.created_at desc limit 1
), levels as (
 select n, (array[2,2,3,3,4,4,5,5,6,7])[n] as minimum, 16+4*n as target from generate_series(1,10) n
)
insert into bonus_game(id,slug,title,skill_code,description,sort_order,status,access_type,unlock_price_stars,target_goals,qualification_rules,total_periods,break_duration_ms,period_rules,use_inventory,preview_title,preview_story,preview_artwork_url,preview_revision,reward_coins,reward_stars,reward_experience,arena_theme_id,goalkeeper_ready_url,goalkeeper_save_url,revision)
select ('00000000-0000-4000-8000-'||lpad((1100+n)::text,12,'0'))::uuid,
 'rhythm-'||n,'Ритм '||n,'rhythm','Забивай сериями: между голами не больше двух прокатов.',n,'active',source.access_type,source.unlock_price_stars,target,
 jsonb_build_object('type','rhythm_in_time','minimumSeries',minimum,'targetPoints',target,'activeTimeMs',180000),1,0,
 jsonb_build_array(jsonb_build_object('periodNumber',1,'durationMs',180000,'shotsLimit',null,'goalFrequency',(p->>'goalFrequency')::numeric,'goalieFrequency',(p->>'goalieFrequency')::numeric,'shooterFrequency',(p->>'shooterFrequency')::numeric,'puckSpeedPerMs',(p->>'puckSpeedPerMs')::numeric,'goaliePattern','linear','goalieAmplitude',1,'goalAmplitude',220)),
 false,'Ритм '||n,'Набери '||target||' шайб за 3 минуты. В счёт идут серии от '||minimum||' голов. Между голами — не больше двух прокатов.',
 '/sprites/amateur-daily-court.webp',1,source.reward_coins,source.reward_stars,source.reward_experience,'00000000-0000-4000-8000-000000000700',
 '/sprites/training-goalie-amateur.webp','/sprites/training-goalie-amateur-save.webp',1
 from levels cross join classic join bonus_game source on source.skill_code='marksmanship' and source.sort_order=levels.n and source.status='active';

do $$ begin
 if (select count(*) from bonus_game where skill_code='rhythm')<>10 then raise exception 'Expected ten Rhythm games and Classic/bonus reward sources'; end if;
end $$;
