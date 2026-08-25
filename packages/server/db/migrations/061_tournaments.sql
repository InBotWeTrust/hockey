create table tournament (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  status text not null default 'draft'
    check (status in (
      'draft', 'registration', 'registration_blocked', 'scheduling', 'regular',
      'playoff', 'paused', 'completed', 'cancelled', 'archived'
    )),
  regular_source text not null check (regular_source in ('head_to_head', 'daily_aggregate')),
  visibility text not null default 'public' check (visibility in ('public', 'hidden')),
  current_revision int not null default 0 check (current_revision >= 0),
  published_revision_id uuid,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references users(id) on delete restrict,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (registration_closes_at is null or registration_opens_at is null or registration_opens_at < registration_closes_at)
);

create table tournament_revision (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  revision int not null check (revision > 0),
  rules_snapshot jsonb not null,
  is_published boolean not null default false,
  created_by uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (tournament_id, revision),
  check (jsonb_typeof(rules_snapshot) = 'object'),
  check (not is_published or published_at is not null)
);

alter table tournament
  add constraint tournament_published_revision_id_fkey
  foreign key (published_revision_id) references tournament_revision(id) on delete restrict;

create unique index tournament_one_published_revision_idx
  on tournament_revision (tournament_id) where is_published;

create table tournament_participant (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  state text not null check (state in (
    'invited', 'applied', 'approved', 'rejected', 'declined', 'withdrawn',
    'removed', 'disqualified'
  )),
  seed int check (seed is null or seed > 0),
  entry_fee_coins int not null default 0 check (entry_fee_coins >= 0),
  entry_fee_state text not null default 'not_required'
    check (entry_fee_state in ('not_required', 'pending', 'paid', 'refunded')),
  invited_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  joined_at timestamptz,
  withdrawn_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, user_id),
  unique (tournament_id, seed)
);

create index tournament_participant_state_idx
  on tournament_participant (tournament_id, state, created_at);

create table tournament_matchday (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  number int not null check (number > 0),
  local_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'open', 'closed', 'cancelled')),
  unique (tournament_id, number),
  check (starts_at < ends_at)
);

create table tournament_round (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  matchday_id uuid references tournament_matchday(id) on delete cascade,
  stage text not null check (stage in ('regular', 'tiebreak', 'playoff', 'third_place')),
  number int not null check (number > 0),
  cycle_number int check (cycle_number is null or cycle_number > 0),
  name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'open', 'settled', 'cancelled', 'paused')),
  rules_snapshot jsonb not null default '{}'::jsonb,
  unique (tournament_id, stage, number),
  check (ends_at is null or starts_at is null or starts_at < ends_at)
);

create table tournament_playoff_series (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  round_id uuid not null references tournament_round(id) on delete cascade,
  bracket_position int not null check (bracket_position > 0),
  kind text not null default 'championship' check (kind in ('championship', 'third_place')),
  higher_seed_participant_id uuid references tournament_participant(id) on delete restrict,
  lower_seed_participant_id uuid references tournament_participant(id) on delete restrict,
  winner_participant_id uuid references tournament_participant(id) on delete restrict,
  wins_required int not null check (wins_required > 0),
  higher_seed_wins int not null default 0 check (higher_seed_wins >= 0),
  lower_seed_wins int not null default 0 check (lower_seed_wins >= 0),
  home_sequence jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'active', 'completed', 'paused', 'cancelled')),
  depends_on jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, bracket_position, kind),
  check (jsonb_typeof(home_sequence) = 'array')
);

create table tournament_fixture (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  round_id uuid references tournament_round(id) on delete cascade,
  series_id uuid references tournament_playoff_series(id) on delete cascade,
  fixture_number int not null check (fixture_number > 0),
  home_participant_id uuid references tournament_participant(id) on delete restrict,
  away_participant_id uuid references tournament_participant(id) on delete restrict,
  scheduled_starts_at timestamptz,
  window_ends_at timestamptz,
  status text not null default 'conditional'
    check (status in (
      'conditional', 'scheduled', 'open', 'active', 'settled', 'forfeit',
      'cancelled', 'paused'
    )),
  winner_participant_id uuid references tournament_participant(id) on delete restrict,
  outcome text check (outcome in ('home_win', 'away_win', 'draw', 'double_forfeit')),
  home_score int not null default 0 check (home_score >= 0),
  away_score int not null default 0 check (away_score >= 0),
  result_snapshot jsonb,
  rescheduled_reason text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, fixture_number),
  check (home_participant_id is null or away_participant_id is null or home_participant_id <> away_participant_id),
  check (window_ends_at is null or scheduled_starts_at is null or scheduled_starts_at < window_ends_at)
);

create index tournament_fixture_schedule_idx
  on tournament_fixture (tournament_id, scheduled_starts_at, status);

create table tournament_fixture_segment (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references tournament_fixture(id) on delete cascade,
  sequence_number int not null check (sequence_number > 0),
  kind text not null check (kind in (
    'regulation', 'overtime', 'shootout_initial', 'shootout_sudden_death'
  )),
  duel_match_id uuid unique references amateur_duel_match(id) on delete set null,
  pair_number int check (pair_number is null or pair_number > 0),
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'active', 'settled', 'cancelled')),
  home_score int not null default 0 check (home_score >= 0),
  away_score int not null default 0 check (away_score >= 0),
  rules_snapshot jsonb not null,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (fixture_id, sequence_number)
);

create table tournament_daily_result (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  participant_id uuid not null references tournament_participant(id) on delete cascade,
  tournament_day int not null check (tournament_day > 0),
  player_local_date date not null,
  goals int not null default 0 check (goals >= 0),
  shots int not null default 0 check (shots >= 0),
  accuracy numeric(8,5) not null default 0 check (accuracy between 0 and 1),
  place int check (place is null or place > 0),
  place_points numeric(12,4) not null default 0,
  completed boolean not null default false,
  source_snapshot jsonb not null default '{}'::jsonb,
  finalized_at timestamptz not null,
  unique (tournament_id, participant_id, tournament_day)
);

create table tournament_standing (
  tournament_id uuid not null references tournament(id) on delete cascade,
  participant_id uuid not null references tournament_participant(id) on delete cascade,
  rank int check (rank is null or rank > 0),
  played int not null default 0 check (played >= 0),
  wins int not null default 0 check (wins >= 0),
  losses int not null default 0 check (losses >= 0),
  draws int not null default 0 check (draws >= 0),
  goals_for int not null default 0 check (goals_for >= 0),
  goals_against int not null default 0 check (goals_against >= 0),
  points numeric(14,4) not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  tie_key jsonb not null default '[]'::jsonb,
  source_version bigint not null default 0,
  recalculated_at timestamptz not null default now(),
  primary key (tournament_id, participant_id)
);

create table tournament_live_proposal (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references tournament_fixture(id) on delete cascade,
  proposed_by_participant_id uuid not null references tournament_participant(id) on delete cascade,
  proposed_at timestamptz not null,
  state text not null default 'pending'
    check (state in ('pending', 'accepted', 'declined', 'superseded', 'cancelled')),
  responded_by_participant_id uuid references tournament_participant(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index tournament_live_one_pending_idx
  on tournament_live_proposal (fixture_id) where state = 'pending';

create table tournament_dispatch (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  idempotency_key text not null unique,
  kind text not null check (kind in ('push', 'direct_message', 'official_news')),
  event_key text not null,
  audience_snapshot jsonb not null,
  payload_snapshot jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled')),
  recipient_count int not null default 0 check (recipient_count >= 0),
  delivered_count int not null default 0 check (delivered_count >= 0),
  failed_count int not null default 0 check (failed_count >= 0),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table tournament_adjustment (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  fixture_id uuid references tournament_fixture(id) on delete set null,
  participant_id uuid references tournament_participant(id) on delete set null,
  kind text not null check (kind in (
    'score', 'points', 'forfeit', 'disqualification', 'schedule', 'registration', 'incident_resolution'
  )),
  payload jsonb not null,
  reason text not null,
  created_by uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table tournament_economy_event (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  participant_id uuid not null references tournament_participant(id) on delete cascade,
  idempotency_key text not null unique,
  kind text not null check (kind in ('entry_fee', 'entry_refund', 'stage_reward')),
  coins int not null default 0,
  experience int not null default 0,
  stars int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'applied', 'reversed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  check (coins >= 0 and experience >= 0 and stars >= 0)
);

alter table amateur_duel_match
  drop constraint if exists amateur_duel_match_source_check;

alter table amateur_duel_match
  add constraint amateur_duel_match_source_check
  check (source in ('challenge', 'matchmaking', 'tournament'));

alter table currency_ledger
  drop constraint if exists currency_ledger_reason_check,
  add constraint currency_ledger_reason_check
    check (reason in (
      'admin_adjustment',
      'purchase',
      'duel_stake_hold',
      'duel_entry_fee',
      'duel_stake_refund',
      'duel_stake_payout',
      'duel_stake_burn',
      'duel_reward',
      'inventory_purchase',
      'weekly_challenge_reward',
      'bonus_game_reward',
      'tournament_entry_fee',
      'tournament_entry_refund',
      'tournament_reward'
    ));

insert into game_settings (key, value, label, description)
values (
  'tournaments.enabled',
  'false'::jsonb,
  'Турниры включены',
  'Показывает турнирный раздел игрокам и разрешает публичные турнирные API.'
)
on conflict (key) do nothing;

alter table user_push_preferences
  add column tournament_events boolean not null default true;

alter table push_notification_templates
  drop constraint if exists push_notification_templates_category_check;

alter table push_notification_templates
  add constraint push_notification_templates_category_check
  check (category in ('chat', 'daily', 'training', 'duel', 'tournament', 'news'));

insert into push_notification_templates
  (key, category, title, body, trigger_description, click_url)
values
  ('tournament.application_approved', 'tournament', 'Заявка подтверждена', '{{tournamentTitle}}: вы участвуете.', 'Заявка игрока одобрена.', '/?view=tournaments'),
  ('tournament.schedule_published', 'tournament', 'Календарь опубликован', 'Расписание турнира {{tournamentTitle}} готово.', 'Опубликован календарь.', '/?view=tournaments'),
  ('tournament.fixture_opened', 'tournament', 'Матч открыт', 'Можно начинать игру в турнире {{tournamentTitle}}.', 'Открылось окно fixture.', '/?view=tournaments'),
  ('tournament.live_soon', 'tournament', 'Live-игра скоро начнётся', 'До согласованного старта осталось {{minutes}} мин.', 'Приближается live-время.', '/?view=tournaments'),
  ('tournament.fixture_deadline', 'tournament', 'Матч скоро закроется', 'Завершите игру до {{deadline}}.', 'Приближается дедлайн fixture.', '/?view=tournaments'),
  ('tournament.result_ready', 'tournament', 'Результат матча', '{{resultText}}', 'Fixture получил итог.', '/?view=tournaments'),
  ('tournament.rescheduled', 'tournament', 'Матч перенесён', 'Новое время: {{startsAt}}.', 'Администратор перенёс игру.', '/?view=tournaments'),
  ('tournament.playoff_started', 'tournament', 'Начинается плей-офф', 'Сетка турнира {{tournamentTitle}} опубликована.', 'Опубликована сетка плей-офф.', '/?view=tournaments'),
  ('tournament.series_next_game', 'tournament', 'Следующая игра серии', 'Следующий матч откроется {{startsAt}}.', 'Назначена следующая игра серии.', '/?view=tournaments'),
  ('tournament.completed', 'tournament', 'Турнир завершён', '{{tournamentTitle}} завершён. Проверьте итоги и награды.', 'Турнир завершён.', '/?view=tournaments')
on conflict (key) do nothing;
