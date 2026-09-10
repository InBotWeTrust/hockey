create table if not exists tournament_round_game_day (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references tournament_round(id) on delete cascade,
  day_number int not null check (day_number > 0),
  local_date date not null,
  first_game_local_time time without time zone not null,
  first_game_starts_at timestamptz not null,
  max_result_bearing_games int not null check (max_result_bearing_games between 1 and 127),
  readiness_duration interval not null
    check (readiness_duration between interval '1 minute' and interval '2 hours'),
  planned_start_interval interval not null
    check (planned_start_interval between interval '1 minute' and interval '24 hours'),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, day_number),
  unique (round_id, local_date)
);

create index if not exists tournament_round_game_day_round_local_date_idx
  on tournament_round_game_day (round_id, local_date);

create table if not exists tournament_fixture_attempt (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references tournament_fixture(id) on delete cascade,
  round_game_day_id uuid references tournament_round_game_day(id) on delete set null,
  attempt_number int not null check (attempt_number > 0),
  kind text not null check (kind in ('initial', 'replay')),
  status text not null default 'pending' check (status in (
      'pending', 'ready_check', 'active', 'settled', 'technical_result',
      'needs_reschedule', 'needs_admin_decision', 'cancelled'
    )),
  scheduled_starts_at timestamptz not null,
  readiness_expires_at timestamptz not null,
  hard_deadline_at timestamptz not null,
  amateur_duel_match_id uuid unique references amateur_duel_match(id) on delete set null,
  home_ready_at timestamptz,
  away_ready_at timestamptz,
  is_result_bearing boolean not null,
  winner_participant_id uuid references tournament_participant(id) on delete restrict,
  outcome text check (outcome in (
    'home_win', 'away_win', 'replay', 'home_no_show', 'away_no_show',
    'both_no_show', 'both_incomplete', 'cancelled'
  )),
  home_score int check (home_score is null or home_score >= 0),
  away_score int check (away_score is null or away_score >= 0),
  home_accuracy numeric(8, 5) check (home_accuracy is null or home_accuracy between 0 and 100),
  away_accuracy numeric(8, 5) check (away_accuracy is null or away_accuracy between 0 and 100),
  home_active_time_ms bigint check (home_active_time_ms is null or home_active_time_ms >= 0),
  away_active_time_ms bigint check (away_active_time_ms is null or away_active_time_ms >= 0),
  result_snapshot jsonb check (result_snapshot is null or jsonb_typeof(result_snapshot) = 'object'),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, attempt_number),
  check (scheduled_starts_at < readiness_expires_at),
  check (readiness_expires_at <= hard_deadline_at),
  check ((kind = 'initial' and is_result_bearing) or (kind = 'replay' and not is_result_bearing))
);

create unique index if not exists tournament_fixture_attempt_one_open_idx
  on tournament_fixture_attempt (fixture_id)
  where status in ('pending', 'ready_check', 'active', 'needs_reschedule', 'needs_admin_decision');

create index if not exists tournament_fixture_attempt_schedule_idx
  on tournament_fixture_attempt (status, scheduled_starts_at);

create index if not exists tournament_fixture_attempt_deadline_idx
  on tournament_fixture_attempt (status, readiness_expires_at, hard_deadline_at);

create index if not exists tournament_fixture_attempt_round_game_day_idx
  on tournament_fixture_attempt (round_game_day_id, status, scheduled_starts_at)
  where round_game_day_id is not null;

create table if not exists tournament_next_game_choice (
  id uuid primary key default gen_random_uuid(),
  fixture_attempt_id uuid not null references tournament_fixture_attempt(id) on delete cascade,
  participant_id uuid not null references tournament_participant(id) on delete cascade,
  next_fixture_id uuid not null references tournament_fixture(id) on delete cascade,
  choice text not null check (choice in ('immediate', 'scheduled')),
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_attempt_id, participant_id),
  check (expires_at > created_at),
  check (decided_at is null or decided_at >= created_at)
);

create index if not exists tournament_next_game_choice_next_fixture_idx
  on tournament_next_game_choice (next_fixture_id, expires_at);

create table if not exists tournament_incident (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  series_id uuid references tournament_playoff_series(id) on delete cascade,
  fixture_id uuid not null references tournament_fixture(id) on delete cascade,
  fixture_attempt_id uuid not null references tournament_fixture_attempt(id) on delete cascade,
  kind text not null check (kind in ('both_no_show', 'both_incomplete', 'regular_replay_readiness_unresolved')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (resolved_at is not null)),
  check (resolved_at is null or resolved_at >= opened_at)
);

create unique index if not exists tournament_incident_one_open_attempt_kind_idx
  on tournament_incident (fixture_attempt_id, kind)
  where status = 'open';

create index if not exists tournament_incident_series_status_idx
  on tournament_incident (series_id, status, opened_at)
  where series_id is not null;

create table if not exists tournament_series_admin_decision (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references tournament_playoff_series(id) on delete cascade,
  winner_participant_id uuid not null references tournament_participant(id) on delete restrict,
  reason text not null check (btrim(reason) <> ''),
  requested_by uuid not null references users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  confirmed_by uuid references users(id) on delete restrict,
  confirmed_at timestamptz,
  factual_score_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(factual_score_snapshot) = 'object'),
  idempotency_key text not null unique check (btrim(idempotency_key) <> ''),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'confirmed' and confirmed_by is not null and confirmed_at is not null)
    or (status <> 'confirmed' and confirmed_by is null and confirmed_at is null)
  ),
  check (confirmed_at is null or confirmed_at >= requested_at),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create unique index if not exists tournament_series_admin_decision_one_confirmed_idx
  on tournament_series_admin_decision (series_id)
  where status = 'confirmed';

create index if not exists tournament_series_admin_decision_series_status_idx
  on tournament_series_admin_decision (series_id, status, requested_at);
