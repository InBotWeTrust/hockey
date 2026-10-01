-- Add the mixed-mechanic bonus challenge track. Existing attempts retain their snapshots.

alter table bonus_game
  drop constraint bonus_game_skill_code_check,
  add constraint bonus_game_skill_code_check
    check (skill_code in ('speed', 'accuracy', 'marksmanship', 'endurance', 'challenge')),
  add column challenge_environment jsonb,
  add constraint bonus_game_challenge_environment_check
    check (challenge_environment is null or jsonb_typeof(challenge_environment) = 'object');

alter table bonus_game_daily_attempt_slot
  drop constraint bonus_game_daily_attempt_slot_skill_code_check,
  add constraint bonus_game_daily_attempt_slot_skill_code_check
    check (skill_code in ('speed', 'accuracy', 'marksmanship', 'endurance', 'challenge'));

with seed(
  id, sort_order, slug, title, arena_id, target_goals, qualification_kind,
  duration_ms, shots_limit, goal_window_ms, preview_title, preview_story,
  goal_frequency, goalie_frequency, shooter_frequency, puck_speed, goalie_pattern,
  environment, reward
) as (
  values
    ('00000000-0000-4000-8000-000000000901'::uuid, 1, 'challenge-beach', 'Пляж',
     '00000000-0000-4000-8000-000000000591'::uuid, 25, 'goals_in_time',
     150000, null::int, null::int, 'Жаркий матч',
     'Солнце раскалило лёд, а горячий воздух отнимает силы с каждой атакой. Держите темп, пережидайте усталость и забросьте 25 шайб до сирены.',
     0.50, 0.60, 0.78, 1.25, 'linear',
     '{"fatigue":{"slowdownStartMs":10000,"heavyStartMs":25000,"stopStartMs":40000,"stopDurationMs":4000,"recoveryDurationMs":10000,"slowMultiplier":0.85,"heavyMultiplier":0.65}}'::jsonb, 5),
    ('00000000-0000-4000-8000-000000000902'::uuid, 2, 'challenge-ski-resort', 'Горнолыжный курорт',
     '00000000-0000-4000-8000-000000000592'::uuid, 26, 'goals_from_shots',
     240000, 35, null, 'По склону',
     'Морозный лёд стал быстрым, словно горная трасса. Игрок и шайба разгоняются сильнее обычного — реализуйте 26 из 35 бросков.',
     0.55, 0.58, 0.95, 1.45, 'sine', null, 5),
    ('00000000-0000-4000-8000-000000000903'::uuid, 3, 'challenge-cyberpunk-yard', 'Киберпанк-двор',
     '00000000-0000-4000-8000-000000000593'::uuid, 180, 'points_in_time',
     150000, null, null, 'Неоновый ритм',
     'Ворота дёргаются в неоновом свете, а вратарь бросается из стороны в сторону. Читайте резкий ритм площадки и наберите 18 очков меткости.',
     0.72, 0.90, 0.82, 1.30, 'dash', null, 5),
    ('00000000-0000-4000-8000-000000000904'::uuid, 4, 'challenge-abandoned-waterpark', 'Заброшенный аквапарк',
     '00000000-0000-4000-8000-000000000594'::uuid, 30, 'goals_from_shots',
     240000, 42, null, 'Скользкий маршрут',
     'Старые горки протекают прямо на лёд. Опасные участки появляются в известные моменты — не потеряйте равновесие и забейте 30 из 42.',
     0.54, 0.64, 0.78, 1.25, 'linear',
     '{"stumbleWindows":[{"startMs":55000,"durationMs":650},{"startMs":125000,"durationMs":650}]}'::jsonb, 7),
    ('00000000-0000-4000-8000-000000000905'::uuid, 5, 'challenge-pirate-bay', 'Пиратская бухта',
     '00000000-0000-4000-8000-000000000595'::uuid, 42, 'goals_in_time',
     180000, null, null, 'Качка',
     'Площадку будто раскачивает штормом: спокойные отрезки внезапно сменяются быстрыми. Подстройтесь под волну и забросьте 42 шайбы.',
     0.55, 0.65, 0.78, 1.25, 'sine',
     '{"speedPhases":[{"durationMs":20000,"shooterMultiplier":0.85,"puckSpeedMultiplier":0.90},{"durationMs":20000,"shooterMultiplier":1.20,"puckSpeedMultiplier":1.15}]}'::jsonb, 7),
    ('00000000-0000-4000-8000-000000000906'::uuid, 6, 'challenge-north-pole', 'Северный полюс',
     '00000000-0000-4000-8000-000000000596'::uuid, 48, 'goals_in_time',
     180000, null, null, 'Ледяное дыхание',
     'Здесь идеальное скольжение, но мороз постепенно сковывает игрока. Используйте быстрые отрезки и успейте забить 48 голов.',
     0.58, 0.64, 0.95, 1.45, 'linear',
     '{"fatigue":{"slowdownStartMs":50000,"heavyStartMs":65000,"stopStartMs":75000,"stopDurationMs":4000,"recoveryDurationMs":12000,"slowMultiplier":0.85,"heavyMultiplier":0.65}}'::jsonb, 7),
    ('00000000-0000-4000-8000-000000000907'::uuid, 7, 'challenge-desert', 'Пустыня',
     '00000000-0000-4000-8000-000000000597'::uuid, 1, 'survive_goal_windows',
     210000, null, 7000, 'Тридцать окон',
     'Жара накрывает уже после первых атак, а времени на точный бросок становится всё меньше. Выдержите 30 результативных окон и вовремя восстанавливайте силы.',
     0.52, 0.66, 0.78, 1.25, 'linear',
     '{"fatigue":{"slowdownStartMs":10000,"heavyStartMs":25000,"stopStartMs":40000,"stopDurationMs":5000,"recoveryDurationMs":8000,"slowMultiplier":0.85,"heavyMultiplier":0.65}}'::jsonb, 10),
    ('00000000-0000-4000-8000-000000000908'::uuid, 8, 'challenge-volcanic-ice', 'Вулканический лёд',
     '00000000-0000-4000-8000-000000000598'::uuid, 55, 'goals_in_time',
     200000, null, null, 'Огонь под коньками',
     'Лёд то схватывается, то начинает таять от жара под площадкой. Переживите смену трёх скоростей и забросьте 55 шайб.',
     0.60, 0.68, 0.82, 1.30, 'sine',
     '{"speedPhases":[{"durationMs":25000,"shooterMultiplier":1.15,"puckSpeedMultiplier":1.10},{"durationMs":25000,"shooterMultiplier":0.75,"puckSpeedMultiplier":0.85},{"durationMs":25000,"shooterMultiplier":1.30,"puckSpeedMultiplier":1.20}],"stumbleWindows":[{"startMs":118000,"durationMs":650}]}'::jsonb, 10),
    ('00000000-0000-4000-8000-000000000909'::uuid, 9, 'challenge-castle', 'Замок',
     '00000000-0000-4000-8000-000000000599'::uuid, 500, 'points_in_time',
     210000, null, null, 'Тяжёлые доспехи',
     'Каменные стены гасят звук, а тяжёлая экипировка замедляет каждое движение. Здесь побеждает не скорость, а точность — наберите 50 очков.',
     0.48, 0.62, 0.58, 1.10, 'linear',
     '{"speedPhases":[{"durationMs":210000,"shooterMultiplier":0.80,"puckSpeedMultiplier":1.0}]}'::jsonb, 10),
    ('00000000-0000-4000-8000-000000000910'::uuid, 10, 'challenge-space', 'Космос',
     '00000000-0000-4000-8000-000000000600'::uuid, 48, 'goals_from_shots',
     360000, 60, null, 'Невесомый финал',
     'В невесомости медленно движется всё — игрок, вратарь, ворота и даже шайба. Рассчитывайте длинные траектории и реализуйте 48 из 60 бросков.',
     0.32, 0.38, 0.42, 0.78, 'sine', null, 15)
), scoring as (
  select qualification_rules->'scoring' as rules
    from bonus_game
   where skill_code = 'marksmanship'
     and qualification_rules->>'type' = 'points_in_time'
   order by sort_order, id
   limit 1
)
insert into bonus_game
  (id, slug, title, skill_code, description, sort_order, status, access_type,
   unlock_price_stars, target_goals, qualification_rules, total_periods,
   break_duration_ms, period_rules, challenge_environment, use_inventory,
   preview_title, preview_story, preview_artwork_url, preview_revision,
   reward_coins, reward_stars, reward_experience, arena_theme_id,
   goalkeeper_ready_url, goalkeeper_save_url, revision, created_by)
select seed.id, seed.slug, seed.title, 'challenge', '', seed.sort_order, 'active', 'free',
       0, seed.target_goals,
       case seed.qualification_kind
         when 'goals_in_time' then jsonb_build_object(
           'type', 'goals_in_time', 'targetGoals', seed.target_goals,
           'activeTimeMs', seed.duration_ms)
         when 'goals_from_shots' then jsonb_build_object(
           'type', 'goals_from_shots', 'targetGoals', seed.target_goals,
           'shotsLimit', seed.shots_limit)
         when 'points_in_time' then jsonb_build_object(
           'type', 'points_in_time', 'targetPoints', seed.target_goals,
           'activeTimeMs', seed.duration_ms, 'scoring', scoring.rules)
         else jsonb_build_object(
           'type', 'survive_goal_windows', 'activeTimeMs', seed.duration_ms,
           'goalWindowMs', seed.goal_window_ms)
       end,
       1, 0,
       jsonb_build_array(jsonb_build_object(
         'periodNumber', 1, 'durationMs', seed.duration_ms,
         'shotsLimit', seed.shots_limit, 'goalFrequency', seed.goal_frequency,
         'goalieFrequency', seed.goalie_frequency, 'shooterFrequency', seed.shooter_frequency,
         'puckSpeedPerMs', seed.puck_speed, 'goaliePattern', seed.goalie_pattern,
         'goalieAmplitude', 1, 'goalAmplitude', 220
       )),
       seed.environment, false, seed.preview_title, seed.preview_story,
       '/bonus-games/location-cards/' || replace(seed.slug, 'challenge-', '') || '.webp',
       1, 0, seed.reward, seed.reward, seed.arena_id,
       '/bonus-games/goalkeepers/' || replace(seed.slug, 'challenge-', '') || '-ready.webp',
       '/bonus-games/goalkeepers/' || replace(seed.slug, 'challenge-', '') || '-save.webp',
       1, null
  from seed
  cross join scoring
  join arena_theme arena on arena.id = seed.arena_id;

update bonus_game
   set reward_stars = 15,
       reward_experience = 15,
       revision = revision + 1,
       updated_at = now()
 where skill_code in ('accuracy', 'endurance')
   and sort_order = 10;
