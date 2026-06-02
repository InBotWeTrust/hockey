with ranked_active_templates as (
  select
    id,
    row_number() over (
      partition by duel_kind
      order by
        case
          when duel_kind = 'express' and title = 'Экспресс' then 0
          when duel_kind = 'express_plus' and title = 'Экспресс+' then 0
          when duel_kind = 'classic' and title = 'Классика' then 0
          else 1
        end,
        updated_at desc,
        created_at desc,
        id asc
    ) as template_rank
  from amateur_duel_template
  where deleted_at is null
    and is_active
),
duplicate_active_templates as (
  select id
    from ranked_active_templates
   where template_rank > 1
)
update amateur_duel_template
   set deleted_at = now(),
       updated_at = now()
 where id in (select id from duplicate_active_templates);

create unique index if not exists amateur_duel_template_one_active_kind_idx
  on amateur_duel_template (duel_kind)
  where deleted_at is null
    and is_active;
