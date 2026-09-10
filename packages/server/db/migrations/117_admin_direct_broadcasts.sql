create table if not exists admin_direct_broadcasts (
  id uuid primary key,
  created_by uuid not null references users(id) on delete restrict,
  content text not null check (char_length(trim(content)) between 1 and 4000),
  status text not null default 'processing' check (status in ('processing', 'sent', 'partial', 'failed')),
  recipient_count int not null default 0 check (recipient_count >= 0),
  sent_count int not null default 0 check (sent_count >= 0),
  failed_count int not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists admin_direct_broadcast_recipients (
  broadcast_id uuid not null references admin_direct_broadcasts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  chat_id uuid references chats(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  updated_at timestamptz not null default now(),
  primary key (broadcast_id, user_id)
);

create index if not exists admin_direct_broadcasts_created_at_idx
  on admin_direct_broadcasts (created_at desc);
