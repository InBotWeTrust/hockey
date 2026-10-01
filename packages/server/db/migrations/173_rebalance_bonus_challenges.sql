-- Give every challenge a permanent environment effect. Existing attempt snapshots stay immutable.

with balance(slug, environment) as (
  values
    ('challenge-beach', '{"baseModifiers":{"goalMultiplier":1,"goalieMultiplier":1,"shooterMultiplier":0.90,"puckSpeedMultiplier":0.90,"label":"Лёд тает · игрок −10% · шайба −10%"},"fatigue":{"slowdownStartMs":8000,"heavyStartMs":18000,"stopStartMs":30000,"stopDurationMs":4000,"recoveryDurationMs":8000,"slowMultiplier":0.85,"heavyMultiplier":0.65}}'::jsonb),
    ('challenge-ski-resort', '{"baseModifiers":{"goalMultiplier":1.10,"goalieMultiplier":1.10,"shooterMultiplier":1.20,"puckSpeedMultiplier":1.15,"label":"Идеальное скольжение · игрок +20% · шайба +15%"}}'::jsonb),
    ('challenge-cyberpunk-yard', '{"baseModifiers":{"goalMultiplier":1.20,"goalieMultiplier":1.40,"shooterMultiplier":1.10,"puckSpeedMultiplier":1.05,"label":"Неоновый разгон · ворота +20% · вратарь +40%"}}'::jsonb),
    ('challenge-abandoned-waterpark', '{"baseModifiers":{"goalMultiplier":0.95,"goalieMultiplier":0.95,"shooterMultiplier":0.90,"puckSpeedMultiplier":0.90,"label":"Мокрый лёд · движение и шайба замедлены"},"stumbleWindows":[{"startMs":55000,"durationMs":650},{"startMs":125000,"durationMs":650}]}'::jsonb),
    ('challenge-pirate-bay', '{"baseModifiers":{"goalMultiplier":1.10,"goalieMultiplier":1.08,"shooterMultiplier":1,"puckSpeedMultiplier":1,"label":"Штормовая качка · скорость меняется каждые 20 секунд"},"speedPhases":[{"durationMs":20000,"shooterMultiplier":0.85,"puckSpeedMultiplier":0.90},{"durationMs":20000,"shooterMultiplier":1.20,"puckSpeedMultiplier":1.15}]}'::jsonb),
    ('challenge-north-pole', '{"baseModifiers":{"goalMultiplier":1.15,"goalieMultiplier":1.10,"shooterMultiplier":1.20,"puckSpeedMultiplier":1.15,"label":"Идеальный лёд · игрок +20% · шайба +15%"},"fatigue":{"slowdownStartMs":50000,"heavyStartMs":65000,"stopStartMs":75000,"stopDurationMs":4000,"recoveryDurationMs":12000,"slowMultiplier":0.85,"heavyMultiplier":0.65}}'::jsonb),
    ('challenge-desert', '{"baseModifiers":{"goalMultiplier":0.90,"goalieMultiplier":0.90,"shooterMultiplier":0.82,"puckSpeedMultiplier":0.85,"label":"Песок на льду · игрок −18% · шайба −15%"},"fatigue":{"slowdownStartMs":6000,"heavyStartMs":14000,"stopStartMs":24000,"stopDurationMs":5000,"recoveryDurationMs":6000,"slowMultiplier":0.85,"heavyMultiplier":0.65}}'::jsonb),
    ('challenge-volcanic-ice', '{"baseModifiers":{"goalMultiplier":1.10,"goalieMultiplier":1.15,"shooterMultiplier":1,"puckSpeedMultiplier":1,"label":"Лёд нестабилен · скорость меняется вместе с жаром"},"speedPhases":[{"durationMs":25000,"shooterMultiplier":1.15,"puckSpeedMultiplier":1.10},{"durationMs":25000,"shooterMultiplier":0.75,"puckSpeedMultiplier":0.85},{"durationMs":25000,"shooterMultiplier":1.30,"puckSpeedMultiplier":1.20}],"stumbleWindows":[{"startMs":118000,"durationMs":650}]}'::jsonb),
    ('challenge-castle', '{"baseModifiers":{"goalMultiplier":0.90,"goalieMultiplier":0.95,"shooterMultiplier":0.80,"puckSpeedMultiplier":0.88,"label":"Тяжёлые доспехи · игрок −20% · шайба −12%"}}'::jsonb),
    ('challenge-space', '{"baseModifiers":{"goalMultiplier":0.65,"goalieMultiplier":0.63,"shooterMultiplier":0.60,"puckSpeedMultiplier":0.62,"label":"Невесомость · всё движется значительно медленнее"}}'::jsonb)
)
update bonus_game game
   set challenge_environment = balance.environment,
       period_rules = jsonb_set(
         game.period_rules,
         '{0}',
         (game.period_rules->0) || jsonb_build_object(
           'goalFrequency', 0.50,
           'goalieFrequency', 0.60,
           'shooterFrequency', 0.75,
           'puckSpeedPerMs', 1.25
         )
       ),
       revision = game.revision + 1,
       updated_at = now()
  from balance
 where game.slug = balance.slug
   and game.skill_code = 'challenge';
