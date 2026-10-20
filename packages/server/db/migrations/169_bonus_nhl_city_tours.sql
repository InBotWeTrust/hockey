-- Replace the active speed and accuracy artwork with two ten-city NHL-market tours.
-- Stable game ids preserve unlocks and completions. Archived accuracy levels and
-- all attempt snapshots remain readable; only future attempts use these rows.

create temporary table bonus_nhl_city_seed (
  skill_code text not null,
  sort_order int not null,
  city_slug text not null unique,
  city_title text not null,
  arena_id uuid not null unique,
  target_goals int,
  shots_limit int,
  source_accuracy_order int,
  primary key (skill_code, sort_order)
) on commit drop;

insert into bonus_nhl_city_seed
  (skill_code, sort_order, city_slug, city_title, arena_id,
   target_goals, shots_limit, source_accuracy_order)
values
  ('speed', 1, 'toronto', 'Торонто', '00000000-0000-4000-8000-000000000831', null, null, null),
  ('speed', 2, 'montreal', 'Монреаль', '00000000-0000-4000-8000-000000000832', null, null, null),
  ('speed', 3, 'boston', 'Бостон', '00000000-0000-4000-8000-000000000833', null, null, null),
  ('speed', 4, 'new-york-metro', 'Нью-Йоркская агломерация', '00000000-0000-4000-8000-000000000834', null, null, null),
  ('speed', 5, 'philadelphia', 'Филадельфия', '00000000-0000-4000-8000-000000000835', null, null, null),
  ('speed', 6, 'washington', 'Вашингтон', '00000000-0000-4000-8000-000000000836', null, null, null),
  ('speed', 7, 'pittsburgh', 'Питтсбург', '00000000-0000-4000-8000-000000000837', null, null, null),
  ('speed', 8, 'detroit', 'Детройт', '00000000-0000-4000-8000-000000000838', null, null, null),
  ('speed', 9, 'chicago', 'Чикаго', '00000000-0000-4000-8000-000000000839', null, null, null),
  ('speed', 10, 'nashville', 'Нэшвилл', '00000000-0000-4000-8000-000000000840', null, null, null),
  ('accuracy', 1, 'dallas', 'Даллас', '00000000-0000-4000-8000-000000000841', 18, 30, 1),
  ('accuracy', 2, 'denver', 'Денвер', '00000000-0000-4000-8000-000000000842', 21, 30, 2),
  ('accuracy', 3, 'salt-lake-city', 'Солт-Лейк-Сити', '00000000-0000-4000-8000-000000000843', 23, 30, 3),
  ('accuracy', 4, 'winnipeg', 'Виннипег', '00000000-0000-4000-8000-000000000844', 30, 45, 4),
  ('accuracy', 5, 'edmonton', 'Эдмонтон', '00000000-0000-4000-8000-000000000845', 36, 50, 5),
  ('accuracy', 6, 'calgary', 'Калгари', '00000000-0000-4000-8000-000000000846', 42, 50, 7),
  ('accuracy', 7, 'vancouver', 'Ванкувер', '00000000-0000-4000-8000-000000000847', 47, 55, 8),
  ('accuracy', 8, 'seattle', 'Сиэтл', '00000000-0000-4000-8000-000000000848', 52, 60, 10),
  ('accuracy', 9, 'los-angeles', 'Лос-Анджелес', '00000000-0000-4000-8000-000000000849', 76, 90, 12),
  ('accuracy', 10, 'las-vegas', 'Лас-Вегас', '00000000-0000-4000-8000-000000000850', 90, 90, 13);

insert into arena_theme
  (id, slug, title, artwork_url, thumbnail_url, status, is_selectable)
select seed.arena_id,
       seed.skill_code || '-nhl-city-' || seed.city_slug,
       seed.city_title,
       '/bonus-games/nhl-cities/arenas/' || seed.city_slug || '.webp',
       '/bonus-games/nhl-cities/previews/' || seed.city_slug || '.webp',
       'active', false
  from bonus_nhl_city_seed seed;

update bonus_game game
   set slug = 'speed-' || seed.city_slug,
       title = seed.city_title,
       description = 'Тур по хоккейным городам Северной Америки · Скорость',
       arena_theme_id = seed.arena_id,
       preview_title = seed.city_title,
       preview_story = 'Держите темп и завершите норматив до конца отсчёта.',
       preview_artwork_url = '/bonus-games/nhl-cities/previews/' || seed.city_slug || '.webp',
       goalkeeper_ready_url = '/bonus-games/nhl-cities/goalkeepers/' || seed.city_slug || '-ready.webp',
       goalkeeper_save_url = '/bonus-games/nhl-cities/goalkeepers/' || seed.city_slug || '-save.webp',
       preview_revision = preview_revision + 1,
       revision = revision + 1,
       updated_at = now()
  from bonus_nhl_city_seed seed
 where game.skill_code = 'speed'
   and game.sort_order = seed.sort_order
   and seed.skill_code = 'speed';

create temporary table bonus_accuracy_rules_snapshot on commit drop as
select sort_order, total_periods, break_duration_ms, qualification_rules, period_rules
  from bonus_game
 where skill_code = 'accuracy' and sort_order between 1 and 13;

update bonus_game game
   set slug = 'accuracy-' || seed.city_slug,
       title = seed.city_title,
       description = 'Тур по хоккейным городам Северной Америки · Точность',
       target_goals = seed.target_goals,
       total_periods = source.total_periods,
       break_duration_ms = source.break_duration_ms,
       qualification_rules = jsonb_set(
         jsonb_set(source.qualification_rules, '{targetGoals}', to_jsonb(seed.target_goals)),
         '{shotsLimit}', to_jsonb(seed.shots_limit)
       ),
       period_rules = (
         select jsonb_agg(
           jsonb_set(period.value, '{shotsLimit}', to_jsonb(
             seed.shots_limit / source.total_periods
             + case when period.ordinality <= seed.shots_limit % source.total_periods then 1 else 0 end
           )) order by period.ordinality
         )
           from jsonb_array_elements(source.period_rules) with ordinality period(value, ordinality)
       ),
       arena_theme_id = seed.arena_id,
       preview_title = seed.city_title,
       preview_story = 'Рассчитайте каждый бросок и выполните норматив новой арены.',
       preview_artwork_url = '/bonus-games/nhl-cities/previews/' || seed.city_slug || '.webp',
       goalkeeper_ready_url = '/bonus-games/nhl-cities/goalkeepers/' || seed.city_slug || '-ready.webp',
       goalkeeper_save_url = '/bonus-games/nhl-cities/goalkeepers/' || seed.city_slug || '-save.webp',
       preview_revision = preview_revision + 1,
       revision = revision + 1,
       updated_at = now()
  from bonus_nhl_city_seed seed
  join bonus_accuracy_rules_snapshot source
    on source.sort_order = seed.source_accuracy_order
 where game.skill_code = 'accuracy'
   and game.sort_order = seed.sort_order
   and seed.skill_code = 'accuracy';

update bonus_game
   set status = 'archived', archived_at = now(), updated_at = now()
 where skill_code = 'accuracy'
   and sort_order between 11 and 13
   and status = 'active';
