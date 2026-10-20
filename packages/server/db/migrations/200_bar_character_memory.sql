-- Additive storage. Local computer games are reports, not verified ranking results.
create table bar_character_stories (
  character_id text not null check (character_id in ('maria','daria','grigory','arsenich','veronika','oleg','timofey')),
  id uuid not null default gen_random_uuid(),
  title text not null check (length(title) between 1 and 100),
  content text not null check (length(content) between 20 and 1200),
  topics jsonb not null,
  disclosure text not null check (disclosure in ('casual','personal')),
  prompt_version integer not null,
  created_at timestamptz not null default now(),
  primary key (character_id,id),
  unique (character_id,content)
);
create table bar_told_stories (
  user_id uuid not null,
  character_id text not null,
  story_id text not null,
  first_turn_id uuid not null,
  last_turn_id uuid not null,
  first_told_at timestamptz not null default now(),
  last_told_at timestamptz not null default now(),
  primary key (user_id,character_id,story_id),
  foreign key (user_id,character_id) references bar_conversations(user_id,character_id) on delete cascade
);
create table bar_conversation_memory (
  user_id uuid not null,
  character_id text not null,
  summary text not null default '' check (length(summary)<=1800),
  processed_count integer not null default 0,
  summarized_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id,character_id),
  foreign key (user_id,character_id) references bar_conversations(user_id,character_id) on delete cascade
);
create table bar_memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id text not null,
  kind text not null check (kind in ('fact','agreement','shared_joke')),
  content text not null check (length(content) between 1 and 300),
  source_turn_id uuid not null,
  source_quote text not null check (length(source_quote) between 1 and 300),
  updated_at timestamptz not null default now(),
  unique (user_id,character_id,kind,content),
  foreign key (user_id,character_id) references bar_conversations(user_id,character_id) on delete cascade
);
create index bar_memory_facts_owner_idx on bar_memory_facts(user_id,character_id,updated_at desc);
create table bar_memory_jobs (
  user_id uuid not null,
  character_id text not null,
  target_revision integer not null,
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  primary key (user_id,character_id),
  foreign key (user_id,character_id) references bar_conversations(user_id,character_id) on delete cascade
);
create index bar_memory_jobs_ready_idx on bar_memory_jobs(next_at);
create table bar_computer_card_history (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  character_id text not null check (character_id in ('maria','daria','grigory','arsenich')),
  game_type text not null default 'durak' check (game_type='durak'),
  rules_version integer not null default 1,
  result text not null check (result in ('win','loss','draw')),
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at>=started_at),
  surrendered boolean not null,
  caught_cheats integer not null check (caught_cheats between 0 and 2),
  provenance text not null default 'client_reported' check (provenance='client_reported'),
  received_at timestamptz not null default now(),
  check (not surrendered or result='loss'),
  check (character_id='grigory' or caught_cheats=0)
);
create index bar_computer_history_owner_idx on bar_computer_card_history(user_id,character_id,ended_at desc,id);

-- Existing conversations retain their full history and are reflected after upgrade.
insert into bar_memory_jobs(user_id,character_id,target_revision)
select user_id,character_id,revision from bar_conversations where revision>0;
