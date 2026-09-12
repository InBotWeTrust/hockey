insert into game_settings (key, value, label, description)
values
  (
    'amateur.no_inventory.skates.stumble_interval_min_rolls',
    to_jsonb(8),
    'Спотыкание: минимум прокатов',
    'Минимальное число прокатов до спотыкания без коньков или после исчерпания их ресурса.'
  ),
  (
    'amateur.no_inventory.skates.stumble_interval_max_rolls',
    to_jsonb(20),
    'Спотыкание: максимум прокатов',
    'Максимальное число прокатов до спотыкания без коньков или после исчерпания их ресурса.'
  )
on conflict (key) do update
  set value = excluded.value,
      label = excluded.label,
      description = excluded.description,
      updated_at = now();
