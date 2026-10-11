-- Private controls survive conversation clearing and fence already-running jobs.
create table bar_memory_settings (
  user_id uuid not null,
  character_id text not null,
  enabled boolean not null default true,
  generation integer not null default 0,
  history_start integer not null default 0 check(history_start>=0),
  primary key(user_id,character_id),
  foreign key(user_id,character_id) references bar_conversations(user_id,character_id) on delete cascade
);
insert into bar_memory_settings(user_id,character_id) select user_id,character_id from bar_conversations;
alter table bar_memory_facts add column version integer not null default 1;
alter table bar_memory_facts add column provenance text not null default 'message' check(provenance in ('message','user_edit'));
