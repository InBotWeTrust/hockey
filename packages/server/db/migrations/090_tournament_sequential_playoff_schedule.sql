alter table tournament_round_game_day
  add column if not exists inter_game_break_duration interval not null default interval '5 minutes';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'tournament_round_game_day_inter_game_break_duration_check'
  ) then
    alter table tournament_round_game_day
      add constraint tournament_round_game_day_inter_game_break_duration_check
      check (inter_game_break_duration between interval '1 minute' and interval '30 minutes');
  end if;
end $$;

-- A later fixture becomes available only after the preceding result. Pending
-- attempts have never opened, so they can be safely replaced by that lifecycle;
-- settled and active history is intentionally left untouched.
delete from tournament_fixture_attempt attempt
 using tournament_fixture fixture
 where fixture.id = attempt.fixture_id
   and coalesce((fixture.result_snapshot->>'gameNumber')::int, 1) > 1
   and attempt.status = 'pending';

update tournament_fixture fixture
   set scheduled_starts_at = null,
       window_ends_at = null,
       updated_at = now()
 where coalesce((fixture.result_snapshot->>'gameNumber')::int, 1) > 1
   and not exists (
     select 1
       from tournament_fixture_attempt attempt
      where attempt.fixture_id = fixture.id
        and attempt.status in ('ready_check', 'active', 'settled', 'technical_result')
   );
