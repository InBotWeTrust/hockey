-- Bonus goalies are expected to travel along the full goal line. The shared
-- sine and dash patterns intentionally stay inside the goal frame, so bonus
-- definitions use the full-rink linear pattern instead.

update bonus_game as game
   set period_rules = (
         select jsonb_agg(
                  jsonb_set(period.value, '{goaliePattern}', '"linear"'::jsonb, true)
                  order by period.ordinality
                )
           from jsonb_array_elements(game.period_rules) with ordinality
             as period(value, ordinality)
       ),
       revision = game.revision + 1,
       updated_at = now()
 where exists (
   select 1
     from jsonb_array_elements(game.period_rules) as period(value)
    where period.value->>'goaliePattern' is distinct from 'linear'
 );
