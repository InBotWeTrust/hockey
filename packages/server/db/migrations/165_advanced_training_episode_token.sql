alter table advanced_training_v2_run
  add column episode_token uuid not null default gen_random_uuid(),
  add column episode_started_at timestamptz;
