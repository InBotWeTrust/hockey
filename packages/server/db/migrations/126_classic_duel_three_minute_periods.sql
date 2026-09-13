-- Keep the active ordinary Classic duel aligned with the Classic tournament default.
-- Existing match and tournament session snapshots intentionally retain their original timing.
update amateur_duel_template
   set period_duration_ms = 180000,
       period_rules = case
         when jsonb_typeof(period_rules) = 'array' then (
           select jsonb_agg(
                    jsonb_set(period_rule, '{durationMs}', '180000'::jsonb)
                    order by period_ordinality
                  )
             from jsonb_array_elements(period_rules) with ordinality as rule(period_rule, period_ordinality)
         )
         else period_rules
       end,
       updated_at = now()
 where duel_kind = 'classic'
   and is_active
   and deleted_at is null;
