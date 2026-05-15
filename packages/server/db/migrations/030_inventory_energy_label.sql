update admin_inventory_items
   set title = 'Энергия',
       item_kind = 'nutrition'
 where deleted_at is null
   and (lower(title) like '%питан%' or lower(title) = 'энергия');
