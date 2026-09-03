-- Rebalance the launch speed catalogue against the first daily-period movement preset.
-- Existing attempts keep their rules_snapshot; only newly created attempts use this revision.

do $$
declare
  matched_games int;
  updated_games int;
begin
  -- Same transaction-scoped exclusive lock used by bonus-game admin mutations.
  perform pg_advisory_xact_lock(1111969093, 1);

  select count(*)::int
    into matched_games
    from bonus_game game
    join (
      values
        ('00000000-0000-4000-8000-000000000601'::uuid),
        ('00000000-0000-4000-8000-000000000602'::uuid),
        ('00000000-0000-4000-8000-000000000603'::uuid),
        ('00000000-0000-4000-8000-000000000604'::uuid),
        ('00000000-0000-4000-8000-000000000605'::uuid),
        ('00000000-0000-4000-8000-000000000606'::uuid),
        ('00000000-0000-4000-8000-000000000607'::uuid),
        ('00000000-0000-4000-8000-000000000608'::uuid),
        ('00000000-0000-4000-8000-000000000609'::uuid),
        ('00000000-0000-4000-8000-000000000610'::uuid)
    ) expected(id) on expected.id = game.id
   where game.skill_code = 'speed';

  if matched_games <> 10 then
    raise exception 'Expected 10 speed bonus games for migration 076, found %', matched_games;
  end if;

  update bonus_game game
   set target_goals = desired.target_goals,
       qualification_rules = jsonb_build_object(
         'type', 'goals_in_time',
         'targetGoals', desired.target_goals,
         'activeTimeMs', desired.duration_ms
       ),
       total_periods = 1,
       break_duration_ms = 0,
       period_rules = jsonb_build_array(jsonb_build_object(
         'periodNumber', 1,
         'durationMs', desired.duration_ms,
         'shotsLimit', null,
         'goalFrequency', 0.50,
         'goalieFrequency', 0.60,
         'shooterFrequency', 0.75,
         'puckSpeedPerMs', 1.25,
         'goaliePattern', 'linear',
         'goalieAmplitude', 1,
         'goalAmplitude', 220
       )),
       revision = game.revision + 1,
       updated_at = now()
  from (
    values
      ('00000000-0000-4000-8000-000000000601'::uuid, 18, 100000),
      ('00000000-0000-4000-8000-000000000602'::uuid, 21, 100000),
      ('00000000-0000-4000-8000-000000000603'::uuid, 30, 120000),
      ('00000000-0000-4000-8000-000000000604'::uuid, 36, 120000),
      ('00000000-0000-4000-8000-000000000605'::uuid, 38, 130000),
      ('00000000-0000-4000-8000-000000000606'::uuid, 40, 150000),
      ('00000000-0000-4000-8000-000000000607'::uuid, 47, 165000),
      ('00000000-0000-4000-8000-000000000608'::uuid, 49, 165000),
      ('00000000-0000-4000-8000-000000000609'::uuid, 52, 170000),
      ('00000000-0000-4000-8000-000000000610'::uuid, 60, 180000)
  ) desired(id, target_goals, duration_ms)
 where game.id = desired.id
   and game.skill_code = 'speed';

  get diagnostics updated_games = row_count;
  if updated_games <> 10 then
    raise exception 'Expected to update 10 speed bonus games for migration 076, updated %',
      updated_games;
  end if;
end
$$;
