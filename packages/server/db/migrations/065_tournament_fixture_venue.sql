-- Fixture venues are immutable once a tournament segment has opened. The nullable
-- snapshot lets unpublished and legacy fixtures resolve their venue lazily.

alter table tournament_fixture
  add column if not exists venue_mode text,
  add column if not exists venue_owner_participant_id uuid,
  add column if not exists arena_theme_id uuid,
  add column if not exists arena_snapshot jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tournament_fixture_venue_mode_check'
  ) then
    alter table tournament_fixture
      add constraint tournament_fixture_venue_mode_check
      check (venue_mode in ('home_selected', 'neutral_default'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tournament_fixture_venue_owner_participant_id_fkey'
  ) then
    alter table tournament_fixture
      add constraint tournament_fixture_venue_owner_participant_id_fkey
      foreign key (venue_owner_participant_id) references tournament_participant(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tournament_fixture_arena_theme_id_fkey'
  ) then
    alter table tournament_fixture
      add constraint tournament_fixture_arena_theme_id_fkey
      foreign key (arena_theme_id) references arena_theme(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tournament_fixture_arena_snapshot_check'
  ) then
    alter table tournament_fixture
      add constraint tournament_fixture_arena_snapshot_check
      check (arena_snapshot is null or jsonb_typeof(arena_snapshot) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'amateur_duel_match_venue_policy_check'
  ) then
    alter table amateur_duel_match
      add constraint amateur_duel_match_venue_policy_check
      check (
        venue_policy is null
        or venue_policy in (
          'direct_challenge', 'neutral_default', 'random_participant_home',
          'random_unselected', 'home_selected'
        )
      );
  else
    alter table amateur_duel_match drop constraint amateur_duel_match_venue_policy_check;
    alter table amateur_duel_match
      add constraint amateur_duel_match_venue_policy_check
      check (
        venue_policy is null
        or venue_policy in (
          'direct_challenge', 'neutral_default', 'random_participant_home',
          'random_unselected', 'home_selected'
        )
      );
  end if;
end $$;

update tournament_fixture fixture
   set venue_mode = case
         when round.stage in ('regular', 'playoff', 'third_place') then 'home_selected'
         else 'neutral_default'
       end
 from tournament_round round
 where round.id = fixture.round_id
   and fixture.venue_mode is null
   and not exists (
     select 1 from tournament_fixture_segment segment where segment.fixture_id = fixture.id
   );

with existing_segment_venue as (
  select distinct on (segment.fixture_id)
         segment.fixture_id,
         duel.home_user_id,
         duel.arena_theme_id,
         duel.arena_snapshot
    from tournament_fixture_segment segment
    join amateur_duel_match duel on duel.id = segment.duel_match_id
   where duel.arena_theme_id is not null and duel.arena_snapshot is not null
   order by segment.fixture_id, segment.sequence_number
)
update tournament_fixture fixture
   set venue_mode = case when venue.home_user_id is null then 'neutral_default' else 'home_selected' end,
       venue_owner_participant_id = case
         when (select user_id from tournament_participant where id = fixture.home_participant_id)
              = venue.home_user_id then fixture.home_participant_id
         when (select user_id from tournament_participant where id = fixture.away_participant_id)
              = venue.home_user_id then fixture.away_participant_id
         else null
       end,
       arena_theme_id = venue.arena_theme_id,
       arena_snapshot = venue.arena_snapshot
 from existing_segment_venue venue
 where fixture.id = venue.fixture_id
   and fixture.venue_mode is null
   and fixture.arena_snapshot is null;

update tournament_fixture
   set venue_mode = 'neutral_default'
 where venue_mode is null;

alter table tournament_fixture
  alter column venue_mode set default 'neutral_default',
  alter column venue_mode set not null;
