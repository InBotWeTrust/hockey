-- Refresh achievement catalogue after profile achievement design pass.

delete from user_achievements
 where achievement_id in ('first-shot', 'period-finisher', 'ten-goals');

delete from achievements
 where id in ('first-shot', 'period-finisher', 'ten-goals');

insert into achievements (id, photo_url, title, description, requirement, sort_order)
values
  (
    'first-goal',
    '/achievements/first-goal.webp',
    'Первая шайба',
    'Первый гол всегда самый шумный.',
    'Забить 1 гол.',
    10
  ),
  (
    'first-training',
    '/achievements/first-training.webp',
    'Первая тренировка',
    'Ты довел тренировку до финального свистка.',
    'Закончить тренировку до конца.',
    20
  ),
  (
    'first-game',
    '/achievements/first-game.webp',
    'Первая игра',
    'Три периода позади, первая полноценная игра в истории.',
    'Завершить все 3 периода дневной игры.',
    30
  ),
  (
    'sniper-hand',
    '/achievements/sniper-hand.webp',
    'Рука снайпера',
    'Идеальный период: каждый бросок нашел сетку.',
    'Сыграть период с точностью 100%.',
    40
  ),
  (
    'amateur-ticket',
    '/achievements/amateur-ticket.webp',
    'Билет в любители',
    'Ты готов к любительским дуэлям и турнирам.',
    'Открыть уровень «Любитель».',
    50
  ),
  (
    'pro-ticket',
    '/achievements/pro-ticket.webp',
    'Билет в про',
    'Профессиональная арена ждет твоего выхода.',
    'Открыть уровень «Профессионал».',
    60
  )
on conflict (id) do update
   set photo_url = excluded.photo_url,
       title = excluded.title,
       description = excluded.description,
       requirement = excluded.requirement,
       sort_order = excluded.sort_order;
