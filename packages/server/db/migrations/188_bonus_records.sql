create function bonus_record_rules_version(skill text, qualification jsonb, periods jsonb, inventory boolean)
returns text language sql immutable strict as $$
  select md5(jsonb_build_object('version', 1, 'accuracyComparator', 'goal-ratio-v1', 'skill', skill, 'qualification', qualification,
    'periods', periods, 'inventory', inventory)::text)
$$;

create table bonus_game_record (
  game_id uuid not null references bonus_game(id) on delete cascade,
  rules_version text not null,
  user_id uuid not null references users(id) on delete cascade,
  attempt_id uuid not null references bonus_game_attempt(id),
  skill_code text not null check (skill_code in ('speed','accuracy','marksmanship','endurance')),
  primary_score bigint not null,
  secondary_score bigint not null,
  elapsed_ms bigint not null check (elapsed_ms > 0),
  shots integer not null check (shots > 0),
  goals integer not null check (goals > 0),
  points integer not null,
  check (skill_code<>'accuracy' or (shots<=1000000 and goals<=shots)),
  achieved_at timestamptz not null,
  primary key(game_id, rules_version, user_id)
);
create index bonus_game_record_ranking on bonus_game_record(game_id, rules_version, primary_score, secondary_score, achieved_at, user_id);

create table bonus_game_record_result (
  attempt_id uuid primary key references bonus_game_attempt(id) on delete cascade,
  game_id uuid not null references bonus_game(id),
  user_id uuid not null references users(id),
  rules_version text not null,
  personal_improved boolean not null,
  global_improved boolean not null,
  stars integer not null,
  experience integer not null,
  result_snapshot jsonb not null,
  created_at timestamptz not null
);

-- Only complete, archived periods supply trustworthy active time. No retrospective awards.
with eligible as (
  select a.*, case when a.rules_snapshot->>'skillCode'='marksmanship' then
      coalesce(sum(l.duration_ms) filter(where l.period_number<a.current_period),0) +
      (select floor((s.input_payload->>'tapTime')::numeric)::bigint + (s.shot_index-1)*1000
       from shot_session s where s.bonus_game_attempt_id=a.id and s.period_number=a.current_period
         and s.mode='bonus' order by s.shot_index desc limit 1)
      else sum(l.duration_ms) end::bigint as elapsed_ms,
    bonus_record_rules_version(a.rules_snapshot->>'skillCode', a.rules_snapshot->'qualificationRules',
      a.rules_snapshot->'periods', (a.rules_snapshot->>'useInventory')::boolean) as rules_version
  from bonus_game_attempt a join bonus_game_period_log l on l.attempt_id=a.id
  where a.status='completed' and a.rules_snapshot->>'skillCode' in ('speed','accuracy','marksmanship','endurance')
    and a.goals>0 and a.shots_taken>0
    and (a.rules_snapshot->>'skillCode'<>'accuracy' or (a.shots_taken<=1000000 and a.goals<=a.shots_taken))
  group by a.id
  having count(*)=a.current_period and min(l.duration_ms)>0
), scored as (
  select *, case rules_snapshot->>'skillCode' when 'accuracy' then -(goals::bigint * 1000000000000 / shots_taken)
    when 'endurance' then -goals else elapsed_ms end as primary_score,
    case rules_snapshot->>'skillCode' when 'accuracy' then elapsed_ms
    when 'marksmanship' then shots_taken else 0 end as secondary_score
  from eligible where rules_version is not null and elapsed_ms>0
), best as (
  select *, row_number() over(partition by bonus_game_id,rules_version,user_id
    order by primary_score,secondary_score,closed_at,id) as n from scored
)
insert into bonus_game_record(game_id,rules_version,user_id,attempt_id,skill_code,primary_score,secondary_score,
 elapsed_ms,shots,goals,points,achieved_at)
select bonus_game_id,rules_version,user_id,id,rules_snapshot->>'skillCode',primary_score,secondary_score,
 elapsed_ms,shots_taken,goals,total_points,closed_at from best where n=1;
