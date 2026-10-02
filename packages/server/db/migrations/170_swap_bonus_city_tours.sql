-- Swap the hockey-city and NHL-city artwork between the four active bonus tracks.
-- Stable game ids, rules, balance, completions and attempt snapshots stay untouched.

create temporary table bonus_city_tour_swap (
  target_skill_code text not null,
  sort_order int not null,
  city_slug text not null,
  city_title text not null,
  arena_id uuid not null,
  asset_family text not null,
  primary key (target_skill_code, sort_order)
) on commit drop;

insert into bonus_city_tour_swap
  (target_skill_code, sort_order, city_slug, city_title, arena_id, asset_family)
values
  ('speed', 1, 'minsk', 'Минск', '00000000-0000-4000-8000-000000000811', 'hockey-cities'),
  ('speed', 2, 'shanghai', 'Шанхай', '00000000-0000-4000-8000-000000000812', 'hockey-cities'),
  ('speed', 3, 'sochi', 'Сочи', '00000000-0000-4000-8000-000000000813', 'hockey-cities'),
  ('speed', 4, 'tolyatti', 'Тольятти', '00000000-0000-4000-8000-000000000814', 'hockey-cities'),
  ('speed', 5, 'moscow', 'Москва', '00000000-0000-4000-8000-000000000815', 'hockey-cities'),
  ('speed', 6, 'nizhny-novgorod', 'Нижний Новгород', '00000000-0000-4000-8000-000000000816', 'hockey-cities'),
  ('speed', 7, 'cherepovets', 'Череповец', '00000000-0000-4000-8000-000000000817', 'hockey-cities'),
  ('speed', 8, 'yaroslavl', 'Ярославль', '00000000-0000-4000-8000-000000000818', 'hockey-cities'),
  ('speed', 9, 'kazan', 'Казань', '00000000-0000-4000-8000-000000000819', 'hockey-cities'),
  ('speed', 10, 'saint-petersburg', 'Санкт-Петербург', '00000000-0000-4000-8000-000000000820', 'hockey-cities'),
  ('accuracy', 1, 'astana', 'Астана', '00000000-0000-4000-8000-000000000821', 'hockey-cities'),
  ('accuracy', 2, 'nizhnekamsk', 'Нижнекамск', '00000000-0000-4000-8000-000000000822', 'hockey-cities'),
  ('accuracy', 3, 'novosibirsk', 'Новосибирск', '00000000-0000-4000-8000-000000000823', 'hockey-cities'),
  ('accuracy', 4, 'vladivostok', 'Владивосток', '00000000-0000-4000-8000-000000000824', 'hockey-cities'),
  ('accuracy', 5, 'khabarovsk', 'Хабаровск', '00000000-0000-4000-8000-000000000825', 'hockey-cities'),
  ('accuracy', 6, 'ufa', 'Уфа', '00000000-0000-4000-8000-000000000826', 'hockey-cities'),
  ('accuracy', 7, 'yekaterinburg', 'Екатеринбург', '00000000-0000-4000-8000-000000000827', 'hockey-cities'),
  ('accuracy', 8, 'omsk', 'Омск', '00000000-0000-4000-8000-000000000828', 'hockey-cities'),
  ('accuracy', 9, 'chelyabinsk', 'Челябинск', '00000000-0000-4000-8000-000000000829', 'hockey-cities'),
  ('accuracy', 10, 'magnitogorsk', 'Магнитогорск', '00000000-0000-4000-8000-000000000830', 'hockey-cities'),
  ('marksmanship', 1, 'toronto', 'Торонто', '00000000-0000-4000-8000-000000000831', 'nhl-cities'),
  ('marksmanship', 2, 'montreal', 'Монреаль', '00000000-0000-4000-8000-000000000832', 'nhl-cities'),
  ('marksmanship', 3, 'boston', 'Бостон', '00000000-0000-4000-8000-000000000833', 'nhl-cities'),
  ('marksmanship', 4, 'new-york-metro', 'Нью-Йоркская агломерация', '00000000-0000-4000-8000-000000000834', 'nhl-cities'),
  ('marksmanship', 5, 'philadelphia', 'Филадельфия', '00000000-0000-4000-8000-000000000835', 'nhl-cities'),
  ('marksmanship', 6, 'washington', 'Вашингтон', '00000000-0000-4000-8000-000000000836', 'nhl-cities'),
  ('marksmanship', 7, 'pittsburgh', 'Питтсбург', '00000000-0000-4000-8000-000000000837', 'nhl-cities'),
  ('marksmanship', 8, 'detroit', 'Детройт', '00000000-0000-4000-8000-000000000838', 'nhl-cities'),
  ('marksmanship', 9, 'chicago', 'Чикаго', '00000000-0000-4000-8000-000000000839', 'nhl-cities'),
  ('marksmanship', 10, 'nashville', 'Нэшвилл', '00000000-0000-4000-8000-000000000840', 'nhl-cities'),
  ('endurance', 1, 'dallas', 'Даллас', '00000000-0000-4000-8000-000000000841', 'nhl-cities'),
  ('endurance', 2, 'denver', 'Денвер', '00000000-0000-4000-8000-000000000842', 'nhl-cities'),
  ('endurance', 3, 'salt-lake-city', 'Солт-Лейк-Сити', '00000000-0000-4000-8000-000000000843', 'nhl-cities'),
  ('endurance', 4, 'winnipeg', 'Виннипег', '00000000-0000-4000-8000-000000000844', 'nhl-cities'),
  ('endurance', 5, 'edmonton', 'Эдмонтон', '00000000-0000-4000-8000-000000000845', 'nhl-cities'),
  ('endurance', 6, 'calgary', 'Калгари', '00000000-0000-4000-8000-000000000846', 'nhl-cities'),
  ('endurance', 7, 'vancouver', 'Ванкувер', '00000000-0000-4000-8000-000000000847', 'nhl-cities'),
  ('endurance', 8, 'seattle', 'Сиэтл', '00000000-0000-4000-8000-000000000848', 'nhl-cities'),
  ('endurance', 9, 'los-angeles', 'Лос-Анджелес', '00000000-0000-4000-8000-000000000849', 'nhl-cities'),
  ('endurance', 10, 'las-vegas', 'Лас-Вегас', '00000000-0000-4000-8000-000000000850', 'nhl-cities');

update bonus_game game
   set slug = game.skill_code || '-' || seed.city_slug,
       title = seed.city_title,
       description = case game.skill_code
         when 'speed' then 'Тур по хоккейным городам · Скорость'
         when 'accuracy' then 'Тур по хоккейным городам · Точность'
         when 'marksmanship' then 'Тур по хоккейным городам Северной Америки · Меткость'
         when 'endurance' then 'Тур по хоккейным городам Северной Америки · Выносливость'
       end,
       arena_theme_id = seed.arena_id,
       preview_title = seed.city_title,
       preview_story = case game.skill_code
         when 'speed' then 'Держите темп и завершите норматив до конца отсчёта.'
         when 'accuracy' then 'Рассчитайте каждый бросок и выполните норматив новой арены.'
         when 'marksmanship' then 'Набирайте очки за сложные голевые моменты на новой арене.'
         when 'endurance' then 'Забивайте в каждом окне и продержитесь до финальной сирены.'
       end,
       preview_artwork_url = '/bonus-games/' || seed.asset_family || '/previews/' || seed.city_slug || '.webp',
       goalkeeper_ready_url = '/bonus-games/' || seed.asset_family || '/goalkeepers/' || seed.city_slug || '-ready.webp',
       goalkeeper_save_url = '/bonus-games/' || seed.asset_family || '/goalkeepers/' || seed.city_slug || '-save.webp',
       reward_coins = case game.skill_code
         when 'marksmanship' then (select source.reward_coins from bonus_game source where source.skill_code = 'speed' and source.status = 'active' and source.sort_order = game.sort_order)
         when 'endurance' then (select source.reward_coins from bonus_game source where source.skill_code = 'accuracy' and source.status = 'active' and source.sort_order = game.sort_order)
         else game.reward_coins
       end,
       reward_stars = case game.skill_code
         when 'marksmanship' then (select source.reward_stars from bonus_game source where source.skill_code = 'speed' and source.status = 'active' and source.sort_order = game.sort_order)
         when 'endurance' then (select source.reward_stars from bonus_game source where source.skill_code = 'accuracy' and source.status = 'active' and source.sort_order = game.sort_order)
         else game.reward_stars
       end,
       reward_experience = case game.skill_code
         when 'marksmanship' then (select source.reward_experience from bonus_game source where source.skill_code = 'speed' and source.status = 'active' and source.sort_order = game.sort_order)
         when 'endurance' then (select source.reward_experience from bonus_game source where source.skill_code = 'accuracy' and source.status = 'active' and source.sort_order = game.sort_order)
         else game.reward_experience
       end,
       preview_revision = preview_revision + 1,
       revision = revision + 1,
       updated_at = now()
  from bonus_city_tour_swap seed
 where game.skill_code = seed.target_skill_code
   and game.sort_order = seed.sort_order
   and game.status = 'active';
