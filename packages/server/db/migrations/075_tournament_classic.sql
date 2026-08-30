-- Isolated solo tournament games with configurable daily-style rules.

do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conrelid = 'tournament'::regclass
       and conname = 'tournament_regular_source_check'
       and position('classic' in pg_get_constraintdef(oid)) = 0
  ) then
    alter table tournament drop constraint tournament_regular_source_check;
    alter table tournament
      add constraint tournament_regular_source_check
      check (regular_source in ('head_to_head', 'daily_aggregate', 'classic')) not valid;
    alter table tournament validate constraint tournament_regular_source_check;
  end if;
end $$;

create table if not exists tournament_classic_session (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  participant_id uuid not null references tournament_participant(id) on delete cascade,
  matchday_id uuid not null references tournament_matchday(id) on delete cascade,
  tournament_day int not null check (tournament_day > 0),
  state text not null default 'idle'
    check (state in ('idle', 'period_active', 'break_active', 'closed', 'expired')),
  current_period smallint not null default 0 check (current_period between 0 and 3),
  rules_snapshot jsonb not null,
  game_core_version int not null,
  session_seed text not null,
  period_started_at timestamptz,
  break_started_at timestamptz,
  closes_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, participant_id, tournament_day),
  check (jsonb_typeof(rules_snapshot) = 'object')
);

create index if not exists tournament_classic_session_participant_idx
  on tournament_classic_session (participant_id, closes_at desc);

create index if not exists tournament_classic_session_open_idx
  on tournament_classic_session (closes_at, state)
  where state in ('idle', 'period_active', 'break_active');

create table if not exists tournament_classic_period (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tournament_classic_session(id) on delete cascade,
  period_number smallint not null check (period_number between 1 and 3),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  shots_taken int not null check (shots_taken >= 0),
  goals int not null check (goals >= 0),
  closed_reason text not null check (closed_reason in ('quota', 'timeout', 'day_end')),
  unique (session_id, period_number)
);

alter table shot_session
  add column if not exists tournament_classic_session_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'shot_session'::regclass
       and conname = 'shot_session_tournament_classic_session_id_fkey'
  ) then
    alter table shot_session
      add constraint shot_session_tournament_classic_session_id_fkey
      foreign key (tournament_classic_session_id)
      references tournament_classic_session(id) on delete cascade;
  end if;
end $$;

alter table shot_session drop constraint if exists shot_session_mode_check;
alter table shot_session
  add constraint shot_session_mode_check
  check (mode in ('daily', 'training', 'amateur_duel', 'bonus', 'tournament_classic', 'story'));

alter table shot_session drop constraint if exists shot_session_check;
alter table shot_session
  add constraint shot_session_check
  check (
    (mode = 'daily' and day_pool_id is not null and period_number is not null)
    or (mode = 'training' and training_session_id is not null and period_number is not null)
    or (mode = 'amateur_duel' and amateur_duel_match_id is not null and period_number is not null)
    or (mode = 'bonus' and bonus_game_attempt_id is not null and period_number is not null)
    or (
      mode = 'tournament_classic'
      and tournament_classic_session_id is not null
      and period_number is not null
    )
    or (mode = 'story' and story_task_id is not null)
  );

create unique index if not exists shot_session_tournament_classic_idx
  on shot_session (tournament_classic_session_id, period_number, shot_index)
  where mode = 'tournament_classic';
