-- Change templates only; existing match snapshots retain their original duration.
update amateur_duel_template
set period_duration_ms = 150000,
    period_rules = (
      select jsonb_agg(jsonb_set(rule, '{durationMs}', '150000'::jsonb) order by ord)
      from jsonb_array_elements(period_rules) with ordinality as periods(rule, ord)
    ),
    description = '2 минуты 30 секунд на очки за сложность гола. При равенстве решает точность.',
    updated_at = now()
where duel_kind = 'sniper' and deleted_at is null;
