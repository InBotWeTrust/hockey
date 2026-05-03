create table admin_inventory_items (
  id uuid primary key default gen_random_uuid(),
  photo_url text not null default '',
  title text not null,
  description text not null default '',
  price_rub int not null default 0 check (price_rub >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index admin_inventory_items_active_created_idx
  on admin_inventory_items (created_at desc)
  where deleted_at is null;

create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  inventory_item_id uuid references admin_inventory_items(id) on delete set null,
  title text not null,
  amount_rub int not null check (amount_rub >= 0),
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded', 'canceled')),
  provider text not null default 'manual',
  provider_payment_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index payments_provider_payment_unique_idx
  on payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create index payments_created_idx on payments (created_at desc);
create index payments_status_created_idx on payments (status, created_at desc);
create index payments_user_created_idx on payments (user_id, created_at desc);
