alter table admin_inventory_items
  add column if not exists low_stock_threshold int not null default 0
    check (low_stock_threshold >= 0);

update admin_inventory_items
   set low_stock_threshold = case
         when item_kind = 'stick' then 10
         when item_kind = 'skates' then 50
         when item_kind = 'nutrition' then 60000
         else low_stock_threshold
       end,
       updated_at = now()
 where deleted_at is null
   and item_kind in ('stick', 'skates', 'nutrition')
   and low_stock_threshold = 0;
