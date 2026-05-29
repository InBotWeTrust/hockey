with ranked_variants as (
  select
    i.id,
    row_number() over (
      partition by i.item_kind, i.rarity
      order by
        coalesce(ui.usage_count, 0) desc,
        i.created_at asc,
        i.id asc
    ) as variant_rank
  from admin_inventory_items i
  left join (
    select inventory_item_id, count(*)::int as usage_count
      from user_inventory_item
     group by inventory_item_id
  ) ui on ui.inventory_item_id = i.id
  where i.deleted_at is null
    and i.item_kind in ('stick', 'skates', 'nutrition')
    and i.rarity in ('common', 'rare', 'legendary')
),
duplicate_variants as (
  select id
    from ranked_variants
   where variant_rank > 1
)
update admin_inventory_items
   set deleted_at = now(),
       updated_at = now()
 where id in (select id from duplicate_variants);

create unique index if not exists admin_inventory_items_active_shop_variant_idx
  on admin_inventory_items (item_kind, rarity)
  where deleted_at is null
    and item_kind in ('stick', 'skates', 'nutrition')
    and rarity in ('common', 'rare', 'legendary');
