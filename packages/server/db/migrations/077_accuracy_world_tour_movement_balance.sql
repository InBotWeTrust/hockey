-- Normalize the 13-city accuracy World Tour to one period and city-tier movement speeds.
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
        ('00000000-0000-4000-8000-000000000611'::uuid),
        ('00000000-0000-4000-8000-000000000612'::uuid),
        ('00000000-0000-4000-8000-000000000613'::uuid),
        ('00000000-0000-4000-8000-000000000614'::uuid),
        ('00000000-0000-4000-8000-000000000615'::uuid),
        ('00000000-0000-4000-8000-000000000616'::uuid),
        ('00000000-0000-4000-8000-000000000617'::uuid),
        ('00000000-0000-4000-8000-000000000618'::uuid),
        ('00000000-0000-4000-8000-000000000619'::uuid),
        ('00000000-0000-4000-8000-000000000620'::uuid),
        ('00000000-0000-4000-8000-000000000621'::uuid),
        ('00000000-0000-4000-8000-000000000622'::uuid),
        ('00000000-0000-4000-8000-000000000623'::uuid)
    ) expected(id) on expected.id = game.id
   where game.skill_code = 'accuracy'
     and jsonb_array_length(game.period_rules) > 0
     and jsonb_typeof(game.qualification_rules->'shotsLimit') = 'number';

  if matched_games <> 13 then
    raise exception 'Expected 13 complete accuracy games for migration 077, found %',
      matched_games;
  end if;

  update bonus_game game
     set total_periods = 1,
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
                     to_jsonb((game.qualification_rules->>'shotsLimit')::int)
                   ),
                   '{goalFrequency}',
                   to_jsonb(desired.goal_frequency)
                 ),
                 '{goalieFrequency}',
                 to_jsonb(desired.goalie_frequency)
               ),
               '{shooterFrequency}',
               to_jsonb(desired.shooter_frequency)
             ),
             '{puckSpeedPerMs}',
             '1.25'::jsonb
           )
         ),
         revision = game.revision + 1,
         updated_at = now()
    from (
      values
        ('00000000-0000-4000-8000-000000000611'::uuid, 0.50, 0.60, 0.75),
        ('00000000-0000-4000-8000-000000000612'::uuid, 0.50, 0.60, 0.75),
        ('00000000-0000-4000-8000-000000000613'::uuid, 0.50, 0.60, 0.75),
        ('00000000-0000-4000-8000-000000000614'::uuid, 0.50, 0.60, 0.75),
        ('00000000-0000-4000-8000-000000000615'::uuid, 0.60, 0.70, 0.85),
        ('00000000-0000-4000-8000-000000000616'::uuid, 0.60, 0.70, 0.85),
        ('00000000-0000-4000-8000-000000000617'::uuid, 0.60, 0.70, 0.85),
        ('00000000-0000-4000-8000-000000000618'::uuid, 0.65, 0.75, 0.90),
        ('00000000-0000-4000-8000-000000000619'::uuid, 0.65, 0.75, 0.90),
        ('00000000-0000-4000-8000-000000000620'::uuid, 0.65, 0.75, 0.90),
        ('00000000-0000-4000-8000-000000000621'::uuid, 0.65, 0.75, 0.90),
        ('00000000-0000-4000-8000-000000000622'::uuid, 0.75, 0.85, 1.00),
        ('00000000-0000-4000-8000-000000000623'::uuid, 0.75, 0.85, 1.00)
    ) desired(id, goal_frequency, goalie_frequency, shooter_frequency)
   where game.id = desired.id
     and game.skill_code = 'accuracy';

  get diagnostics updated_games = row_count;
  if updated_games <> 13 then
    raise exception 'Expected to update 13 accuracy games for migration 077, updated %',
      updated_games;
  end if;
end
$$;
