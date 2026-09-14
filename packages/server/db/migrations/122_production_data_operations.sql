create table production_data_operations (
  operation_key text primary key,
  payload jsonb not null,
  applied_at timestamptz not null default now()
);
