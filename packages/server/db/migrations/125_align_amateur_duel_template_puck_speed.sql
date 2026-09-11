-- Dev uses a 0.85 px/ms base puck speed for amateur duels. A stick adds 0.40,
-- producing the intended 1.25 px/ms effective speed. Production templates were
-- left at 1.25, making a stick raise the effective speed to 1.65.
update amateur_duel_template template
   set period_speed_presets = (
         select jsonb_agg(
                  case
                    when (period->>'puckSpeedPerMs')::numeric = 1.25
                      then jsonb_set(period, '{puckSpeedPerMs}', '0.85'::jsonb)
                    else period
                  end
                  order by (period->>'periodNumber')::int
                )
           from jsonb_array_elements(template.period_speed_presets) period
       ),
       updated_at = now()
 where template.deleted_at is null
   and template.duel_kind in ('classic', 'express_plus', 'express')
   and exists (
     select 1
       from jsonb_array_elements(template.period_speed_presets) period
      where (period->>'puckSpeedPerMs')::numeric = 1.25
   );
