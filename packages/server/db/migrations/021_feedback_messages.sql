create table feedback_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  kind text not null check (kind in ('review', 'suggestion', 'question')),
  rating int check (rating is null or (rating >= 0 and rating <= 5)),
  message text not null check (length(trim(message)) between 1 and 2000),
  is_read boolean not null default false,
  read_at timestamptz,
  read_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index feedback_messages_unread_created_idx
  on feedback_messages (is_read, created_at desc);

create index feedback_messages_user_created_idx
  on feedback_messages (user_id, created_at desc);
