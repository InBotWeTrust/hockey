-- Ease only future bonus-game definitions. Existing attempt rule snapshots stay unchanged.
with targets(level, target_points) as (
  values
    (1, 80), (2, 140), (3, 220), (4, 300), (5, 400),
    (6, 500), (7, 610), (8, 730), (9, 870), (10, 1010)
)
update bonus_game as game
   set target_goals = targets.target_points,
       qualification_rules = jsonb_set(
         game.qualification_rules, '{targetPoints}', to_jsonb(targets.target_points)
       ),
       revision = game.revision + 1
  from targets
 where game.slug = 'marksmanship-' || targets.level
   and game.skill_code = 'marksmanship'
   and game.qualification_rules #>> '{scoring,version}' = '6';

with windows(level, window_ms) as (
  values
    (1, 12000), (2, 10000), (3, 8000), (4, 7000),
    (5, 6000), (6, 5000), (7, 4000)
)
update bonus_game as game
   set qualification_rules = jsonb_set(
         game.qualification_rules, '{goalWindowMs}', to_jsonb(windows.window_ms)
       ),
       revision = game.revision + 1
  from windows
 where game.slug = 'endurance-' || windows.level
   and game.skill_code = 'endurance'
   and game.qualification_rules ->> 'type' = 'survive_goal_windows';
