insert into game_settings (key, value, label, description)
values
  (
    'training.daily_cooldown_minutes',
    to_jsonb(120),
    'Блокировка дневной игры',
    'Сколько минут дневная игра закрыта после первого броска в тренировке.'
  )
on conflict (key) do nothing;
