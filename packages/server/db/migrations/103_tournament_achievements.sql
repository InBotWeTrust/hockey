update achievements
   set sort_order = sort_order + 1000,
       updated_at = now()
 where id in (
   'playoff-semifinal',
   'playoff-final',
   'tournament-cup',
   'dark-horse',
   'death-bracket',
   'series-comeback',
   'no-shake',
   'tournament-streak',
   'monthly-top-1',
   'monthly-top-3'
 );

insert into achievements
  (id, photo_url, title, description, requirement, category, availability, future_tag,
   reward_currency, reward_stars, reward_experience, sort_order)
values
  ('regular-season-champion', '/achievements/regular-season-champion.webp',
   'Победитель регулярки', 'Регулярный чемпионат завершен на первом месте.',
   'Занять 1-е место в регулярном чемпионате турнира.',
   'tournament', 'active', null, 125, 250, 250, 400),
  ('regular-season-medalist', '/achievements/regular-season-medalist.webp',
   'Призёр регулярки', 'Место в тройке лучших по итогам регулярного чемпионата.',
   'Занять 2-е или 3-е место в регулярном чемпионате турнира.',
   'tournament', 'active', null, 50, 100, 100, 410),
  ('playoff-semifinal', '/achievements/playoff-semifinal.webp',
   'Турнирный характер', 'Путь по сетке дошел до решающей стадии.',
   'Дойти до полуфинала плей-офф.',
   'tournament', 'active', null, 75, 150, 150, 420),
  ('playoff-final', '/achievements/playoff-final.webp',
   'Финальный лёд', 'Финальная площадка уже близко.',
   'Дойти до финала плей-офф.',
   'tournament', 'active', null, 125, 250, 250, 430),
  ('tournament-cup', '/achievements/tournament-cup.webp',
   'Кубок над головой', 'Турнир завершен чемпионством.',
   'Выиграть турнир.',
   'tournament', 'active', null, 200, 400, 400, 440),
  ('dark-horse', '/achievements/dark-horse.webp',
   'Тёмная лошадка', 'Более опытный соперник выбит из сетки.',
   'Выбить из плей-офф более опытного игрока.',
   'tournament', 'active', null, 100, 200, 200, 450),
  ('death-bracket', '/achievements/death-bracket.webp',
   'Сетка смерти', 'Три сильных соперника подряд не устояли.',
   'Победить 3 соперников подряд, каждого с большим опытом.',
   'tournament', 'active', null, 250, 500, 500, 460),
  ('series-comeback', '/achievements/series-comeback.webp',
   'Мощный камбэк', 'Серия была перевернута после отставания.',
   'Выиграть матч после отставания в серии до нескольких побед.',
   'tournament', 'active', null, 150, 300, 300, 470),
  ('no-shake', '/achievements/no-shake.webp',
   'Без дрожи', 'Плей-офф сыгран с холодной точностью.',
   'В матче плей-офф показать точность 90%+.',
   'tournament', 'active', null, 75, 150, 150, 480),
  ('tournament-streak', '/achievements/tournament-streak.webp',
   'Турнирная серия', 'Сезон с несколькими кубками.',
   'Выиграть 3 турнира за сезон.',
   'tournament', 'active', null, 300, 700, 700, 490)
on conflict (id) do update
   set photo_url = excluded.photo_url,
       title = excluded.title,
       description = excluded.description,
       requirement = excluded.requirement,
       category = excluded.category,
       availability = excluded.availability,
       future_tag = excluded.future_tag,
       reward_currency = excluded.reward_currency,
       reward_stars = excluded.reward_stars,
       reward_experience = excluded.reward_experience,
       sort_order = excluded.sort_order,
       updated_at = now();

update achievements
   set sort_order = case id
         when 'monthly-top-1' then 500
         when 'monthly-top-3' then 510
       end,
       updated_at = now()
 where id in ('monthly-top-1', 'monthly-top-3');
