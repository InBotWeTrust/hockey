alter table amateur_duel_matchmaking_ticket
  add column if not exists duel_kinds jsonb not null default '[]'::jsonb;

update amateur_duel_matchmaking_ticket ticket
   set duel_kinds = jsonb_build_array(template.duel_kind)
  from amateur_duel_template template
 where ticket.template_id = template.id
   and ticket.duel_kinds = '[]'::jsonb;

update amateur_duel_template
   set matchmaking_timeout_ms = 120000
 where deleted_at is null;

alter table amateur_duel_matchmaking_ticket
  drop constraint if exists amateur_duel_matchmaking_ticket_duel_kinds_json_check;

alter table amateur_duel_matchmaking_ticket
  add constraint amateur_duel_matchmaking_ticket_duel_kinds_json_check
  check (jsonb_typeof(duel_kinds) = 'array' and jsonb_array_length(duel_kinds) between 1 and 3);

create unique index if not exists amateur_duel_matchmaking_one_open_user_global_idx
  on amateur_duel_matchmaking_ticket (user_id)
  where status = 'queued';
