-- V3 marksmanship: one 1-4 point category per goal. Existing attempt snapshots stay unchanged.
with level(id, target_points) as (
  values
    ('00000000-0000-4000-8000-000000000701'::uuid, 25),
    ('00000000-0000-4000-8000-000000000702'::uuid, 43),
    ('00000000-0000-4000-8000-000000000703'::uuid, 65),
    ('00000000-0000-4000-8000-000000000704'::uuid, 88),
    ('00000000-0000-4000-8000-000000000705'::uuid, 113),
    ('00000000-0000-4000-8000-000000000706'::uuid, 142),
    ('00000000-0000-4000-8000-000000000707'::uuid, 170),
    ('00000000-0000-4000-8000-000000000708'::uuid, 201),
    ('00000000-0000-4000-8000-000000000709'::uuid, 237),
    ('00000000-0000-4000-8000-000000000710'::uuid, 272)
), definition as (
  select level.*,
         jsonb_build_object(
           'version', 3,
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
       description = 'Наберите ' || definition.target_points ||
         ' очков за отведённое время. Каждый гол даёт от 1 до 4 очков за самый сложный признак момента.',
       preview_story = 'Каждый гол даёт 1–4 очка. Чем короче время, когда бросок мог стать голевым, тем выше оценка. Борт и положение вратаря могут её повысить, но очки за признаки не складываются.',
       revision = game.revision + 1
  from definition
 where game.id = definition.id
   and game.skill_code = 'marksmanship';
