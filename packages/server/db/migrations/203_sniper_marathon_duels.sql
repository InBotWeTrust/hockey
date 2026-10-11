-- Add ordinary formats without changing limits, old rules snapshots or closed seasons.
alter table amateur_duel_template drop constraint amateur_duel_template_duel_kind_check;
alter table amateur_duel_template add constraint amateur_duel_template_duel_kind_check
  check (duel_kind in ('express','express_plus','classic','sniper','marathon'));
alter table amateur_duel_match drop constraint amateur_duel_match_duel_kind_check;
alter table amateur_duel_match add constraint amateur_duel_match_duel_kind_check
  check (duel_kind in ('express','express_plus','classic','sniper','marathon'));
alter table amateur_duel_limit_reservation drop constraint amateur_duel_limit_reservation_duel_kind_check;
alter table amateur_duel_limit_reservation add constraint amateur_duel_limit_reservation_duel_kind_check
  check (duel_kind in ('express','express_plus','classic','sniper','marathon'));
alter table monthly_duel_format_placement drop constraint monthly_duel_format_placement_scope_check;
alter table monthly_duel_format_placement add constraint monthly_duel_format_placement_scope_check
  check (scope in ('express','express_plus','classic','sniper','marathon'));
alter table amateur_duel_matchmaking_ticket drop constraint amateur_duel_matchmaking_ticket_duel_kinds_json_check;
alter table amateur_duel_matchmaking_ticket add constraint amateur_duel_matchmaking_ticket_duel_kinds_json_check
  check (jsonb_typeof(duel_kinds)='array' and jsonb_array_length(duel_kinds) between 1 and 5);
alter table amateur_duel_matchmaking_ticket add column marathon_windows_ms jsonb not null default '[7000]'::jsonb
  check (jsonb_typeof(marathon_windows_ms)='array' and jsonb_array_length(marathon_windows_ms) between 1 and 2
    and marathon_windows_ms <@ '[4000,7000]'::jsonb);
alter table amateur_duel_template
  add column marathon_window_ms integer not null default 7000 check (marathon_window_ms in (4000,7000)),
  add column sniper_scoring_rules jsonb;
alter table amateur_duel_participant
  add column format_score integer not null default 0 check (format_score>=0),
  add column sniper_points integer not null default 0 check (sniper_points>=0),
  add column marathon_penalties integer not null default 0 check (marathon_penalties>=0);

with base as (
  select * from amateur_duel_template where duel_kind='classic' and deleted_at is null
  order by is_active desc, created_at desc limit 1
), scoring as (
  select coalesce((select qualification_rules->'scoring' from bonus_game
    where skill_code='marksmanship' and qualification_rules #>> '{scoring,version}'='6'
    order by sort_order,id limit 1),
    '{"version":6,"scanStepMs":10,"counterDirectionBonus":0,"counterDirectionGoalDistance":24,"closeGoalieBonus":0,"behindGoalieBonus":0,"boardNarrowBonus":0,"doubleMultiplier":1,"tripleMultiplier":1,"brackets":[{"minWindowMs":160,"points":1,"code":"open"},{"minWindowMs":100,"points":2,"code":"precise"},{"minWindowMs":70,"points":3,"code":"narrow"},{"minWindowMs":0,"points":4,"code":"instant"}]}'::jsonb) as rules
), formats(kind,title,duration) as (values ('sniper','Снайпер',180000),('marathon','Марафон',240000))
insert into amateur_duel_template
select (jsonb_populate_record(null::amateur_duel_template, to_jsonb(base) || jsonb_build_object(
  'id',gen_random_uuid(),'title',formats.title,'description',case when formats.kind='sniper'
    then '3 минуты на очки за сложность гола. При равенстве решает точность.'
    else '4 минуты. Забивайте за 7 или 4 секунды; за истечение таймера минус шайба, минимум 0.' end,
  'duel_kind',formats.kind,'duel_variant','time_attack','is_active',true,
  'total_periods',1,'period_duration_ms',formats.duration,'break_duration_ms',0,
  'period_speed_presets','[{"periodNumber":1,"goalFrequency":0.5,"goalieFrequency":0.6,"shooterFrequency":0.75,"puckSpeedPerMs":0.85}]'::jsonb,
  'period_rules',jsonb_build_array(jsonb_build_object('periodNumber',1,'mode','time_attack','durationMs',formats.duration,'shotsLimit',null)),
  'sniper_scoring_rules',case when formats.kind='sniper' then scoring.rules else null end,
  'created_at',now(),'updated_at',now()
))).* from base cross join scoring cross join formats
where not exists (select 1 from amateur_duel_template t where t.duel_kind=formats.kind and t.deleted_at is null);
