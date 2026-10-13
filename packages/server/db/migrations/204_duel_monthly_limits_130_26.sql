-- Five duel formats share the monthly allowance. Both Marathon windows
-- consume the same per-format limit through the existing reservation kind.
insert into game_settings (key, value, label, description)
values
  (
    'amateur.limits.monthly',
    to_jsonb(130),
    'Новых дуэлей в месяц',
    'Общий лимит обычных дуэлей по календарю Москвы.'
  ),
  (
    'amateur.limits.per_format_monthly',
    to_jsonb(26),
    'Новых дуэлей формата в месяц',
    'Общий лимит обычных дуэлей по календарю Москвы.'
  )
on conflict (key) do update
   set value = excluded.value,
       updated_at = now()
 where game_settings.value is distinct from excluded.value;
