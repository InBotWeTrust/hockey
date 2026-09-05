-- Regular-season Classic games use the same puck-speed baseline as Classic
-- duels. A +40 stick therefore raises 0.85 to 1.25 instead of 1.25 to 1.65.

update tournament_revision revision
   set rules_snapshot = jsonb_set(
         revision.rules_snapshot,
         '{config,classicRules,periodSpeedPresets}',
         (
           select jsonb_agg(
                    case
                      when (period->>'puckSpeedPerMs')::numeric = 1.25
                        then jsonb_set(period, '{puckSpeedPerMs}', '0.85'::jsonb)
                      else period
                    end
                    order by (period->>'periodNumber')::int
                  )
             from jsonb_array_elements(
                    revision.rules_snapshot->'config'->'classicRules'->'periodSpeedPresets'
                  ) period
         )
       )
  from tournament
 where tournament.published_revision_id = revision.id
   and revision.rules_snapshot->'config'->>'regularSource' = 'classic'
   and jsonb_typeof(
         revision.rules_snapshot->'config'->'classicRules'->'periodSpeedPresets'
       ) = 'array';

update tournament_classic_session session
   set rules_snapshot = jsonb_set(
         session.rules_snapshot,
         '{periodSpeedPresets}',
         (
           select jsonb_agg(
                    case
                      when (period->>'puckSpeedPerMs')::numeric = 1.25
                        then jsonb_set(period, '{puckSpeedPerMs}', '0.85'::jsonb)
                      else period
                    end
                    order by (period->>'periodNumber')::int
                  )
             from jsonb_array_elements(session.rules_snapshot->'periodSpeedPresets') period
         )
       ),
       updated_at = now()
 where session.state in ('idle', 'period_active', 'break_active')
   and jsonb_typeof(session.rules_snapshot->'periodSpeedPresets') = 'array';
