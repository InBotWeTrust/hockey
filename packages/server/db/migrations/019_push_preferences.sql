create table if not exists user_push_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  chat_new_dialog_message boolean not null default true,
  daily_game boolean not null default true,
  training_available boolean not null default true,
  game_news boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
