-- Give every active accuracy level 50% more time. Existing attempt snapshots
-- retain the duration captured when those attempts were created.

update bonus_game game
   set period_rules = (
         select jsonb_agg(
           jsonb_set(
             period.value,
             '{durationMs}',
             to_jsonb(((period.value->>'durationMs')::int * 3) / 2)
           )
           order by period.ordinality
         )
           from jsonb_array_elements(game.period_rules) with ordinality period(value, ordinality)
       ),
       revision = revision + 1,
       updated_at = now()
 where game.skill_code = 'accuracy'
   and game.status = 'active';
