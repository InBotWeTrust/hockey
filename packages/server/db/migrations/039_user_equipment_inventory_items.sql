alter table user_equipment
  add column if not exists equipped_stick_item_id uuid references admin_inventory_items(id) on delete set null,
  add column if not exists equipped_skates_item_id uuid references admin_inventory_items(id) on delete set null,
  add column if not exists equipped_nutrition_item_id uuid references admin_inventory_items(id) on delete set null;

alter table amateur_duel_template
  alter column challenge_ttl_ms set default 900000;

update amateur_duel_template
   set challenge_ttl_ms = 900000,
       updated_at = now()
 where challenge_ttl_ms = 1800000
   and deleted_at is null;
