-- Profile achievements catalogue and per-user unlocks.

create table achievements (
  id text primary key,
  photo_url text not null,
  title text not null,
  description text not null,
  requirement text not null,
  sort_order int not null unique,
  created_at timestamptz not null default now()
);

create table user_achievements (
  user_id uuid not null references users(id) on delete cascade,
  achievement_id text not null references achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index user_achievements_user_unlocked_idx
  on user_achievements (user_id, unlocked_at desc);

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
  );
