alter table users
  add column if not exists experience int not null default 0 check (experience >= 0);

alter table achievements
  add column if not exists category text not null default 'daily',
  add column if not exists availability text not null default 'active',
  add column if not exists future_tag text,
  add column if not exists reward_currency int not null default 0 check (reward_currency >= 0),
  add column if not exists reward_stars int not null default 0 check (reward_stars >= 0),
  add column if not exists reward_experience int not null default 0 check (reward_experience >= 0),
  add column if not exists updated_at timestamptz not null default now();

alter table achievements
  drop constraint if exists achievements_category_check,
  add constraint achievements_category_check
    check (category in ('daily', 'training', 'duel', 'tournament', 'shop', 'rating', 'level')),
  drop constraint if exists achievements_availability_check,
  add constraint achievements_availability_check
    check (availability in ('active', 'future', 'hidden')),
  drop constraint if exists achievements_future_tag_check,
  add constraint achievements_future_tag_check
    check (future_tag is null or future_tag in ('future/pro', 'future/tournament', 'future/monthly_rating'));

alter table user_achievements
  rename column unlocked_at to completed_at;

alter table user_achievements
  add column if not exists claimed_at timestamptz,
  add column if not exists completion_context jsonb not null default '{}'::jsonb;

update user_achievements
   set claimed_at = coalesce(claimed_at, completed_at)
 where claimed_at is null;

create table achievement_progress (
  user_id uuid not null references users(id) on delete cascade,
  key text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index achievement_progress_updated_idx
  on achievement_progress (updated_at desc);

update achievements
   set availability = 'hidden',
       sort_order = sort_order + 10000,
       updated_at = now();

insert into achievements
  (id, photo_url, title, description, requirement, category, availability, future_tag,
   reward_currency, reward_stars, reward_experience, sort_order)
values
  ('ideal-day', '/achievements/ideal-day.webp', 'Идеальный день', 'День, когда каждая шайба нашла сетку.', 'Завершить ежедневную игру 90/90 и тренировку 50/50 в один день.', 'daily', 'active', null, 500, 5, 250, 10),
  ('first-goal', '/achievements/first-goal.webp', 'Первая шайба', 'Первый гол всегда самый громкий.', 'Забросить первую шайбу в игре.', 'daily', 'active', null, 50, 1, 25, 20),
  ('first-daily-game', '/achievements/first-daily-game.webp', 'С почином', 'Первый полный игровой день позади.', 'Завершить первую ежедневную игру.', 'daily', 'active', null, 100, 1, 50, 30),
  ('first-training', '/achievements/first-training.webp', 'Начало положено', 'Тренировочный лед уже знаком.', 'Завершить первую тренировку.', 'training', 'active', null, 100, 1, 50, 40),
  ('amateur-ticket', '/achievements/amateur-ticket.webp', 'Билет в Любители', 'Пора выходить к живым соперникам.', 'Открыть раздел Любители.', 'level', 'active', null, 300, 3, 150, 50),
  ('pro-ticket', '/achievements/pro-ticket.webp', 'Билет в Про', 'Профессиональная арена ждет своего часа.', 'Открыть раздел Профессионалы.', 'level', 'future', 'future/pro', 0, 0, 0, 60),
  ('daily-sniper-streak', '/achievements/daily-sniper-streak.webp', 'Снайперская серия', 'Серия бросков, где рука не дрогнула.', 'Забить 25 бросков подряд в ежедневной игре.', 'daily', 'active', null, 150, 1, 75, 70),
  ('ice-hand', '/achievements/ice-hand.webp', 'Ледяная рука', 'Холодная голова и почти безупречная точность.', 'Завершить ежедневную игру с точностью 95%+.', 'daily', 'active', null, 150, 1, 75, 80),
  ('steady-tempo', '/achievements/steady-tempo.webp', 'Ровный темп', 'Три периода сыграны как по метроному.', 'Во всех 3 периодах ежедневной игры забить одинаково, но не менее 20.', 'daily', 'active', null, 150, 1, 75, 90),
  ('third-period-decides', '/achievements/third-period-decides.webp', 'Третий период решает', 'Лучший хоккей пришел в нужный момент.', 'Показать лучший результат в 3-м периоде; первые два периода не менее 20.', 'daily', 'active', null, 150, 1, 75, 100),
  ('final-push', '/achievements/final-push.webp', 'Дожим', 'Концовка периода сыграна без права на ошибку.', 'Забить последние 10 бросков периода подряд. Любая игра кроме тренировки.', 'duel', 'active', null, 250, 2, 120, 110),
  ('no-panic', '/achievements/no-panic.webp', 'Без паники', 'Плохая серия не сбила темп.', 'После 3 не-голов подряд забить 10 следующих бросков. Любая игра кроме тренировки.', 'duel', 'active', null, 250, 2, 120, 120),
  ('dry-finish', '/achievements/dry-finish.webp', 'Сухая концовка', 'Финиш дня прошел идеально.', 'Последние 20 бросков ежедневной игры сыграть без промаха.', 'daily', 'active', null, 150, 1, 75, 130),
  ('keeping-fit', '/achievements/keeping-fit.webp', 'Держусь в форме', 'Неделя стабильного льда.', '7 дней подряд завершать daily с точностью не менее 50% каждый день.', 'daily', 'active', null, 150, 1, 75, 140),
  ('sniper-week', '/achievements/sniper-week.webp', 'Неделя снайпера', 'Семь полных дней с уверенной точностью.', 'Держать суммарную точность 75%+ за последние 7 завершенных daily.', 'daily', 'active', null, 150, 1, 75, 150),
  ('sniper-month', '/achievements/sniper-month.webp', 'Месяц снайпера', 'Длинная дистанция для настоящего стрелка.', 'Держать суммарную точность 75%+ за последние 30 завершенных daily.', 'daily', 'active', null, 150, 1, 75, 160),
  ('training-monster', '/achievements/training-monster.webp', 'Тренировочный монстр', 'Тренировка прошла почти на максимуме.', 'Забить 45+ из 50 в тренировке.', 'training', 'active', null, 120, 1, 60, 170),
  ('almost-perfect-training', '/achievements/almost-perfect-training.webp', 'Почти идеально', 'Один бросок отделил от абсолютного дня.', 'Забить 49 из 50 в тренировке.', 'training', 'active', null, 120, 1, 60, 180),
  ('rhythm-control', '/achievements/rhythm-control.webp', 'Контроль ритма', 'Длинная тренировочная серия без сбоя.', 'В тренировке забить 30 подряд.', 'training', 'active', null, 120, 1, 60, 190),
  ('cold-start', '/achievements/cold-start.webp', 'Холодный старт', 'Дуэль началась с идеальной серии.', 'Первые 20 бросков в дуэли забить без промаха.', 'duel', 'active', null, 250, 2, 120, 200),
  ('no-warmup-needed', '/achievements/no-warmup-needed.webp', 'Разминка не нужна', 'Тренировка началась сразу с попаданий.', 'Первые 20 бросков в тренировке забить без промаха.', 'training', 'active', null, 120, 1, 60, 210),
  ('finish-machine', '/achievements/finish-machine.webp', 'Машина на финише', 'Последний отрезок тренировки прошел идеально.', 'Последние 20 бросков тренировки сыграть на 100%.', 'training', 'active', null, 120, 1, 60, 220),
  ('underdog', '/achievements/underdog.webp', 'Андердог', 'Победа вопреки разнице в опыте.', 'Победить в дуэли более опытного соперника с опытом не менее 100.', 'duel', 'active', null, 250, 2, 120, 230),
  ('classic-speed', '/achievements/classic-speed.webp', 'Скорость в классике', 'Быстрый период без потери качества.', 'Отыграть период классической дуэли за 90 секунд с точностью 85%+.', 'duel', 'active', null, 250, 2, 120, 240),
  ('nervous-finish', '/achievements/nervous-finish.webp', 'Нервная концовка', 'Победа удержана на последней грани.', 'Выиграть в дуэли с разницей в 1 шайбу.', 'duel', 'active', null, 250, 2, 120, 250),
  ('stable-student', '/achievements/stable-student.webp', 'Стабильный ученик', 'Пять крепких тренировок подряд.', '5 тренировок подряд с результатом 40+ из 50.', 'training', 'active', null, 120, 1, 60, 260),
  ('training-before-battle', '/achievements/training-before-battle.webp', 'Тренировка перед боем', 'Подготовка сразу принесла победу.', 'Завершить тренировку и затем выиграть следующую дуэль.', 'duel', 'active', null, 250, 2, 120, 270),
  ('dangerous-host', '/achievements/dangerous-host.webp', 'Опасный хозяин', 'Своя инициатива стала серией побед.', 'Выиграть 3 подряд дуэли, которые начал сам.', 'duel', 'active', null, 250, 2, 120, 280),
  ('blowout', '/achievements/blowout.webp', 'Разгром', 'Соперник остался далеко позади.', 'Выиграть дуэль с разницей 20+ шайб.', 'duel', 'active', null, 250, 2, 120, 290),
  ('thin-edge', '/achievements/thin-edge.webp', 'На тоненького', 'Победа с минимальным запасом уверенности.', 'Выиграть дуэль с разницей в 2 шайбы.', 'duel', 'active', null, 250, 2, 120, 300),
  ('revenge', '/achievements/revenge.webp', 'Реванш', 'Ответ на прошлое поражение пришел сразу.', 'Победить игрока, которому только что проиграл прошлую дуэль.', 'duel', 'active', null, 250, 2, 120, 310),
  ('hunter-streak', '/achievements/hunter-streak.webp', 'Серия охотника', 'Пять побед подряд в дуэлях.', 'Выиграть 5 дуэлей подряд.', 'duel', 'active', null, 250, 2, 120, 320),
  ('clean-win', '/achievements/clean-win.webp', 'Чистая победа', 'Классика забрана период за периодом.', 'Выиграть классическую дуэль, победив в каждом периоде.', 'duel', 'active', null, 250, 2, 120, 330),
  ('handled-pressure', '/achievements/handled-pressure.webp', 'Давление выдержано', 'Соперник закончил раньше, но матч остался за тобой.', 'Выиграть дуэль, где соперник завершил броски раньше тебя.', 'duel', 'active', null, 250, 2, 120, 340),
  ('dangerous-guest', '/achievements/dangerous-guest.webp', 'Опасный гость', 'Чужой вызов стал твоей серией.', 'Выиграть 3 дуэли подряд, начатые соперниками.', 'duel', 'active', null, 250, 2, 120, 350),
  ('no-room-for-error', '/achievements/no-room-for-error.webp', 'Без права на ошибку', 'Победа с почти идеальной точностью.', 'Выиграть дуэль, промахнувшись не больше 5 раз.', 'duel', 'active', null, 250, 2, 120, 360),
  ('wallet', '/achievements/wallet.webp', 'Кошелек', 'Первая реальная покупка в магазине.', 'Совершить первую покупку через оплату.', 'shop', 'active', null, 100, 1, 50, 370),
  ('economical-master', '/achievements/economical-master.webp', 'Экономный мастер', 'Победы без дополнительной помощи.', 'Выиграть 10 дуэлей без использования дополнительного инвентаря.', 'duel', 'active', null, 250, 2, 120, 380),
  ('master-arsenal', '/achievements/master-arsenal.webp', 'Арсенал мастера', 'Каждый слот сработал в победной дуэли.', 'Выиграть дуэль, когда каждый слот инвентаря был задействован.', 'duel', 'active', null, 250, 2, 120, 390),
  ('playoff-semifinal', '/achievements/playoff-semifinal.webp', 'Турнирный характер', 'Путь по сетке дошел до решающей стадии.', 'Дойти до полуфинала плей-офф.', 'tournament', 'future', 'future/tournament', 0, 0, 0, 400),
  ('playoff-final', '/achievements/playoff-final.webp', 'Финальный лед', 'Финальная площадка уже близко.', 'Дойти до финала плей-офф.', 'tournament', 'future', 'future/tournament', 0, 0, 0, 410),
  ('tournament-cup', '/achievements/tournament-cup.webp', 'Кубок над головой', 'Турнир завершен чемпионством.', 'Выиграть турнир.', 'tournament', 'future', 'future/tournament', 0, 0, 0, 420),
  ('dark-horse', '/achievements/dark-horse.webp', 'Темная лошадка', 'Более опытный соперник выбит из сетки.', 'Выбить из плей-офф более опытного игрока.', 'tournament', 'future', 'future/tournament', 0, 0, 0, 430),
  ('death-bracket', '/achievements/death-bracket.webp', 'Сетка смерти', 'Три сильных соперника подряд не устояли.', 'Победить 3 соперников подряд, каждого с большим опытом.', 'tournament', 'future', 'future/tournament', 0, 0, 0, 440),
  ('series-comeback', '/achievements/series-comeback.webp', 'Мощный камбэк', 'Серия была перевернута после отставания.', 'Выиграть матч после отставания в серии до нескольких побед.', 'tournament', 'future', 'future/tournament', 0, 0, 0, 450),
  ('no-shake', '/achievements/no-shake.webp', 'Без дрожи', 'Плей-офф сыгран с холодной точностью.', 'В матче плей-офф показать точность 90%+.', 'tournament', 'future', 'future/tournament', 0, 0, 0, 460),
  ('tournament-streak', '/achievements/tournament-streak.webp', 'Турнирная серия', 'Сезон с несколькими кубками.', 'Выиграть 3 турнира за сезон.', 'tournament', 'future', 'future/tournament', 0, 0, 0, 470),
  ('monthly-top-1', '/achievements/monthly-top-1.webp', 'Топ 1 месяца', 'Месяц завершен на вершине рейтинга.', 'Стать победителем рейтинга дуэлей по итогам месяца.', 'rating', 'future', 'future/monthly_rating', 0, 0, 0, 480),
  ('monthly-top-3', '/achievements/monthly-top-3.webp', 'Топ 3 месяца', 'Месяц завершен в числе лидеров.', 'Попасть в топ-3 рейтинга дуэлей по итогам месяца.', 'rating', 'future', 'future/monthly_rating', 0, 0, 0, 490)
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

insert into user_achievements
  (user_id, achievement_id, completed_at, claimed_at, completion_context)
select user_id, 'first-daily-game', completed_at, claimed_at, completion_context
  from user_achievements
 where achievement_id = 'first-game'
on conflict (user_id, achievement_id) do update
   set completed_at = least(user_achievements.completed_at, excluded.completed_at),
       claimed_at = coalesce(user_achievements.claimed_at, excluded.claimed_at),
       completion_context = user_achievements.completion_context || excluded.completion_context;

delete from user_achievements where achievement_id = 'first-game';
