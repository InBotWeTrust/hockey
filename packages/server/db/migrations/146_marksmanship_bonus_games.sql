-- Add the dev-only marksmanship bonus track. Existing attempts keep zero-valued
-- point columns and their immutable rules snapshots.

alter table bonus_game
  drop constraint bonus_game_skill_code_check,
  add constraint bonus_game_skill_code_check
    check (skill_code in ('speed', 'accuracy', 'marksmanship'));

alter table bonus_game_daily_attempt_slot
  drop constraint bonus_game_daily_attempt_slot_skill_code_check,
  drop constraint bonus_game_daily_attempt_slot_slot_check,
  add constraint bonus_game_daily_attempt_slot_skill_code_check
    check (skill_code in ('speed', 'accuracy', 'marksmanship')),
  add constraint bonus_game_daily_attempt_slot_slot_check
    check (slot between 1 and 100);

alter table bonus_game_attempt
  add column total_points int not null default 0 check (total_points >= 0);

alter table bonus_game_period_log
  add column total_points int not null default 0 check (total_points >= 0);

alter table shot_session
  add column awarded_points int not null default 0
    check (awarded_points between 0 and 185),
  add column score_details jsonb
    check (score_details is null or jsonb_typeof(score_details) = 'object');

insert into arena_theme
  (id, slug, title, artwork_url, thumbnail_url, status, is_selectable)
values
  ('00000000-0000-4000-8000-000000000700',
   'marksmanship-amateur-court',
   'Площадка любителей',
   '/sprites/amateur-daily-court.webp',
   '/sprites/amateur-daily-court.webp',
   'active',
   false);

insert into bonus_game
  (id, slug, title, skill_code, description, sort_order, status, access_type,
   unlock_price_stars, target_goals, qualification_rules, total_periods,
   break_duration_ms, period_rules, use_inventory,
   preview_title, preview_story, preview_artwork_url, preview_revision,
   reward_coins, reward_stars, reward_experience, arena_theme_id,
   goalkeeper_ready_url, goalkeeper_save_url, revision, created_by)
select seed.id,
       'marksmanship-' || seed.sort_order,
       'Меткость ' || seed.sort_order,
       'marksmanship',
       'Наберите ' || seed.target_points || ' очков за отведённое время.',
       seed.sort_order,
       'active',
       'free',
       0,
       seed.target_points,
       jsonb_build_object(
         'type', 'points_in_time',
         'targetPoints', seed.target_points,
         'activeTimeMs', seed.duration_ms,
         'scoring', jsonb_build_object(
           'scanStepMs', 10,
           'counterDirectionBonus', 15,
           'counterDirectionGoalDistance', 24,
           'brackets', jsonb_build_array(
             jsonb_build_object('minWindowMs', 250, 'points', 100, 'code', 'open'),
             jsonb_build_object('minWindowMs', 160, 'points', 115, 'code', 'timed'),
             jsonb_build_object('minWindowMs', 100, 'points', 130, 'code', 'precise'),
             jsonb_build_object('minWindowMs', 70, 'points', 140, 'code', 'narrow'),
             jsonb_build_object('minWindowMs', 50, 'points', 155, 'code', 'very_narrow'),
             jsonb_build_object('minWindowMs', 0, 'points', 170, 'code', 'instant')
           )
         )
       ),
       1,
       0,
       jsonb_build_array(jsonb_build_object(
         'periodNumber', 1,
         'durationMs', seed.duration_ms,
         'shotsLimit', null,
         'goalFrequency', 0.5,
         'goalieFrequency', 0.6,
         'shooterFrequency', 0.75,
         'puckSpeedPerMs', 1.25,
         'goaliePattern', 'linear',
         'goalieAmplitude', 1,
         'goalAmplitude', 220
       )),
       false,
       'Меткость ' || seed.sort_order,
       'Выбирайте сложные моменты и набирайте больше очков за короткие голевые окна.',
       '/sprites/amateur-daily-court.webp',
       1,
       0,
       1,
       1,
       '00000000-0000-4000-8000-000000000700',
       '/sprites/training-goalie-amateur.webp',
       '/sprites/training-goalie-amateur-save.webp',
       1,
       null
  from (
    values
      ('00000000-0000-4000-8000-000000000701'::uuid, 1,  30000,  1100),
      ('00000000-0000-4000-8000-000000000702'::uuid, 2,  60000,  2450),
      ('00000000-0000-4000-8000-000000000703'::uuid, 3,  90000,  4000),
      ('00000000-0000-4000-8000-000000000704'::uuid, 4, 120000,  5750),
      ('00000000-0000-4000-8000-000000000705'::uuid, 5, 150000,  7750),
      ('00000000-0000-4000-8000-000000000706'::uuid, 6, 180000,  9950),
      ('00000000-0000-4000-8000-000000000707'::uuid, 7, 210000, 12450)
  ) seed(id, sort_order, duration_ms, target_points);
