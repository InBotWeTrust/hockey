-- Publish the V2 marksmanship rules and expand the track to ten levels.
-- Attempt snapshots remain immutable; only catalog definitions are updated.

alter table shot_session
  drop constraint shot_session_awarded_points_check,
  add constraint shot_session_awarded_points_check
    check (awarded_points between 0 and 1000);

with level(id, sort_order, duration_ms, target_points) as (
  values
    ('00000000-0000-4000-8000-000000000701'::uuid,  1,  30000,  1250),
    ('00000000-0000-4000-8000-000000000702'::uuid,  2,  50000,  2200),
    ('00000000-0000-4000-8000-000000000703'::uuid,  3,  70000,  3300),
    ('00000000-0000-4000-8000-000000000704'::uuid,  4,  90000,  4500),
    ('00000000-0000-4000-8000-000000000705'::uuid,  5, 110000,  5800),
    ('00000000-0000-4000-8000-000000000706'::uuid,  6, 130000,  7350),
    ('00000000-0000-4000-8000-000000000707'::uuid,  7, 150000,  8850),
    ('00000000-0000-4000-8000-000000000708'::uuid,  8, 170000, 10500),
    ('00000000-0000-4000-8000-000000000709'::uuid,  9, 190000, 12350),
    ('00000000-0000-4000-8000-000000000710'::uuid, 10, 210000, 14150)
), definition as (
  select level.*,
         jsonb_build_object(
           'type', 'points_in_time',
           'targetPoints', level.target_points,
           'activeTimeMs', level.duration_ms,
           'scoring', jsonb_build_object(
             'scanStepMs', 10,
             'counterDirectionBonus', 20,
             'counterDirectionGoalDistance', 24,
             'closeGoalieBonus', 15,
             'behindGoalieBonus', 30,
             'boardNarrowBonus', 10,
             'doubleMultiplier', 1.7,
             'tripleMultiplier', 1.8,
             'brackets', jsonb_build_array(
               jsonb_build_object('minWindowMs', 250, 'points', 100, 'code', 'open'),
               jsonb_build_object('minWindowMs', 160, 'points', 115, 'code', 'timed'),
               jsonb_build_object('minWindowMs', 100, 'points', 130, 'code', 'precise'),
               jsonb_build_object('minWindowMs', 70, 'points', 140, 'code', 'narrow'),
               jsonb_build_object('minWindowMs', 50, 'points', 155, 'code', 'very_narrow'),
               jsonb_build_object('minWindowMs', 0, 'points', 170, 'code', 'instant')
             )
           )
         ) as qualification_rules,
         jsonb_build_array(jsonb_build_object(
           'periodNumber', 1,
           'durationMs', level.duration_ms,
           'shotsLimit', null,
           'goalFrequency', 0.5,
           'goalieFrequency', 0.6,
           'shooterFrequency', 0.75,
           'puckSpeedPerMs', 1.25,
           'goaliePattern', 'linear',
           'goalieAmplitude', 1,
           'goalAmplitude', 220
         )) as period_rules
    from level
)
update bonus_game game
   set title = 'Меткость ' || definition.sort_order,
       description = 'Наберите ' || definition.target_points || ' очков за отведённое время.',
       sort_order = definition.sort_order,
       target_goals = definition.target_points,
       qualification_rules = definition.qualification_rules,
       period_rules = definition.period_rules,
       preview_title = 'Меткость ' || definition.sort_order,
       preview_story = 'Выбирайте сложные моменты, используйте противоход и собирайте быстрые серии.',
       revision = game.revision + 1
  from definition
 where game.id = definition.id;

with level(id, sort_order, duration_ms, target_points) as (
  values
    ('00000000-0000-4000-8000-000000000708'::uuid,  8, 170000, 10500),
    ('00000000-0000-4000-8000-000000000709'::uuid,  9, 190000, 12350),
    ('00000000-0000-4000-8000-000000000710'::uuid, 10, 210000, 14150)
)
insert into bonus_game
  (id, slug, title, skill_code, description, sort_order, status, access_type,
   unlock_price_stars, target_goals, qualification_rules, total_periods,
   break_duration_ms, period_rules, use_inventory,
   preview_title, preview_story, preview_artwork_url, preview_revision,
   reward_coins, reward_stars, reward_experience, arena_theme_id,
   goalkeeper_ready_url, goalkeeper_save_url, revision, created_by)
select level.id,
       'marksmanship-' || level.sort_order,
       'Меткость ' || level.sort_order,
       'marksmanship',
       'Наберите ' || level.target_points || ' очков за отведённое время.',
       level.sort_order,
       'active', 'free', 0, level.target_points,
       jsonb_build_object(
         'type', 'points_in_time',
         'targetPoints', level.target_points,
         'activeTimeMs', level.duration_ms,
         'scoring', jsonb_build_object(
           'scanStepMs', 10,
           'counterDirectionBonus', 20,
           'counterDirectionGoalDistance', 24,
           'closeGoalieBonus', 15,
           'behindGoalieBonus', 30,
           'boardNarrowBonus', 10,
           'doubleMultiplier', 1.7,
           'tripleMultiplier', 1.8,
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
       1, 0,
       jsonb_build_array(jsonb_build_object(
         'periodNumber', 1,
         'durationMs', level.duration_ms,
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
       'Меткость ' || level.sort_order,
       'Выбирайте сложные моменты, используйте противоход и собирайте быстрые серии.',
       '/sprites/amateur-daily-court.webp', 1,
       0, 1, 1,
       '00000000-0000-4000-8000-000000000700',
       '/sprites/training-goalie-amateur.webp',
       '/sprites/training-goalie-amateur-save.webp',
       1, null
  from level;
