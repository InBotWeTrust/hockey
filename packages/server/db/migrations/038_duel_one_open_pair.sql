drop index if exists amateur_duel_match_one_open_pair_template_idx;

with ranked_open_pairs as (
  select
    id,
    row_number() over (
      partition by least(challenger_user_id, opponent_user_id), greatest(challenger_user_id, opponent_user_id)
      order by created_at asc
    ) as rn
  from amateur_duel_match
  where status in ('invited', 'ready_check', 'active')
)
update amateur_duel_match
   set status = 'cancelled',
       settled_reason = 'duplicate_open_pair_migration',
       settled_at = coalesce(settled_at, now())
 where id in (select id from ranked_open_pairs where rn > 1);

create unique index if not exists amateur_duel_match_one_open_pair_idx
  on amateur_duel_match (
    least(challenger_user_id, opponent_user_id),
    greatest(challenger_user_id, opponent_user_id)
  )
  where status in ('invited', 'ready_check', 'active');
