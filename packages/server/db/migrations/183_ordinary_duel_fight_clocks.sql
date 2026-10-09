alter table amateur_duel_match
  add column state_revision bigint not null default 0,
  add column fight_paused_at timestamptz;
alter table amateur_duel_participant
  add column period_paused_ms integer not null default 0 check (period_paused_ms >= 0),
  add column period_paused_at timestamptz,
  add column recovery_until timestamptz;

-- Every hockey mutation participates in the same monotonic snapshot order.
create function amateur_duel_bump_state_revision() returns trigger language plpgsql as $$
begin
  new.state_revision := old.state_revision + 1;
  return new;
end;
$$;
create trigger amateur_duel_match_revision before update on amateur_duel_match
for each row execute function amateur_duel_bump_state_revision();

create function amateur_duel_participant_revision() returns trigger language plpgsql as $$
begin
  update amateur_duel_match set state_revision=state_revision+1 where id=new.match_id;
  return new;
end;
$$;
create trigger amateur_duel_participant_revision after update on amateur_duel_participant
for each row when (old is distinct from new) execute function amateur_duel_participant_revision();
