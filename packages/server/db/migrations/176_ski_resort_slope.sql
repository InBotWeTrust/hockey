-- New catalog rules only. Historical attempt snapshots, IDs, progress and rewards stay intact.
update bonus_game set
  challenge_environment = '{"ski":{"version":1,"seed":"","durationMs":180000}}'::jsonb,
  period_rules = jsonb_set(period_rules, '{0}', (period_rules->0) ||
    '{"durationMs":180000,"shotsLimit":35,"goaliePattern":"linear"}'::jsonb),
  preview_story = 'На курорте разыгрался снегопад, а с горы надвигается лавина. Успей забить 26 шайб за 3 минуты, пока каток не засыпало.',
  preview_revision = preview_revision + 1,
  revision = revision + 1,
  updated_at = now()
where slug = 'challenge-ski-resort' and skill_code = 'challenge';
