-- New attempts use the first daily period's puck speed. Existing attempt snapshots stay intact.
with daily_puck as (
  select least(5, greatest(0.2, coalesce((
    select case when jsonb_typeof(value)='number' then (value::text)::numeric end
    from game_settings where key='daily.period_1.puck_speed_per_ms'
  ), 1.25))) as speed
)
update bonus_game
set period_rules=jsonb_set(period_rules,'{0,puckSpeedPerMs}',to_jsonb(daily_puck.speed)),
    revision=revision+1, updated_at=now()
from daily_puck
where skill_code='rhythm';
