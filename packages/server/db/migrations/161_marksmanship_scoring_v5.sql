-- New marksmanship attempts use V5. Existing attempt snapshots and shots are untouched.
with level(id, target_points) as (
  values
    ('00000000-0000-4000-8000-000000000701'::uuid, 90),
    ('00000000-0000-4000-8000-000000000702'::uuid, 170),
    ('00000000-0000-4000-8000-000000000703'::uuid, 250),
    ('00000000-0000-4000-8000-000000000704'::uuid, 340),
    ('00000000-0000-4000-8000-000000000705'::uuid, 440),
    ('00000000-0000-4000-8000-000000000706'::uuid, 550),
    ('00000000-0000-4000-8000-000000000707'::uuid, 670),
    ('00000000-0000-4000-8000-000000000708'::uuid, 790),
    ('00000000-0000-4000-8000-000000000709'::uuid, 930),
    ('00000000-0000-4000-8000-000000000710'::uuid, 1070)
), definition as (
  select level.*,
         jsonb_build_object(
           'version', 5,
           'scanStepMs', 10,
           'counterDirectionBonus', 0,
           'counterDirectionGoalDistance', 24,
           'closeGoalieBonus', 0,
           'behindGoalieBonus', 0,
           'boardNarrowBonus', 0,
           'doubleMultiplier', 1,
           'tripleMultiplier', 1,
           'brackets', jsonb_build_array(
             jsonb_build_object('minWindowMs', 160, 'points', 1, 'code', 'open'),
             jsonb_build_object('minWindowMs', 100, 'points', 2, 'code', 'precise'),
             jsonb_build_object('minWindowMs', 70, 'points', 3, 'code', 'narrow'),
             jsonb_build_object('minWindowMs', 0, 'points', 4, 'code', 'instant')
           )
         ) as scoring
    from level
)
update bonus_game as game
   set target_goals = definition.target_points,
       qualification_rules = jsonb_set(
         jsonb_set(game.qualification_rules, '{targetPoints}', to_jsonb(definition.target_points)),
         '{scoring}', definition.scoring
       ),
       description = 'Наберите нужное количество очков за отведённое время. Каждый гол оценивается по одному приёму.',
       preview_story = 'Восемь приёмов: простой, рядом с вратарём, противоход, меткий, за вратаря, сложный в углу, на грани и суперметкий. За гол от +1 до +2 очков; серии и короткое окно очки не добавляют.',
       preview_revision = game.preview_revision + 1,
       revision = game.revision + 1
  from definition
 where game.id = definition.id
   and game.skill_code = 'marksmanship'
   and game.qualification_rules #>> '{scoring,version}' = '4';
