insert into game_settings (key, value, label, description)
values
  (
    'amateur.no_inventory.skates.stumble_interval_min_rolls',
    to_jsonb(35),
    'Спотыкание: минимум прокатов',
    'Минимальное число прокатов от борта до борта до следующего спотыкания, если игрок вышел без коньков.'
  ),
  (
    'amateur.no_inventory.skates.stumble_interval_max_rolls',
    to_jsonb(55),
    'Спотыкание: максимум прокатов',
    'Максимальное число прокатов от борта до борта до следующего спотыкания, если игрок вышел без коньков.'
  ),
  (
    'amateur.no_inventory.skates.stumble_interval_min_ms',
    to_jsonb(25000),
    'Спотыкание: минимум мс',
    'Минимальный интервал до спотыкания в миллисекундах. Используется, если интервалы в прокатах выставлены в 0.'
  ),
  (
    'amateur.no_inventory.skates.stumble_interval_max_ms',
    to_jsonb(45000),
    'Спотыкание: максимум мс',
    'Максимальный интервал до спотыкания в миллисекундах. Используется, если интервалы в прокатах выставлены в 0.'
  ),
  (
    'amateur.no_inventory.skates.stumble_duration_min_ms',
    to_jsonb(500),
    'Спотыкание: минимум длительности',
    'Минимальная длительность состояния «споткнулся» в миллисекундах, когда игрок вышел без коньков.'
  ),
  (
    'amateur.no_inventory.skates.stumble_duration_max_ms',
    to_jsonb(700),
    'Спотыкание: максимум длительности',
    'Максимальная длительность состояния «споткнулся» в миллисекундах, когда игрок вышел без коньков.'
  ),
  (
    'amateur.no_inventory.skates.stumble_recovery_min_ms',
    to_jsonb(200),
    'Спотыкание: минимум возврата',
    'Минимальное время возврата после спотыкания в миллисекундах. В это время бросок еще заблокирован.'
  ),
  (
    'amateur.no_inventory.skates.stumble_recovery_max_ms',
    to_jsonb(300),
    'Спотыкание: максимум возврата',
    'Максимальное время возврата после спотыкания в миллисекундах. В это время бросок еще заблокирован.'
  ),
  (
    'amateur.no_inventory.skates.stumble_offset_min_px',
    to_jsonb(20),
    'Спотыкание: минимальный сдвиг',
    'Минимальный сдвиг позиции игрока в пикселях для механики спотыкания без коньков.'
  ),
  (
    'amateur.no_inventory.skates.stumble_offset_max_px',
    to_jsonb(45),
    'Спотыкание: максимальный сдвиг',
    'Максимальный сдвиг позиции игрока в пикселях для механики спотыкания без коньков.'
  ),
  (
    'amateur.no_inventory.nutrition.energy_baseline_speed',
    to_jsonb(0.75),
    'Энергия: базовая скорость',
    'Скорость игрока, при которой энергия без питания тратится в реальном времени. Более высокая скорость ускоряет усталость.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_grace_ms',
    to_jsonb(15000),
    'Усталость: безопасное время',
    'Сколько миллисекунд игрок без питания может кататься без штрафа до начала усталости.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_slowdown_start_ms',
    to_jsonb(15000),
    'Усталость: начало замедления',
    'Через сколько миллисекунд накопленной усталости игрок без питания начинает замедляться.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_stop_start_ms',
    to_jsonb(60000),
    'Усталость: начало отдыха',
    'Через сколько миллисекунд накопленной усталости игрок без питания останавливается на отдых.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_stop_duration_ms',
    to_jsonb(5000),
    'Отдых: длительность',
    'Сколько миллисекунд игрок без питания стоит и не может бросать во время отдыха.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_after_rest_ms',
    to_jsonb(30000),
    'Отдых: восстановление',
    'Сколько миллисекунд после отдыха игрок без питания снова едет нормально до новой усталости.'
  ),
  (
    'amateur.no_inventory.nutrition.fatigue_slow_multiplier',
    to_jsonb(0.9),
    'Усталость: множитель скорости',
    'Во сколько раз уменьшается скорость игрока без питания во время усталости. 1 — без замедления, 0.5 — вдвое медленнее.'
  )
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description;
