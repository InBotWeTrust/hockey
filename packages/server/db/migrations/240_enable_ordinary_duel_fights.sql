-- Approved ordinary-duel fight rollout.
insert into game_settings(key,value,label,description)
values ('duels.fights.enabled','true'::jsonb,'Драки в обычных дуэлях','Разрешает новые вызовы после двухклиентной проверки')
on conflict(key) do update set value=excluded.value;
