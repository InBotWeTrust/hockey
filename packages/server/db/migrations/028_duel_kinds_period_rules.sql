alter table amateur_duel_template
  add column if not exists duel_kind text not null default 'classic'
    check (duel_kind in ('express', 'express_plus', 'classic')),
  add column if not exists period_rules jsonb;

alter table amateur_duel_match
  add column if not exists duel_kind text not null default 'classic'
    check (duel_kind in ('express', 'express_plus', 'classic'));

alter table amateur_duel_template
  add constraint amateur_duel_template_period_rules_json_check
  check (period_rules is null or jsonb_typeof(period_rules) = 'array');

update amateur_duel_template
   set duel_kind = case
         when duel_variant = 'time_attack' and total_periods = 1 then 'express'
         else 'classic'
       end,
       period_rules = case
         when duel_variant = 'time_attack' then jsonb_build_array(
           jsonb_build_object(
             'periodNumber', 1,
             'mode', 'time_attack',
             'durationMs', period_duration_ms,
             'shotsLimit', null
           )
         )
         else (
           select jsonb_agg(
             jsonb_build_object(
               'periodNumber', period_number,
               'mode', 'quota',
               'durationMs', amateur_duel_template.period_duration_ms,
               'shotsLimit', amateur_duel_template.shots_per_period
             )
             order by period_number
           )
           from generate_series(1, amateur_duel_template.total_periods) as period_number
         )
       end
 where period_rules is null;

update amateur_duel_match
   set duel_kind = coalesce(rules_snapshot->>'duelKind', 'classic')
 where duel_kind = 'classic';

delete from amateur_duel_template
 where title in ('Экспресс', 'Экспресс+', 'Классика', 'Классическая дуэль');

insert into amateur_duel_template (
    title,
    description,
    difficulty,
    duel_kind,
    duel_variant,
    starts_at,
    ends_at,
    total_periods,
    shots_per_period,
    period_duration_ms,
    break_duration_ms,
    goalie_id,
    period_speed_presets,
    period_rules,
    stake_amount,
    entry_fee_amount
  )
values
  (
    'Экспресс',
    'Один период на 3 минуты: кто больше забьёт.',
    'easy',
    'express',
    'time_attack',
    '2026-01-01 00:00:00+00',
    '2100-01-01 00:00:00+00',
    1,
    30,
    180000,
    0,
    'rookie',
    '[
      {"periodNumber":1,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.8,"puckSpeedPerMs":1.3}
    ]'::jsonb,
    '[
      {"periodNumber":1,"mode":"time_attack","durationMs":180000,"shotsLimit":null}
    ]'::jsonb,
    0,
    0
  ),
  (
    'Экспресс+',
    'Два периода: первый с лимитом 30 бросков, второй на скорость.',
    'medium',
    'express_plus',
    'classic',
    '2026-01-01 00:00:00+00',
    '2100-01-01 00:00:00+00',
    2,
    30,
    180000,
    120000,
    'rookie',
    '[
      {"periodNumber":1,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.8,"puckSpeedPerMs":1.3},
      {"periodNumber":2,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.75,"puckSpeedPerMs":1.3}
    ]'::jsonb,
    '[
      {"periodNumber":1,"mode":"quota","durationMs":180000,"shotsLimit":30},
      {"periodNumber":2,"mode":"time_attack","durationMs":180000,"shotsLimit":null}
    ]'::jsonb,
    0,
    0
  ),
  (
    'Классика',
    'Три периода как ежедневная игра, перерыв 2 минуты.',
    'hard',
    'classic',
    'classic',
    '2026-01-01 00:00:00+00',
    '2100-01-01 00:00:00+00',
    3,
    30,
    1200000,
    120000,
    'rookie',
    '[
      {"periodNumber":1,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.8,"puckSpeedPerMs":1.3},
      {"periodNumber":2,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.75,"puckSpeedPerMs":1.3},
      {"periodNumber":3,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.7,"puckSpeedPerMs":1.3}
    ]'::jsonb,
    '[
      {"periodNumber":1,"mode":"quota","durationMs":1200000,"shotsLimit":30},
      {"periodNumber":2,"mode":"quota","durationMs":1200000,"shotsLimit":30},
      {"periodNumber":3,"mode":"quota","durationMs":1200000,"shotsLimit":30}
    ]'::jsonb,
    0,
    0
  );
