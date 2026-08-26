-- Split the bonus qualification catalog into independent speed and accuracy tracks.
-- This is a dev data reset: paid unlocks are refunded, historic rewards and economy
-- events are preserved, and bonus arenas stop being selectable as home arenas.

alter table bonus_game
  add column skill_code text not null default 'speed'
    check (skill_code in ('speed', 'accuracy')),
  add column qualification_rules jsonb,
  add column use_inventory boolean not null default false,
  add column preview_title text not null default '',
  add column preview_story text not null default '',
  add column preview_artwork_url text not null default '',
  add column preview_revision int not null default 1 check (preview_revision > 0);

alter table bonus_game
  add constraint bonus_game_qualification_rules_check
  check (qualification_rules is null or jsonb_typeof(qualification_rules) = 'object');

drop index bonus_game_one_active_sort_order_idx;
create unique index bonus_game_one_active_skill_sort_order_idx
  on bonus_game (skill_code, sort_order)
  where status = 'active';

drop index bonus_game_catalog_idx;
create index bonus_game_catalog_idx
  on bonus_game (status, skill_code, sort_order, id);

alter table bonus_game_attempt
  add column current_goal_streak int not null default 0 check (current_goal_streak >= 0),
  add column best_goal_streak int not null default 0 check (best_goal_streak >= 0),
  add column preview_acknowledged_at timestamptz;

alter table bonus_game_period_log
  add column loadout_snapshot jsonb;

create table user_bonus_game_preview_preference (
  user_id uuid not null references users(id) on delete cascade,
  bonus_game_id uuid not null references bonus_game(id) on delete cascade,
  dismissed_revision int not null check (dismissed_revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, bonus_game_id)
);

create table bonus_game_period_loadout (
  attempt_id uuid not null references bonus_game_attempt(id) on delete cascade,
  period_number smallint not null check (period_number between 1 and 9),
  selection jsonb not null check (jsonb_typeof(selection) = 'object'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (attempt_id, period_number)
);

alter table bonus_game_economy_event
  drop constraint bonus_game_economy_event_kind_check,
  add constraint bonus_game_economy_event_kind_check
    check (kind in ('unlock_purchase', 'unlock_refund', 'first_clear_reward'));

with refunds as (
  select user_id, sum(paid_price_stars)::int as stars
    from user_bonus_game_unlock
   where paid_price_stars > 0
   group by user_id
)
update users
   set xp = users.xp + refunds.stars
  from refunds
 where users.id = refunds.user_id;

with ordered_refunds as (
  select unlock.*,
         sum(unlock.paid_price_stars) over (
           partition by unlock.user_id
           order by unlock.unlocked_at, unlock.id
           rows between unbounded preceding and current row
         )::int as running_refund_stars,
         sum(unlock.paid_price_stars) over (
           partition by unlock.user_id
         )::int as total_refund_stars
    from user_bonus_game_unlock unlock
   where unlock.paid_price_stars > 0
)
insert into bonus_game_economy_event
  (user_id, bonus_game_id, kind,
   coins_delta, stars_delta, experience_delta,
   coins_after, stars_after, experience_after, snapshot, created_at)
select refund.user_id,
       refund.bonus_game_id,
       'unlock_refund',
       0,
       refund.paid_price_stars,
       0,
       account.balance,
       users.xp - refund.total_refund_stars + refund.running_refund_stars,
       users.experience,
       jsonb_build_object(
         'paidPriceStars', refund.paid_price_stars,
         'reason', 'bonus_skill_catalog_reset',
         'originalEconomyEventId', refund.economy_event_id,
         'originalUnlockedAt', refund.unlocked_at
       ),
       now()
  from ordered_refunds refund
  join users on users.id = refund.user_id
  join user_currency_account account on account.user_id = refund.user_id;

update users
   set home_arena_theme_id = null
 where exists (
   select 1
     from user_arena_unlock unlock
    where unlock.user_id = users.id
      and unlock.arena_theme_id = users.home_arena_theme_id
      and unlock.source_type = 'bonus_game'
 );

delete from user_arena_unlock where source_type = 'bonus_game';
delete from user_bonus_game_completion;
delete from user_bonus_game_unlock;
delete from bonus_game_attempt;

update bonus_game game
   set skill_code = 'speed',
       slug = 'speed-' || game.slug,
       qualification_rules = jsonb_strip_nulls(jsonb_build_object(
         'type', 'goals_in_time',
         'targetGoals', game.target_goals,
         'activeTimeMs', case game.sort_order
           when 1 then 120000 when 2 then 120000 when 3 then 120000
           when 4 then 180000 when 5 then 180000 when 6 then 180000
           when 7 then 240000 when 8 then 240000 when 9 then 240000
           when 10 then 360000
         end,
         'requiredGoalStreak', case game.sort_order
           when 3 then 3 when 5 then 3 when 6 then 4 when 7 then 4
           when 8 then 5 when 9 then 6 when 10 then 7
         end
       )),
       period_rules = (
         select jsonb_agg(
           jsonb_set(
             jsonb_set(
               jsonb_set(period.value, '{durationMs}', to_jsonb(
                 (case game.sort_order
                   when 1 then 120000 when 2 then 120000 when 3 then 120000
                   when 4 then 180000 when 5 then 180000 when 6 then 180000
                   when 7 then 240000 when 8 then 240000 when 9 then 240000
                   when 10 then 360000
                 end) / game.total_periods
               )),
               '{shotsLimit}', 'null'::jsonb
             ),
             '{goaliePattern}', '"linear"'::jsonb
           ) order by period.ordinality
         )
           from jsonb_array_elements(game.period_rules) with ordinality period(value, ordinality)
       ),
       preview_title = case game.sort_order
         when 1 then 'Стартовый разгон'
         when 2 then 'Гонка со временем'
         when 3 then 'Неоновый спринт'
         when 4 then 'Быстрее потока'
         when 5 then 'Штурм бухты'
         when 6 then 'Ледяной темп'
         when 7 then 'Наперегонки с жарой'
         when 8 then 'До извержения'
         when 9 then 'Королевский рывок'
         when 10 then 'Орбитальная скорость'
       end,
       preview_story = case game.sort_order
         when 1 then 'На горячем побережье лёд тает на глазах. Набери нужный счёт, пока стартовый таймер не обнулился.'
         when 2 then 'Высота не прощает пауз: держи темп на каждом отрезке и опереди горный таймер.'
         when 3 then 'Неоновая арена ускоряет ритм. Здесь проходит тот, кто принимает решение без задержки.'
         when 4 then 'Старые горки молчат, но поток всё ещё набирает силу. Заверши норматив раньше него.'
         when 5 then 'Команда бухты откроет проход только тому, кто проведёт быструю серию атак.'
         when 6 then 'На предельном холоде нельзя останавливаться: удерживай темп, пока не замёрз таймер.'
         when 7 then 'Жара ломает лёд и концентрацию. Забивай быстрее, чем площадка начнёт таять.'
         when 8 then 'Арена просыпается. Выполни норматив до следующего извержения.'
         when 9 then 'Королевская стража проверяет решительность: промедление закроет ворота замка.'
         when 10 then 'На орбите нет привычного ритма. Пройди финальный норматив до конца отсчёта.'
       end,
       preview_artwork_url = '/bonus-games/previews/' || replace(game.slug, 'speed-', '') || '.webp',
       preview_revision = 2,
       use_inventory = false,
       revision = game.revision + 1,
       updated_at = now()
 where game.id between '00000000-0000-4000-8000-000000000601'
                   and '00000000-0000-4000-8000-000000000610';

update arena_theme arena
   set slug = 'speed-' || arena.slug,
       is_selectable = false,
       updated_at = now()
 where arena.id between '00000000-0000-4000-8000-000000000591'
                    and '00000000-0000-4000-8000-000000000600';

insert into arena_theme
  (id, slug, title, artwork_url, thumbnail_url, status, is_selectable)
select ('00000000-0000-4000-8000-' || lpad((620 + game.sort_order)::text, 12, '0'))::uuid,
       'accuracy-' || replace(source.slug, 'speed-', ''),
       source.title,
       source.artwork_url,
       source.thumbnail_url,
       source.status,
       false
  from arena_theme source
  join bonus_game game on game.arena_theme_id = source.id
 where game.skill_code = 'speed';

insert into bonus_game
  (id, slug, title, skill_code, description, sort_order, status, access_type,
   unlock_price_stars, target_goals, qualification_rules, total_periods,
   break_duration_ms, period_rules, use_inventory,
   preview_title, preview_story, preview_artwork_url, preview_revision,
   reward_coins, reward_stars, reward_experience, arena_theme_id,
   goalkeeper_ready_url, goalkeeper_save_url, revision, created_by)
select ('00000000-0000-4000-8000-' || lpad((610 + speed.sort_order)::text, 12, '0'))::uuid,
       'accuracy-' || replace(speed.slug, 'speed-', ''),
       speed.title,
       'accuracy',
       speed.description,
       speed.sort_order,
       speed.status,
       speed.access_type,
       speed.unlock_price_stars,
       speed.target_goals,
       jsonb_strip_nulls(jsonb_build_object(
         'type', 'goals_from_shots',
         'targetGoals', speed.target_goals,
         'shotsLimit', case speed.sort_order
           when 1 then 30 when 2 then 30 when 3 then 30
           when 4 then 50 when 5 then 50 when 6 then 50
           when 7 then 60 when 8 then 60 when 9 then 60
           when 10 then 90
         end,
         'requiredGoalStreak', case speed.sort_order
           when 3 then 3 when 5 then 3 when 6 then 4 when 7 then 4
           when 8 then 5 when 9 then 6 when 10 then 7
         end
       )),
       speed.total_periods,
       speed.break_duration_ms,
       (
         select jsonb_agg(
           jsonb_set(
             jsonb_set(
               jsonb_set(period.value, '{durationMs}', '240000'::jsonb),
               '{shotsLimit}', to_jsonb(
                 (case speed.sort_order
                   when 1 then 30 when 2 then 30 when 3 then 30
                   when 4 then 50 when 5 then 50 when 6 then 50
                   when 7 then 60 when 8 then 60 when 9 then 60
                   when 10 then 90
                 end) / speed.total_periods
               )
             ),
             '{goaliePattern}', '"linear"'::jsonb
           ) order by period.ordinality
         )
           from jsonb_array_elements(speed.period_rules) with ordinality period(value, ordinality)
       ),
       false,
       case speed.sort_order
         when 1 then 'Точный старт'
         when 2 then 'Горный прицел'
         when 3 then 'Неоновая точность'
         when 4 then 'Чистая траектория'
         when 5 then 'Меткий корсар'
         when 6 then 'Холодный расчёт'
         when 7 then 'Испытание концентрацией'
         when 8 then 'Между трещинами'
         when 9 then 'Рыцарский экзамен'
         when 10 then 'Финальная точность'
       end,
       case speed.sort_order
         when 1 then 'Первый экзамен проходит у моря: выбери момент и докажи, что каждый бросок осознанный.'
         when 2 then 'Разреженный воздух обманывает чувство дистанции. Сохрани точность на всей горной серии.'
         when 3 then 'Неон скрывает траекторию, но система считает каждый промах. Выполни норматив попаданий.'
         when 4 then 'Потёртый лёд меняет картинку, но не цель. Собери нужное число голов из отведённых бросков.'
         when 5 then 'В бухте ценят не шум, а результат. Докажи право на проход точной серией атак.'
         when 6 then 'На предельном холоде побеждают расчёт и безошибочная серия.'
         when 7 then 'Миражи сбивают прицел. Не растрачивай ограниченный запас бросков.'
         when 8 then 'Пепел скрывает разметку. Находи чистую траекторию среди светящихся трещин.'
         when 9 then 'Рыцарский экзамен требует точности, выдержки и длинной серии голов.'
         when 10 then 'Последняя квалификация проходит без привычных ориентиров. Каждый бросок приближает к допуску.'
       end,
       speed.preview_artwork_url,
       2,
       speed.reward_coins,
       speed.reward_stars,
       speed.reward_experience,
       ('00000000-0000-4000-8000-' || lpad((620 + speed.sort_order)::text, 12, '0'))::uuid,
       speed.goalkeeper_ready_url,
       speed.goalkeeper_save_url,
       speed.revision,
       speed.created_by
  from bonus_game speed
 where speed.skill_code = 'speed';

alter table bonus_game
  alter column qualification_rules set not null;
