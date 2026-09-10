update achievements
   set requirement = case id
     when 'ideal-day' then 'Завершить ежедневную игру 90/90 и тренировку 100/100 в один день.'
     when 'training-monster' then 'Забить 90+ из 100 в тренировке.'
     when 'almost-perfect-training' then 'Забить 99 из 100 в тренировке.'
     when 'stable-student' then '5 тренировок подряд с результатом 80+ из 100.'
     else requirement
   end,
       updated_at = now()
 where id in (
   'ideal-day',
   'training-monster',
   'almost-perfect-training',
   'stable-student'
 );

update achievements
   set reward_currency = case id
     when 'regular-season-champion' then 1500
     when 'regular-season-medalist' then 1000
     when 'playoff-semifinal' then 750
     when 'playoff-final' then 1500
     when 'tournament-cup' then 3750
     when 'tournament-streak' then 7500
     when 'monthly-top-1' then 7500
     else reward_currency
   end,
       updated_at = now()
 where id in (
   'regular-season-champion',
   'regular-season-medalist',
   'playoff-semifinal',
   'playoff-final',
   'tournament-cup',
   'tournament-streak',
   'monthly-top-1'
 );

update admin_inventory_items
   set description = case title
     when 'Изотоник Тест' then 'Питание на 75 минут активной игры. Помогает держать темп.'
     when 'Энерго-заряд' then 'Питание на 160 минут активной игры. Помогает держать темп.'
     when 'Энерго-комплекс' then 'Питание на 280 минут активной игры. Помогает держать темп.'
     else description
   end,
       updated_at = now()
 where title in ('Изотоник Тест', 'Энерго-заряд', 'Энерго-комплекс');

update onboarding_step
   set description = replace(description, '50 бросков', '100 бросков'),
       updated_at = now()
 where title = 'Одной игры мало'
   and description like '%50 бросков%';
