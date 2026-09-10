insert into game_settings (key, value, label, description)
values (
  'amateur.unlock_goals_required',
  to_jsonb(300),
  'Голов для любителей',
  'Сколько шайб нужно забить, чтобы открыть любительскую лигу.'
)
on conflict (key) do update
   set value = to_jsonb(300),
       label = excluded.label,
       description = excluded.description,
       updated_at = now()
 where game_settings.value = to_jsonb(1000)
    or game_settings.value is null;
