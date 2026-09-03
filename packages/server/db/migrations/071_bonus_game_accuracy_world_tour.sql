-- Replace the accuracy track artwork with the 13-city World Tour while keeping
-- the existing first ten game ids. Stable ids preserve completions, paid
-- unlocks and preview preferences; bumped revisions affect only new attempts.

create temporary table bonus_accuracy_world_tour_seed (
  game_id uuid primary key,
  arena_id uuid not null unique,
  sort_order int not null unique,
  slug text not null unique,
  title text not null,
  country text not null,
  target_goals int not null,
  shots_limit int not null,
  required_goal_streak int,
  preview_title text not null,
  preview_story text not null
) on commit drop;

insert into bonus_accuracy_world_tour_seed
  (game_id, arena_id, sort_order, slug, title, country, target_goals,
   shots_limit, required_goal_streak, preview_title, preview_story)
values
  ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000621',
   1, 'moscow', 'Москва', 'Россия', 18, 30, null,
   'Точный старт',
   'Первый этап мирового тура проходит у стен Кремля. Выбери момент и начни серию точных бросков.'),
  ('00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000622',
   2, 'istanbul', 'Стамбул', 'Турция', 20, 30, null,
   'Прицел над Босфором',
   'Ветер с Босфора меняет ощущение дистанции. Сохрани точность между двумя континентами.'),
  ('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000623',
   3, 'rome', 'Рим', 'Италия', 21, 30, 3,
   'Римский экзамен',
   'Колизей видел тысячи поединков. Теперь арена проверит твою точность и первую обязательную серию.'),
  ('00000000-0000-4000-8000-000000000614', '00000000-0000-4000-8000-000000000624',
   4, 'paris', 'Париж', 'Франция', 36, 50, null,
   'Парижская линия',
   'Огни Парижа отражаются на льду. Не отвлекайся и собери нужное число голов из ограниченной серии.'),
  ('00000000-0000-4000-8000-000000000615', '00000000-0000-4000-8000-000000000625',
   5, 'london', 'Лондон', 'Великобритания', 38, 50, 3,
   'Туманная точность',
   'Лондонский туман скрывает траекторию. Пройди норматив и удержи серию из трёх голов.'),
  ('00000000-0000-4000-8000-000000000616', '00000000-0000-4000-8000-000000000626',
   6, 'new-york', 'Нью-Йорк', 'США', 40, 50, 4,
   'Манхэттенский прицел',
   'Манхэттен задаёт высокий темп, но здесь важен каждый бросок. Сохрани хладнокровие у ворот.'),
  ('00000000-0000-4000-8000-000000000617', '00000000-0000-4000-8000-000000000627',
   7, 'rio-de-janeiro', 'Рио-де-Жанейро', 'Бразилия', 42, 50, 4,
   'Точный ритм',
   'Ритм Рио легко сбивает концентрацию. Не растрачивай броски и выполни обязательную серию.'),
  ('00000000-0000-4000-8000-000000000618', '00000000-0000-4000-8000-000000000628',
   8, 'cape-town', 'Кейптаун', 'ЮАР', 47, 60, 4,
   'Ветер у Столовой горы',
   'Порывы с океана усложняют прицел. Рассчитай траекторию на длинной серии бросков.'),
  ('00000000-0000-4000-8000-000000000619', '00000000-0000-4000-8000-000000000629',
   9, 'dubai', 'Дубай', 'ОАЭ', 49, 60, 5,
   'Выверенный бросок',
   'Свет башен отражается на идеально гладком льду. Ошибка заметна сразу — собери серию из пяти голов.'),
  ('00000000-0000-4000-8000-000000000620', '00000000-0000-4000-8000-000000000630',
   10, 'mumbai', 'Мумбаи', 'Индия', 52, 60, 6,
   'Точность у ворот Индии',
   'Шум набережной остаётся за бортом. Для прохода дальше потребуется длинная безошибочная серия.'),
  ('00000000-0000-4000-8000-000000000621', '00000000-0000-4000-8000-000000000631',
   11, 'singapore', 'Сингапур', 'Сингапур', 66, 80, 6,
   'Технологичный прицел',
   'Сингапурская арена фиксирует каждое движение. Докажи точность на расширенном лимите бросков.'),
  ('00000000-0000-4000-8000-000000000622', '00000000-0000-4000-8000-000000000632',
   12, 'beijing', 'Пекин', 'Китай', 76, 90, 7,
   'Дальняя стена',
   'Великая стена уходит за горизонт, как и эта серия. Сохрани расчёт до последнего броска.'),
  ('00000000-0000-4000-8000-000000000623', '00000000-0000-4000-8000-000000000633',
   13, 'tokyo', 'Токио', 'Япония', 80, 90, 7,
   'Неоновый финал',
   'Неон и отражения лишают привычных ориентиров. Финал мирового тура требует почти безошибочной игры.');

update arena_theme arena
   set slug = 'accuracy-world-tour-' || seed.slug,
       title = seed.title,
       artwork_url = '/bonus-games/world-tour/arenas/' || seed.slug || '.webp',
       thumbnail_url = '/bonus-games/world-tour/previews/' || seed.slug || '.webp',
       status = 'active',
       is_selectable = false,
       archived_at = null,
       updated_at = now()
  from bonus_accuracy_world_tour_seed seed
 where arena.id = seed.arena_id
   and seed.sort_order <= 10;

update bonus_game game
   set slug = 'accuracy-' || seed.slug,
       title = seed.title,
       description = 'Мировой тур · ' || seed.country,
       sort_order = seed.sort_order,
       target_goals = seed.target_goals,
       qualification_rules = jsonb_strip_nulls(jsonb_build_object(
         'type', 'goals_from_shots',
         'targetGoals', seed.target_goals,
         'shotsLimit', seed.shots_limit,
         'requiredGoalStreak', seed.required_goal_streak
       )),
       period_rules = (
         select jsonb_agg(
           jsonb_set(
             jsonb_set(
               jsonb_set(period.value, '{durationMs}', '240000'::jsonb),
               '{shotsLimit}', to_jsonb(seed.shots_limit / game.total_periods)
             ),
             '{goaliePattern}', '"linear"'::jsonb
           ) order by period.ordinality
         )
           from jsonb_array_elements(game.period_rules) with ordinality period(value, ordinality)
       ),
       preview_title = seed.preview_title,
       preview_story = seed.preview_story,
       preview_artwork_url = '/bonus-games/world-tour/previews/' || seed.slug || '.webp',
       preview_revision = game.preview_revision + 1,
       arena_theme_id = seed.arena_id,
       goalkeeper_ready_url = '/bonus-games/world-tour/goalkeepers/' || seed.slug || '-ready.webp',
       goalkeeper_save_url = '/bonus-games/world-tour/goalkeepers/' || seed.slug || '-save.webp',
       revision = game.revision + 1,
       updated_at = now()
  from bonus_accuracy_world_tour_seed seed
 where game.id = seed.game_id
   and seed.sort_order <= 10
   and game.skill_code = 'accuracy';

insert into arena_theme
  (id, slug, title, artwork_url, thumbnail_url, status, is_selectable)
select seed.arena_id,
       'accuracy-world-tour-' || seed.slug,
       seed.title,
       '/bonus-games/world-tour/arenas/' || seed.slug || '.webp',
       '/bonus-games/world-tour/previews/' || seed.slug || '.webp',
       'active',
       false
  from bonus_accuracy_world_tour_seed seed
 where seed.sort_order > 10;

insert into bonus_game
  (id, slug, title, skill_code, description, sort_order, status, access_type,
   unlock_price_stars, target_goals, qualification_rules, total_periods,
   break_duration_ms, period_rules, use_inventory,
   preview_title, preview_story, preview_artwork_url, preview_revision,
   reward_coins, reward_stars, reward_experience, arena_theme_id,
   goalkeeper_ready_url, goalkeeper_save_url, revision, created_by)
select seed.game_id,
       'accuracy-' || seed.slug,
       seed.title,
       'accuracy',
       'Мировой тур · ' || seed.country,
       seed.sort_order,
       'active',
       case seed.sort_order when 12 then 'paid' else 'free' end,
       case seed.sort_order when 12 then 10 else 0 end,
       seed.target_goals,
       jsonb_build_object(
         'type', 'goals_from_shots',
         'targetGoals', seed.target_goals,
         'shotsLimit', seed.shots_limit,
         'requiredGoalStreak', seed.required_goal_streak
       ),
       3,
       30000,
       case seed.sort_order
         when 11 then '[
           {"periodNumber":1,"durationMs":240000,"shotsLimit":27,"goalFrequency":0.62,"goalieFrequency":0.90,"shooterFrequency":0.82,"puckSpeedPerMs":1.36,"goaliePattern":"linear","goalieAmplitude":1,"goalAmplitude":220},
           {"periodNumber":2,"durationMs":240000,"shotsLimit":27,"goalFrequency":0.65,"goalieFrequency":0.95,"shooterFrequency":0.85,"puckSpeedPerMs":1.40,"goaliePattern":"linear","goalieAmplitude":1,"goalAmplitude":220},
           {"periodNumber":3,"durationMs":240000,"shotsLimit":26,"goalFrequency":0.68,"goalieFrequency":1.00,"shooterFrequency":0.88,"puckSpeedPerMs":1.45,"goaliePattern":"linear","goalieAmplitude":1,"goalAmplitude":220}
         ]'::jsonb
         else '[
           {"periodNumber":1,"durationMs":240000,"shotsLimit":30,"goalFrequency":0.62,"goalieFrequency":0.90,"shooterFrequency":0.82,"puckSpeedPerMs":1.36,"goaliePattern":"linear","goalieAmplitude":1,"goalAmplitude":220},
           {"periodNumber":2,"durationMs":240000,"shotsLimit":30,"goalFrequency":0.65,"goalieFrequency":0.95,"shooterFrequency":0.85,"puckSpeedPerMs":1.40,"goaliePattern":"linear","goalieAmplitude":1,"goalAmplitude":220},
           {"periodNumber":3,"durationMs":240000,"shotsLimit":30,"goalFrequency":0.68,"goalieFrequency":1.00,"shooterFrequency":0.88,"puckSpeedPerMs":1.45,"goaliePattern":"linear","goalieAmplitude":1,"goalAmplitude":220}
         ]'::jsonb
       end,
       false,
       seed.preview_title,
       seed.preview_story,
       '/bonus-games/world-tour/previews/' || seed.slug || '.webp',
       1,
       case seed.sort_order when 11 then 1800 when 12 then 2200 else 3000 end,
       case seed.sort_order when 11 then 8 when 12 then 10 else 12 end,
       case seed.sort_order when 11 then 900 when 12 then 1100 else 1500 end,
       seed.arena_id,
       '/bonus-games/world-tour/goalkeepers/' || seed.slug || '-ready.webp',
       '/bonus-games/world-tour/goalkeepers/' || seed.slug || '-save.webp',
       1,
       null
  from bonus_accuracy_world_tour_seed seed
 where seed.sort_order > 10;
