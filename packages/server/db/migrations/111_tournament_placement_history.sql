-- Keep retired daily-aggregate tournaments readable as completed archive records.
-- Creation of new tournaments with this source remains disabled in the API/admin UI.
alter table tournament drop constraint if exists tournament_regular_source_check;
alter table tournament
  add constraint tournament_regular_source_check
  check (regular_source in ('head_to_head', 'classic', 'daily_aggregate')) not valid;
alter table tournament validate constraint tournament_regular_source_check;

create table tournament_placement_history (
  id uuid primary key default gen_random_uuid(),
  source_tournament_id uuid not null,
  user_id uuid not null references users(id) on delete cascade,
  stage text not null check (stage in ('regular', 'playoff')),
  place int not null check (place > 0),
  tournament_title text not null,
  tournament_image_url text,
  tournament_starts_at timestamptz,
  tournament_ends_at timestamptz,
  recorded_at timestamptz not null default now(),
  unique (source_tournament_id, stage, user_id)
);

create index tournament_placement_history_user_idx
  on tournament_placement_history (user_id, tournament_ends_at desc nulls last);

create or replace function snapshot_tournament_placements(target_tournament_id uuid)
returns void
language plpgsql
as $$
begin
  insert into tournament_placement_history
    (source_tournament_id, user_id, stage, place, tournament_title,
     tournament_image_url, tournament_starts_at, tournament_ends_at)
  select tournament_record.id, participant.user_id, 'regular', standing.rank,
         tournament_record.title, tournament_record.image_url, tournament_record.starts_at,
         tournament_record.completed_at
    from tournament tournament_record
    join tournament_standing standing on standing.tournament_id = tournament_record.id
    join tournament_participant participant on participant.id = standing.participant_id
   where tournament_record.id = target_tournament_id and standing.rank is not null
  on conflict (source_tournament_id, stage, user_id) do update
    set place = excluded.place,
        tournament_title = excluded.tournament_title,
        tournament_image_url = excluded.tournament_image_url,
        tournament_starts_at = excluded.tournament_starts_at,
        tournament_ends_at = excluded.tournament_ends_at,
        recorded_at = now();

  with final_series as (
    select distinct on (series.tournament_id)
           series.tournament_id,
           series.higher_seed_participant_id,
           series.lower_seed_participant_id,
           series.winner_participant_id
      from tournament_playoff_series series
      join tournament_round round_record on round_record.id = series.round_id
     where series.tournament_id = target_tournament_id
       and series.kind = 'championship'
       and series.status = 'completed'
       and round_record.stage = 'playoff'
     order by series.tournament_id, round_record.number desc,
              series.bracket_position, series.id
  ), playoff_placements as (
    select final.tournament_id, final.winner_participant_id as participant_id, 1 as place
      from final_series final
    union all
    select final.tournament_id,
           case when final.winner_participant_id = final.higher_seed_participant_id
                then final.lower_seed_participant_id else final.higher_seed_participant_id end,
           2
      from final_series final
    union all
    select series.tournament_id, series.winner_participant_id, 3
      from tournament_playoff_series series
     where series.tournament_id = target_tournament_id
       and series.kind = 'third_place' and series.status = 'completed'
    union all
    select series.tournament_id,
           case when series.winner_participant_id = series.higher_seed_participant_id
                then series.lower_seed_participant_id else series.higher_seed_participant_id end,
           4
      from tournament_playoff_series series
     where series.tournament_id = target_tournament_id
       and series.kind = 'third_place' and series.status = 'completed'
  )
  insert into tournament_placement_history
    (source_tournament_id, user_id, stage, place, tournament_title,
     tournament_image_url, tournament_starts_at, tournament_ends_at)
  select tournament_record.id, participant.user_id, 'playoff', placement.place,
         tournament_record.title, tournament_record.image_url, tournament_record.starts_at,
         tournament_record.completed_at
    from playoff_placements placement
    join tournament tournament_record on tournament_record.id = placement.tournament_id
    join tournament_participant participant on participant.id = placement.participant_id
   where placement.participant_id is not null
  on conflict (source_tournament_id, stage, user_id) do update
    set place = excluded.place,
        tournament_title = excluded.tournament_title,
        tournament_image_url = excluded.tournament_image_url,
        tournament_starts_at = excluded.tournament_starts_at,
        tournament_ends_at = excluded.tournament_ends_at,
        recorded_at = now();
end;
$$;

create or replace function snapshot_tournament_placements_before_delete()
returns trigger
language plpgsql
as $$
begin
  perform snapshot_tournament_placements(old.id);
  return old;
end;
$$;

create trigger snapshot_tournament_placements_before_delete
before delete on tournament
for each row execute function snapshot_tournament_placements_before_delete();

create or replace function snapshot_tournament_placements_after_completion()
returns trigger
language plpgsql
as $$
begin
  perform snapshot_tournament_placements(new.id);
  return new;
end;
$$;

create trigger snapshot_tournament_placements_after_completion
after update of status on tournament
for each row
when (new.status = 'completed' and old.status is distinct from new.status)
execute function snapshot_tournament_placements_after_completion();

-- One-time repair for the deleted dev tournament. The exact dev user UUID makes
-- this a no-op in production and in every unrelated database.
with deleted_tournament as (
  select (achievement.completion_context->>'tournamentId')::uuid as tournament_id,
         max(achievement.completed_at) as completed_at
    from user_achievements achievement
   where achievement.user_id = 'ad34ae5e-7dcf-4e59-84af-c7223ace6103'
     and achievement.achievement_id = 'playoff-final'
     and achievement.completion_context->>'tournamentId' ~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and not exists (
       select 1 from tournament
        where tournament.id::text = achievement.completion_context->>'tournamentId'
     )
   group by achievement.completion_context->>'tournamentId'
   order by max(achievement.completed_at) desc
   limit 1
), restored_players(user_id, place) as (
  values
    ('873d6bd2-294d-49d2-a895-ffa7a352dec5'::uuid, 1),
    ('ad34ae5e-7dcf-4e59-84af-c7223ace6103'::uuid, 2),
    ('8f86b681-1143-4667-a0ea-6d9db18d5f59'::uuid, 3),
    ('20f6f152-d8ac-49d3-a00a-6aab87d3c488'::uuid, 4)
)
insert into tournament_placement_history
  (source_tournament_id, user_id, stage, place, tournament_title, tournament_ends_at)
select deleted.tournament_id, player.id, 'playoff', restored.place,
       'Чемпионат Мира', deleted.completed_at
  from deleted_tournament deleted
  join restored_players restored on true
  join users player on player.id = restored.user_id
on conflict (source_tournament_id, stage, user_id) do nothing;

with deleted_tournament as (
  select (achievement.completion_context->>'tournamentId')::uuid as tournament_id,
         max(achievement.completed_at) as completed_at
    from user_achievements achievement
   where achievement.user_id = 'ad34ae5e-7dcf-4e59-84af-c7223ace6103'
     and achievement.achievement_id = 'playoff-final'
     and achievement.completion_context->>'tournamentId' ~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and not exists (
       select 1 from tournament
        where tournament.id::text = achievement.completion_context->>'tournamentId'
     )
   group by achievement.completion_context->>'tournamentId'
   order by max(achievement.completed_at) desc
   limit 1
), restored_regular(user_id, place) as (
  values
    ('873d6bd2-294d-49d2-a895-ffa7a352dec5'::uuid, 1),
    ('20f6f152-d8ac-49d3-a00a-6aab87d3c488'::uuid, 2),
    ('ad34ae5e-7dcf-4e59-84af-c7223ace6103'::uuid, 3)
)
insert into tournament_placement_history
  (source_tournament_id, user_id, stage, place, tournament_title, tournament_ends_at)
select deleted.tournament_id, player.id, 'regular', restored.place,
       'Чемпионат Мира', deleted.completed_at
  from deleted_tournament deleted
  join restored_regular restored on true
  join users player on player.id = restored.user_id
on conflict (source_tournament_id, stage, user_id) do nothing;
