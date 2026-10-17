-- Extend format constraints without rewriting historical matches or placements.
alter table amateur_duel_template drop constraint amateur_duel_template_duel_kind_check;
alter table amateur_duel_template add constraint amateur_duel_template_duel_kind_check check(duel_kind in ('express','express_plus','classic','sniper','marathon','rhythm'));
alter table amateur_duel_match drop constraint amateur_duel_match_duel_kind_check;
alter table amateur_duel_match add constraint amateur_duel_match_duel_kind_check check(duel_kind in ('express','express_plus','classic','sniper','marathon','rhythm'));
alter table amateur_duel_limit_reservation drop constraint amateur_duel_limit_reservation_duel_kind_check;
alter table amateur_duel_limit_reservation add constraint amateur_duel_limit_reservation_duel_kind_check check(duel_kind in ('express','express_plus','classic','sniper','marathon','rhythm'));
alter table monthly_duel_format_placement drop constraint monthly_duel_format_placement_scope_check;
alter table monthly_duel_format_placement add constraint monthly_duel_format_placement_scope_check check(scope in ('express','express_plus','classic','sniper','marathon','rhythm'));
alter table amateur_duel_matchmaking_ticket drop constraint amateur_duel_matchmaking_ticket_duel_kinds_json_check;
alter table amateur_duel_matchmaking_ticket add constraint amateur_duel_matchmaking_ticket_duel_kinds_json_check check(jsonb_typeof(duel_kinds)='array' and jsonb_array_length(duel_kinds) between 1 and 6);
with base as (select * from amateur_duel_template where duel_kind='classic' and deleted_at is null order by is_active desc, created_at desc limit 1)
insert into amateur_duel_template
select (jsonb_populate_record(null::amateur_duel_template,to_jsonb(base)||jsonb_build_object(
 'id',gen_random_uuid(),'title','Ритм','description','Забивайте не позднее двух прокатов после предыдущего гола. При равенстве очков побеждают длинные серии.',
 'duel_kind','rhythm','duel_variant','time_attack','is_active',true,'total_periods',1,'period_duration_ms',150000,'break_duration_ms',0,
 'period_speed_presets',(select jsonb_agg(p) from jsonb_array_elements(base.period_speed_presets) p where p->>'periodNumber'='1'),
 'period_rules','[{"periodNumber":1,"mode":"time_attack","durationMs":150000,"shotsLimit":null}]'::jsonb,
 'marathon_speed_stages',null,'sniper_scoring_rules',null,'created_at',now(),'updated_at',now()))).* from base
where not exists(select 1 from amateur_duel_template where duel_kind='rhythm' and deleted_at is null);
