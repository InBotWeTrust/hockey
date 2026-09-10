create table if not exists tournament_classic_period_loadout (
  session_id uuid not null references tournament_classic_session(id) on delete cascade,
  period_number smallint not null check (period_number between 1 and 3),
  selection jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{"items":[]}'::jsonb,
  consumption jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, period_number),
  check (jsonb_typeof(selection) = 'object'),
  check (jsonb_typeof(snapshot) = 'object'),
  check (jsonb_typeof(consumption) = 'array')
);

comment on table tournament_classic_period_loadout is
  'Immutable classic tournament inventory selection and its actual per-period consumption.';
