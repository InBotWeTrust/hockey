-- Apply the approved goals, shot limits, and uniform movement to the 13-city accuracy tour.
-- Existing attempts keep their rules_snapshot; only newly created attempts use this revision.

do $$
declare
  matched_games int;
  updated_games int;
begin
  perform pg_advisory_xact_lock(1111969093, 1);

  select count(*)::int
    into matched_games
    from bonus_game game
    join (
      values
        ('00000000-0000-4000-8000-000000000611'::uuid, 'accuracy-moscow', 18, 30),
        ('00000000-0000-4000-8000-000000000612'::uuid, 'accuracy-istanbul', 21, 30),
        ('00000000-0000-4000-8000-000000000613'::uuid, 'accuracy-rome', 23, 30),
        ('00000000-0000-4000-8000-000000000614'::uuid, 'accuracy-paris', 30, 45),
        ('00000000-0000-4000-8000-000000000615'::uuid, 'accuracy-london', 36, 50),
        ('00000000-0000-4000-8000-000000000616'::uuid, 'accuracy-new-york', 40, 50),
        ('00000000-0000-4000-8000-000000000617'::uuid, 'accuracy-rio-de-janeiro', 42, 50),
        ('00000000-0000-4000-8000-000000000618'::uuid, 'accuracy-cape-town', 47, 55),
        ('00000000-0000-4000-8000-000000000619'::uuid, 'accuracy-dubai', 49, 60),
        ('00000000-0000-4000-8000-000000000620'::uuid, 'accuracy-mumbai', 52, 60),
        ('00000000-0000-4000-8000-000000000621'::uuid, 'accuracy-singapore', 66, 80),
        ('00000000-0000-4000-8000-000000000622'::uuid, 'accuracy-beijing', 76, 90),
        ('00000000-0000-4000-8000-000000000623'::uuid, 'accuracy-tokyo', 90, 90)
    ) expected(id, slug, target_goals, shots_limit)
      on expected.id = game.id and expected.slug = game.slug
   where game.skill_code = 'accuracy'
     and jsonb_array_length(game.period_rules) > 0
     and jsonb_typeof(game.qualification_rules) = 'object';

  if matched_games <> 13 then
    raise exception 'Expected 13 complete accuracy games for migration 085, found %',
      matched_games;
  end if;

  update bonus_game game
     set target_goals = desired.target_goals,
         qualification_rules = jsonb_set(
           jsonb_set(
             game.qualification_rules,
             '{targetGoals}',
             to_jsonb(desired.target_goals)
           ),
           '{shotsLimit}',
           to_jsonb(desired.shots_limit)
         ),
         total_periods = 1,
         break_duration_ms = 0,
         period_rules = jsonb_build_array(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       game.period_rules->0,
                       '{periodNumber}',
                       '1'::jsonb
                     ),
                     '{shotsLimit}',
                     to_jsonb(desired.shots_limit)
                   ),
                   '{goalFrequency}',
                   '0.5'::jsonb
                 ),
                 '{goalieFrequency}',
                 '0.6'::jsonb
               ),
               '{shooterFrequency}',
               '0.75'::jsonb
             ),
             '{puckSpeedPerMs}',
             '1.25'::jsonb
           )
         ),
         revision = game.revision + 1,
         updated_at = now()
    from (
      values
        ('00000000-0000-4000-8000-000000000611'::uuid, 18, 30),
        ('00000000-0000-4000-8000-000000000612'::uuid, 21, 30),
        ('00000000-0000-4000-8000-000000000613'::uuid, 23, 30),
        ('00000000-0000-4000-8000-000000000614'::uuid, 30, 45),
        ('00000000-0000-4000-8000-000000000615'::uuid, 36, 50),
        ('00000000-0000-4000-8000-000000000616'::uuid, 40, 50),
        ('00000000-0000-4000-8000-000000000617'::uuid, 42, 50),
        ('00000000-0000-4000-8000-000000000618'::uuid, 47, 55),
        ('00000000-0000-4000-8000-000000000619'::uuid, 49, 60),
        ('00000000-0000-4000-8000-000000000620'::uuid, 52, 60),
        ('00000000-0000-4000-8000-000000000621'::uuid, 66, 80),
        ('00000000-0000-4000-8000-000000000622'::uuid, 76, 90),
        ('00000000-0000-4000-8000-000000000623'::uuid, 90, 90)
    ) desired(id, target_goals, shots_limit)
   where game.id = desired.id
     and game.skill_code = 'accuracy';

  get diagnostics updated_games = row_count;
  if updated_games <> 13 then
    raise exception 'Expected to update 13 accuracy games for migration 085, updated %',
      updated_games;
  end if;
end
$$;
