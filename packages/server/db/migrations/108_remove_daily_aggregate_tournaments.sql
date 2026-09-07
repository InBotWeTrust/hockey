-- Forward-only removal of the retired tournament source. The migration runner
-- supplies the transaction; target IDs cannot escape it or include ordinary games.
create temporary table removed_daily_aggregate_tournament_ids on commit drop as
select id from tournament where regular_source = 'daily_aggregate';

-- The old server remains live during migrations. Acquire its tournament locks
-- before snapshotting descendants so an in-flight fixture writer commits its
-- newly linked duel before we collect IDs. Hold all locks until migration commit.
do $$
declare
  target_id uuid;
begin
  for target_id in
    select id from removed_daily_aggregate_tournament_ids order by id
  loop
    perform pg_advisory_xact_lock(hashtext('tournament:' || target_id));
  end loop;
end $$;

-- A writer ahead of us may have changed a draft's source while we waited.
-- Recheck ownership under the acquired locks before collecting any descendants.
delete from removed_daily_aggregate_tournament_ids target
 where not exists (
   select 1 from tournament
    where tournament.id = target.id and regular_source = 'daily_aggregate'
 );

-- Old communications writers use separate session locks and keep their loaded
-- snapshots across multiple transactions. Stop writes while collecting dispatch
-- IDs and installing the durable guard; a new dispatch queued behind this lock
-- will fail its tournament FK after commit. Existing snapshots are guarded below.
lock table tournament_dispatch, messages, push_delivery_log in share row exclusive mode;

-- Capture reverse references before deleting fixtures, whose FKs point to duels
-- with ON DELETE SET NULL. A legacy link must never delete an ordinary duel.
create temporary table removed_daily_aggregate_duel_ids on commit drop as
select match.id
  from amateur_duel_match match
 where match.source = 'tournament'
   and match.id in (
     select segment.duel_match_id
       from tournament_fixture_segment segment
       join tournament_fixture fixture on fixture.id = segment.fixture_id
      where fixture.tournament_id in (select id from removed_daily_aggregate_tournament_ids)
     union
     select attempt.amateur_duel_match_id
       from tournament_fixture_attempt attempt
       join tournament_fixture fixture on fixture.id = attempt.fixture_id
      where fixture.tournament_id in (select id from removed_daily_aggregate_tournament_ids)
   );

-- Push event keys are '<owner UUID>:<event details>'. Compare the complete
-- first token against proven owners, never message text or a user's identity.
create temporary table removed_daily_aggregate_notification_owner_ids on commit drop as
select id from removed_daily_aggregate_tournament_ids
union
select id from removed_daily_aggregate_duel_ids
union
select id from tournament_participant
 where tournament_id in (select id from removed_daily_aggregate_tournament_ids)
union
select id from tournament_fixture
 where tournament_id in (select id from removed_daily_aggregate_tournament_ids)
union
select id from tournament_playoff_series
 where tournament_id in (select id from removed_daily_aggregate_tournament_ids)
union
select attempt.id from tournament_fixture_attempt attempt
 join tournament_fixture fixture on fixture.id = attempt.fixture_id
 where fixture.tournament_id in (select id from removed_daily_aggregate_tournament_ids)
union
select id from tournament_dispatch
 where tournament_id in (select id from removed_daily_aggregate_tournament_ids);

-- Keep only exact retired owner IDs, with no user data or tournament contents.
-- These tombstones must outlive this transaction: an already running old binary
-- can resume a loaded snapshot after migration commit, without taking our locks.
create table if not exists retired_tournament_communication_owner (
  owner_id text primary key,
  is_tournament boolean not null,
  is_dispatch boolean not null
);
insert into retired_tournament_communication_owner (owner_id, is_tournament, is_dispatch)
select owner.id::text,
       exists (select 1 from removed_daily_aggregate_tournament_ids where id = owner.id),
       exists (select 1 from tournament_dispatch where id = owner.id)
  from removed_daily_aggregate_notification_owner_ids owner
on conflict (owner_id) do nothing;

create or replace function reject_retired_tournament_message() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from retired_tournament_communication_owner
     where (is_tournament and owner_id = new.metadata->>'tournamentId')
        or (is_dispatch and owner_id = new.metadata->>'tournamentDispatchId')
  ) then
    raise exception 'tournament communication owner was removed' using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists reject_retired_tournament_message on messages;
create trigger reject_retired_tournament_message
before insert or update of metadata on messages
for each row execute function reject_retired_tournament_message();

create or replace function reject_retired_tournament_push() returns trigger
language plpgsql as $$
begin
  if new.event_type like 'tournament.%' and exists (
    select 1 from retired_tournament_communication_owner
     where owner_id = split_part(new.event_key, ':', 1)
  ) then
    raise exception 'tournament communication owner was removed' using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists reject_retired_tournament_push on push_delivery_log;
create trigger reject_retired_tournament_push
before insert or update of event_type, event_key on push_delivery_log
for each row execute function reject_retired_tournament_push();

delete from push_delivery_log
 where event_type like 'tournament.%'
   and split_part(event_key, ':', 1) in (
     select id::text from removed_daily_aggregate_notification_owner_ids
   );

-- Announcements in shared channels/DMs carry exact structured ownership.
-- Their reactions, comments, polls and views cascade; shared chats remain.
delete from messages
 where metadata->>'tournamentId' in (select id::text from removed_daily_aggregate_tournament_ids)
    or metadata->>'tournamentDispatchId' in (
      select id::text from tournament_dispatch
       where tournament_id in (select id from removed_daily_aggregate_tournament_ids)
    );

delete from chats
 where entity_type = 'tournament'
   and entity_id in (select id from removed_daily_aggregate_tournament_ids);

delete from event_log
 where payload->>'tournament_id' in (select id::text from removed_daily_aggregate_tournament_ids)
    or (
      type = 'admin_tournament_lifecycle_enabled'
      and payload->>'tournamentId' in (select id::text from removed_daily_aggregate_tournament_ids)
    )
    or (
      type in ('amateur_duel_settled', 'amateur_duel_inventory_reserved')
      and payload->>'match_id' in (select id::text from removed_daily_aggregate_duel_ids)
    )
    or (
      type = 'shot_mismatch'
      and payload->>'amateur_duel_match_id' in (select id::text from removed_daily_aggregate_duel_ids)
    );

-- Remove owned history without issuing rewards, refunds or balance changes.
delete from currency_ledger
 where metadata->>'tournament_id' in (select id::text from removed_daily_aggregate_tournament_ids)
    or duel_match_id in (select id from removed_daily_aggregate_duel_ids);

delete from amateur_duel_matchmaking_ticket
 where matched_match_id in (select id from removed_daily_aggregate_duel_ids);

delete from amateur_duel_match
 where id in (select id from removed_daily_aggregate_duel_ids);

-- Break the tournament -> published revision -> tournament cycle first.
update tournament
   set published_revision_id = null
 where id in (select id from removed_daily_aggregate_tournament_ids);

-- Fixtures cascade to attempts (including restrictive winner FKs), segments,
-- proposals, choices and incidents. Series then cascade to admin decisions.
-- Both must disappear before tournament_participant can be cascade-deleted.
delete from tournament_fixture
 where tournament_id in (select id from removed_daily_aggregate_tournament_ids);

delete from tournament_playoff_series
 where tournament_id in (select id from removed_daily_aggregate_tournament_ids);

-- Remaining FKs cascade: revisions, participants/applications, matchdays,
-- rounds/game days, daily results, standings, dispatches, adjustments, economy
-- events, classic sessions/periods/loadouts/shots, readiness and podium notices.
delete from tournament
 where id in (select id from removed_daily_aggregate_tournament_ids);

alter table tournament drop constraint if exists tournament_regular_source_check;
alter table tournament
  add constraint tournament_regular_source_check
  check (regular_source in ('head_to_head', 'classic')) not valid;
alter table tournament validate constraint tournament_regular_source_check;
