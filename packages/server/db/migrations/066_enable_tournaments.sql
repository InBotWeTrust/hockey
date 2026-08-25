insert into game_settings (key, value, label, description)
values (
  'tournaments.enabled',
  'true'::jsonb,
  'Турниры включены',
  'Показывает турнирный раздел игрокам и разрешает публичные турнирные API.'
)
on conflict (key) do update
set value = excluded.value,
    label = excluded.label,
    description = excluded.description,
    updated_at = now();
