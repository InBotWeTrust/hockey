insert into game_settings (key, value, label, description)
values (
  'amateur.rating_visibility',
  '"enabled"'::jsonb,
  'Видимость рейтинга любителей',
  'Показывать или скрывать вкладку рейтинга любительских дуэлей. Начисление очков не меняется.'
)
on conflict (key) do nothing;
