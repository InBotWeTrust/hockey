alter table users
  add column beginner_onboarding_completed boolean not null default false,
  add column amateur_onboarding_completed boolean not null default false,
  add column beginner_onboarding_reset_at timestamptz,
  add column amateur_onboarding_reset_at timestamptz;

update users
   set beginner_onboarding_completed = true,
       amateur_onboarding_completed = true;

create table onboarding_chain (
  key text primary key check (key in ('beginner', 'amateur')),
  current_published_version_id uuid,
  enforcement_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table onboarding_version (
  id uuid primary key default gen_random_uuid(),
  chain_key text not null references onboarding_chain(key) on delete restrict,
  status text not null check (status in ('draft', 'published')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table onboarding_chain
  add constraint onboarding_chain_published_version_fkey
  foreign key (current_published_version_id) references onboarding_version(id) on delete restrict;

create unique index onboarding_version_one_draft_idx
  on onboarding_version (chain_key) where status = 'draft';

create table onboarding_step (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references onboarding_version(id) on delete cascade,
  position int not null check (position between 1 and 100),
  kind text not null check (kind in ('informational', 'tutorial_shot')),
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null check (length(trim(description)) between 1 and 1000),
  cta_label text not null check (length(trim(cta_label)) between 1 and 40),
  media_object_id uuid references media_objects(id) on delete restrict,
  tutorial_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_id, position),
  check (
    (kind = 'informational' and media_object_id is not null and tutorial_config is null)
    or (
      kind = 'tutorial_shot'
      and media_object_id is null
      and tutorial_config is not null
      and jsonb_typeof(tutorial_config) = 'object'
    )
  )
);

create table onboarding_run (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  chain_key text not null references onboarding_chain(key) on delete restrict,
  version_id uuid not null references onboarding_version(id) on delete restrict,
  client_session_id uuid not null,
  source text not null check (source in ('natural', 'admin_reset', 'preview')),
  tutorial_state jsonb check (tutorial_state is null or jsonb_typeof(tutorial_state) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, chain_key, version_id, client_session_id)
);

create index onboarding_run_user_started_idx
  on onboarding_run (user_id, started_at desc);

create index onboarding_run_chain_started_idx
  on onboarding_run (chain_key, started_at desc);

create table onboarding_event (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references onboarding_run(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  chain_key text not null references onboarding_chain(key) on delete restrict,
  version_id uuid not null references onboarding_version(id) on delete restrict,
  step_id uuid references onboarding_step(id) on delete restrict,
  kind text not null check (kind in ('step_viewed', 'tutorial_attempt', 'tutorial_goal', 'completed')),
  result text check (result is null or result in ('goal', 'save', 'miss')),
  attempt_number int not null default 0 check (attempt_number >= 0),
  created_at timestamptz not null default now(),
  check (
    (kind in ('step_viewed', 'tutorial_attempt', 'tutorial_goal') and step_id is not null)
    or (kind = 'completed' and step_id is null)
  )
);

create index onboarding_event_version_created_idx
  on onboarding_event (version_id, created_at desc);

create index onboarding_event_chain_created_idx
  on onboarding_event (chain_key, created_at desc);

create unique index onboarding_event_step_viewed_once_idx
  on onboarding_event (run_id, step_id)
  where kind = 'step_viewed';

create unique index onboarding_event_tutorial_goal_once_idx
  on onboarding_event (run_id)
  where kind = 'tutorial_goal';

create unique index onboarding_event_completed_once_idx
  on onboarding_event (run_id)
  where kind = 'completed';

alter table media_objects
  drop constraint if exists media_objects_purpose_check,
  add constraint media_objects_purpose_check
    check (purpose in (
      'chat_attachment',
      'profile_avatar',
      'chat_avatar',
      'bonus_game_media',
      'onboarding_image'
    ));

insert into onboarding_chain (key, enforcement_enabled)
values ('beginner', false), ('amateur', false)
on conflict (key) do nothing;
