-- V4 marksmanship: one visible technique, points stored in tenths for new attempts.
-- Existing attempt snapshots and shot rows are intentionally untouched.
with level(id, target_points) as (
  values
    ('00000000-0000-4000-8000-000000000701'::uuid, 111),
    ('00000000-0000-4000-8000-000000000702'::uuid, 191),
    ('00000000-0000-4000-8000-000000000703'::uuid, 285),
    ('00000000-0000-4000-8000-000000000704'::uuid, 383),
    ('00000000-0000-4000-8000-000000000705'::uuid, 492),
    ('00000000-0000-4000-8000-000000000706'::uuid, 622),
    ('00000000-0000-4000-8000-000000000707'::uuid, 754),
    ('00000000-0000-4000-8000-000000000708'::uuid, 883),
    ('00000000-0000-4000-8000-000000000709'::uuid, 1037),
    ('00000000-0000-4000-8000-000000000710'::uuid, 1193)
), definition as (
  select level.*,
         jsonb_build_object(
           'version', 4,
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
       description = 'Наберите нужное количество очков за отведённое время. За гол засчитывается один видимый приём.',
       preview_story = 'За гол начисляется один приём: простой, рядом с вратарём, у борта, противоход, меткий, за вратаря или суперметкий. От +1 до +2 очков. Серии и короткое окно не прибавляют очки.',
       preview_revision = game.preview_revision + 1,
       revision = game.revision + 1
  from definition
 where game.id = definition.id
   and game.skill_code = 'marksmanship';
