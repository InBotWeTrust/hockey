-- Forward-only removal of the retired tournament source. The migration runner
-- supplies the transaction; target IDs cannot escape it or include ordinary games.
create temporary table removed_daily_aggregate_tournament_ids on commit drop as
select id from tournament where regular_source = 'daily_aggregate';

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
 where payload->>'tournament_id' in (select id::text from removed_daily_aggregate_tournament_ids);

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
