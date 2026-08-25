with ranked_active as (
  select id,
         row_number() over (
           partition by fixture_id
           order by created_at desc, id desc
         ) as active_rank
    from tournament_live_proposal
   where state in ('pending', 'accepted')
)
update tournament_live_proposal proposal
   set state = 'superseded'
  from ranked_active ranked
 where proposal.id = ranked.id
   and ranked.active_rank > 1;

drop index if exists tournament_live_one_pending_idx;

create unique index tournament_live_one_active_idx
  on tournament_live_proposal (fixture_id)
  where state in ('pending', 'accepted');
