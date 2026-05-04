create table channel_post_polls (
  post_message_id uuid primary key references messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table channel_post_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_message_id uuid not null references channel_post_polls(post_message_id) on delete cascade,
  position integer not null check (position >= 1 and position <= 3),
  text text not null check (length(trim(text)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (post_message_id, position),
  unique (post_message_id, id)
);

create index idx_channel_post_poll_options_post
  on channel_post_poll_options (post_message_id, position asc);

create table channel_post_poll_votes (
  post_message_id uuid not null references channel_post_polls(post_message_id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  option_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_message_id, user_id),
  foreign key (post_message_id, option_id)
    references channel_post_poll_options(post_message_id, id)
    on delete cascade
);

create index idx_channel_post_poll_votes_option
  on channel_post_poll_votes (option_id);
