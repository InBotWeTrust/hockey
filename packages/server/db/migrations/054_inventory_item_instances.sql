create table if not exists user_inventory_instance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  inventory_item_id uuid not null references admin_inventory_items(id) on delete cascade,
  charges_available int not null default 0 check (charges_available >= 0),
  charges_reserved int not null default 0 check (charges_reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_inventory_instance_user_kind_idx
  on user_inventory_instance (user_id, inventory_item_id, created_at, id);

insert into user_inventory_instance
  (user_id, inventory_item_id, charges_available, charges_reserved, created_at, updated_at)
select user_id, inventory_item_id, charges_available, charges_reserved, created_at, updated_at
  from user_inventory_item legacy
 where legacy.charges_available + legacy.charges_reserved > 0
   and not exists (
     select 1
       from user_inventory_instance instance
      where instance.user_id = legacy.user_id
        and instance.inventory_item_id = legacy.inventory_item_id
   );

alter table user_equipment
  add column if not exists equipped_stick_instance_id uuid
    references user_inventory_instance(id) on delete set null,
  add column if not exists equipped_skates_instance_id uuid
    references user_inventory_instance(id) on delete set null,
  add column if not exists equipped_nutrition_instance_id uuid
    references user_inventory_instance(id) on delete set null;

update user_equipment equipment
   set equipped_stick_instance_id = instance.id
  from user_inventory_instance instance
  join admin_inventory_items item on item.id = instance.inventory_item_id
 where equipment.equipped_stick_instance_id is null
   and equipment.equipped_stick_item_id = instance.inventory_item_id
   and equipment.user_id = instance.user_id
   and item.item_kind = 'stick'
   and instance.charges_available > 0;

update user_equipment equipment
   set equipped_skates_instance_id = instance.id
  from user_inventory_instance instance
  join admin_inventory_items item on item.id = instance.inventory_item_id
 where equipment.equipped_skates_instance_id is null
   and equipment.equipped_skates_item_id = instance.inventory_item_id
   and equipment.user_id = instance.user_id
   and item.item_kind = 'skates'
   and instance.charges_available > 0;

update user_equipment equipment
   set equipped_nutrition_instance_id = instance.id
  from user_inventory_instance instance
  join admin_inventory_items item on item.id = instance.inventory_item_id
 where equipment.equipped_nutrition_instance_id is null
   and equipment.equipped_nutrition_item_id = instance.inventory_item_id
   and equipment.user_id = instance.user_id
   and item.item_kind = 'nutrition'
   and instance.charges_available > 0;
