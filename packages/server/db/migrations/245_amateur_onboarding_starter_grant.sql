-- A permanent receipt survives onboarding resets and inventory consumption.
create table amateur_onboarding_starter_grant (
  user_id uuid primary key references users(id) on delete cascade,
  run_id uuid references onboarding_run(id) on delete set null,
  granted_at timestamptz,
  items jsonb not null default '[]'::jsonb
);

-- Do not retroactively give equipment to players who already completed the story.
insert into amateur_onboarding_starter_grant (user_id)
select id from users where amateur_onboarding_completed = true;
