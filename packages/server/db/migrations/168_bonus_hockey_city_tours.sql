-- Give marksmanship and endurance their hockey-city tours. Catalog rows change
-- only for future attempts; attempt snapshots, completions and rewards stay untouched.

create temporary table bonus_hockey_city_seed (
  skill_code text not null,
  sort_order int not null,
  city_slug text not null,
  city_title text not null,
  arena_id uuid not null unique,
  primary key (skill_code, sort_order)
) on commit drop;

insert into bonus_hockey_city_seed
  (skill_code, sort_order, city_slug, city_title, arena_id)
values
  ('marksmanship', 1, 'minsk', 'Минск', '00000000-0000-4000-8000-000000000811'),
  ('marksmanship', 2, 'shanghai', 'Шанхай', '00000000-0000-4000-8000-000000000812'),
  ('marksmanship', 3, 'sochi', 'Сочи', '00000000-0000-4000-8000-000000000813'),
  ('marksmanship', 4, 'tolyatti', 'Тольятти', '00000000-0000-4000-8000-000000000814'),
  ('marksmanship', 5, 'moscow', 'Москва', '00000000-0000-4000-8000-000000000815'),
  ('marksmanship', 6, 'nizhny-novgorod', 'Нижний Новгород', '00000000-0000-4000-8000-000000000816'),
  ('marksmanship', 7, 'cherepovets', 'Череповец', '00000000-0000-4000-8000-000000000817'),
  ('marksmanship', 8, 'yaroslavl', 'Ярославль', '00000000-0000-4000-8000-000000000818'),
  ('marksmanship', 9, 'kazan', 'Казань', '00000000-0000-4000-8000-000000000819'),
  ('marksmanship', 10, 'saint-petersburg', 'Санкт-Петербург', '00000000-0000-4000-8000-000000000820'),
  ('endurance', 1, 'astana', 'Астана', '00000000-0000-4000-8000-000000000821'),
  ('endurance', 2, 'nizhnekamsk', 'Нижнекамск', '00000000-0000-4000-8000-000000000822'),
  ('endurance', 3, 'novosibirsk', 'Новосибирск', '00000000-0000-4000-8000-000000000823'),
  ('endurance', 4, 'vladivostok', 'Владивосток', '00000000-0000-4000-8000-000000000824'),
  ('endurance', 5, 'khabarovsk', 'Хабаровск', '00000000-0000-4000-8000-000000000825'),
  ('endurance', 6, 'ufa', 'Уфа', '00000000-0000-4000-8000-000000000826'),
  ('endurance', 7, 'yekaterinburg', 'Екатеринбург', '00000000-0000-4000-8000-000000000827'),
  ('endurance', 8, 'omsk', 'Омск', '00000000-0000-4000-8000-000000000828'),
  ('endurance', 9, 'chelyabinsk', 'Челябинск', '00000000-0000-4000-8000-000000000829'),
  ('endurance', 10, 'magnitogorsk', 'Магнитогорск', '00000000-0000-4000-8000-000000000830');

-- Accuracy level one keeps its game and arena ids, but becomes Buenos Aires.
update arena_theme
   set slug = 'accuracy-world-tour-buenos-aires',
       title = 'Буэнос-Айрес',
       artwork_url = '/bonus-games/world-tour/arenas/buenos-aires.webp',
       thumbnail_url = '/bonus-games/world-tour/previews/buenos-aires.webp',
       updated_at = now()
 where id = '00000000-0000-4000-8000-000000000621';

update bonus_game
   set slug = 'accuracy-buenos-aires',
       title = 'Буэнос-Айрес',
       description = 'Мировой тур · Аргентина',
       preview_title = 'Точный старт',
       preview_story = 'Обелиск и огни Авениды 9 Июля открывают мировой тур. Выбери момент и начни серию точных бросков.',
       preview_artwork_url = '/bonus-games/world-tour/previews/buenos-aires.webp',
       goalkeeper_ready_url = '/bonus-games/world-tour/goalkeepers/buenos-aires-ready.webp',
       goalkeeper_save_url = '/bonus-games/world-tour/goalkeepers/buenos-aires-save.webp',
       preview_revision = preview_revision + 1,
       revision = revision + 1,
       updated_at = now()
 where id = '00000000-0000-4000-8000-000000000611'
   and skill_code = 'accuracy';

insert into arena_theme
  (id, slug, title, artwork_url, thumbnail_url, status, is_selectable)
select seed.arena_id,
       seed.skill_code || '-hockey-city-' || seed.city_slug,
       seed.city_title,
       '/bonus-games/hockey-cities/arenas/' || seed.city_slug || '.webp',
       '/bonus-games/hockey-cities/previews/' || seed.city_slug || '.webp',
       'active', false
  from bonus_hockey_city_seed seed;

-- Existing ten marksmanship rows retain ids, rules and balance.
update bonus_game game
   set title = seed.city_title,
       description = 'Тур по хоккейным городам · Меткость',
       arena_theme_id = seed.arena_id,
       preview_title = seed.city_title,
       preview_story = 'Набирайте очки за сложные голевые моменты на новой арене.',
       preview_artwork_url = '/bonus-games/hockey-cities/previews/' || seed.city_slug || '.webp',
       goalkeeper_ready_url = '/bonus-games/hockey-cities/goalkeepers/' || seed.city_slug || '-ready.webp',
       goalkeeper_save_url = '/bonus-games/hockey-cities/goalkeepers/' || seed.city_slug || '-save.webp',
       preview_revision = preview_revision + 1,
       revision = revision + 1,
       updated_at = now()
  from bonus_hockey_city_seed seed
 where game.skill_code = 'marksmanship'
   and game.sort_order = seed.sort_order
   and seed.skill_code = 'marksmanship';

-- Add levels 8-10 by copying the current level-ten-compatible endurance shape.
insert into bonus_game
  (id, slug, title, skill_code, description, sort_order, status, access_type,
   unlock_price_stars, target_goals, qualification_rules, total_periods,
   break_duration_ms, period_rules, use_inventory, preview_title, preview_story,
   preview_artwork_url, preview_revision, reward_coins, reward_stars,
   reward_experience, arena_theme_id, goalkeeper_ready_url, goalkeeper_save_url,
   revision, created_by)
select ids.id, 'endurance-' || ids.sort_order, seed.city_title, 'endurance',
       'Тур по хоккейным городам · Выносливость', ids.sort_order,
       source.status, source.access_type, source.unlock_price_stars,
       source.target_goals, source.qualification_rules, source.total_periods,
       source.break_duration_ms, source.period_rules, source.use_inventory,
       seed.city_title, 'Забивайте в каждом окне и продержитесь до финальной сирены.',
       '/bonus-games/hockey-cities/previews/' || seed.city_slug || '.webp', 1,
       source.reward_coins, source.reward_stars, source.reward_experience,
       seed.arena_id,
       '/bonus-games/hockey-cities/goalkeepers/' || seed.city_slug || '-ready.webp',
       '/bonus-games/hockey-cities/goalkeepers/' || seed.city_slug || '-save.webp',
       1, null
  from (values
    ('00000000-0000-4000-8000-000000000718'::uuid, 8),
    ('00000000-0000-4000-8000-000000000719'::uuid, 9),
    ('00000000-0000-4000-8000-000000000720'::uuid, 10)
  ) ids(id, sort_order)
  join bonus_game source on source.id = '00000000-0000-4000-8000-000000000717'
  join bonus_hockey_city_seed seed
    on seed.skill_code = 'endurance' and seed.sort_order = ids.sort_order;

with endurance_rules(sort_order, duration_ms, goal_window_ms) as (
  values
    (1, 180000, 12000), (2, 185000, 11000), (3, 190000, 10000),
    (4, 200000, 9000), (5, 205000, 8000), (6, 210000, 7000),
    (7, 220000, 6000), (8, 225000, 5000), (9, 230000, 4500),
    (10, 240000, 4000)
)
update bonus_game game
   set title = seed.city_title,
       description = 'Тур по хоккейным городам · Выносливость',
       arena_theme_id = seed.arena_id,
       qualification_rules = jsonb_set(
         jsonb_set(game.qualification_rules, '{activeTimeMs}', to_jsonb(rules.duration_ms)),
         '{goalWindowMs}', to_jsonb(rules.goal_window_ms)
       ),
       period_rules = jsonb_set(game.period_rules, '{0,durationMs}', to_jsonb(rules.duration_ms)),
       preview_title = seed.city_title,
       preview_story = 'Забивайте в каждом окне и продержитесь до финальной сирены.',
       preview_artwork_url = '/bonus-games/hockey-cities/previews/' || seed.city_slug || '.webp',
       goalkeeper_ready_url = '/bonus-games/hockey-cities/goalkeepers/' || seed.city_slug || '-ready.webp',
       goalkeeper_save_url = '/bonus-games/hockey-cities/goalkeepers/' || seed.city_slug || '-save.webp',
       preview_revision = preview_revision + 1,
       revision = revision + 1,
       updated_at = now()
  from bonus_hockey_city_seed seed
  join endurance_rules rules on rules.sort_order = seed.sort_order
 where game.skill_code = 'endurance'
   and game.sort_order = seed.sort_order
   and seed.skill_code = 'endurance';
