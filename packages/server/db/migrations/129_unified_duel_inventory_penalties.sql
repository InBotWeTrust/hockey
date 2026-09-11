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
    to_jsonb(12),
    'Спотыкание: максимум прокатов',
    'Максимальное число прокатов до спотыкания без коньков или после исчерпания их ресурса.'
  ),
  (
    'amateur.no_inventory.skates.stumble_duration_min_ms',
    to_jsonb(450),
    'Спотыкание: минимум длительности',
    'Минимальная длительность состояния «споткнулся» в миллисекундах без коньков или после исчерпания их ресурса.'
  ),
  (
    'amateur.no_inventory.skates.stumble_duration_max_ms',
    to_jsonb(650),
    'Спотыкание: максимум длительности',
    'Максимальная длительность состояния «споткнулся» в миллисекундах без коньков или после исчерпания их ресурса.'
  ),
  (
    'amateur.no_inventory.skates.stumble_recovery_min_ms',
    to_jsonb(150),
    'Спотыкание: минимум возврата',
    'Минимальное время возврата после спотыкания в миллисекундах. В это время бросок ещё заблокирован.'
  ),
  (
    'amateur.no_inventory.skates.stumble_recovery_max_ms',
    to_jsonb(250),
    'Спотыкание: максимум возврата',
    'Максимальное время возврата после спотыкания в миллисекундах. В это время бросок ещё заблокирован.'
  ),
  (
    'amateur.no_inventory.skates.stumble_offset_min_px',
    to_jsonb(0),
    'Спотыкание: минимальный сдвиг',
    'Минимальный сдвиг позиции игрока в пикселях при спотыкании без коньков или после исчерпания их ресурса.'
  ),
  (
    'amateur.no_inventory.skates.stumble_offset_max_px',
    to_jsonb(0),
    'Спотыкание: максимальный сдвиг',
    'Максимальный сдвиг позиции игрока в пикселях при спотыкании без коньков или после исчерпания их ресурса.'
  ),
  (
    'amateur.no_inventory.nutrition.energy_baseline_speed',
    to_jsonb(0.75),
    'Энергия: базовая скорость',
    'Скорость игрока, при которой энергия тратится в реальном времени. Более высокая скорость ускоряет расход.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_grace_ms',
    to_jsonb(3000),
    'Усталость: безопасное время',
    'Сколько миллисекунд игрок без питания или после исчерпания его ресурса может кататься без штрафа.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_slowdown_start_ms',
    to_jsonb(3000),
    'Усталость: начало замедления',
    'Через сколько миллисекунд без питания или после исчерпания его ресурса скорость снижается до первого уровня.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_heavy_slowdown_start_ms',
    to_jsonb(8000),
    'Усталость: тяжёлое замедление',
    'Через сколько миллисекунд без питания или после исчерпания его ресурса включается тяжёлая усталость.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_stop_start_ms',
    to_jsonb(13000),
    'Усталость: начало отдыха',
    'Через сколько миллисекунд без питания или после исчерпания его ресурса игрок полностью останавливается.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_stop_duration_ms',
    to_jsonb(3000),
    'Отдых: длительность',
    'Сколько миллисекунд игрок стоит и не может бросать во время отдыха.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_after_rest_ms',
    to_jsonb(7000),
    'Отдых: восстановление',
    'Сколько миллисекунд после отдыха игрок снова едет с полной скоростью до нового цикла усталости.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_slow_multiplier',
    to_jsonb(0.85),
    'Усталость: множитель скорости',
    'Множитель скорости на первом уровне усталости без питания или после исчерпания его ресурса.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_heavy_multiplier',
    to_jsonb(0.65),
    'Усталость: тяжёлый множитель',
    'Множитель скорости на тяжёлом уровне усталости без питания или после исчерпания его ресурса.'
  )
on conflict (key) do update
  set value = excluded.value,
      label = excluded.label,
      description = excluded.description,
      updated_at = now();
