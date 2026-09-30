create table inventory_purchase_request (
  user_id uuid not null references users(id) on delete cascade,
  idempotency_key uuid not null,
  inventory_item_id uuid not null references admin_inventory_items(id),
  currency text not null check (currency in ('coins', 'stars')),
  price_paid integer not null check (price_paid >= 0),
  instance_id uuid references user_inventory_instance(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);
