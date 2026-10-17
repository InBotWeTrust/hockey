create table bar_visitor_settings (
  id integer primary key check (id = 1), revision integer not null default 1,
  settings jsonb not null, updated_at timestamptz not null default now()
);
insert into bar_visitor_settings(id, settings) values (1, '{"cardDays":30,"freeMessages":10,"cardMessages":30,"freeGames":3,"cardGames":2,"products":[{"id":"visitor-card","title":"Карта посетителя","kind":"card","amount":1,"coins":14900,"stars":300},{"id":"messages-10","title":"10 сообщений","kind":"messages","amount":10,"coins":1000,"stars":20},{"id":"messages-30","title":"30 сообщений","kind":"messages","amount":30,"coins":2500,"stars":50},{"id":"messages-100","title":"100 сообщений","kind":"messages","amount":100,"coins":6000,"stars":120}]}');
create table bar_visitor_accounts (
  user_id uuid primary key references users(id) on delete cascade, purchased_at timestamptz,
  expires_at timestamptz, paid_messages integer not null default 0 check (paid_messages >= 0),
  messages_used integer not null default 0 check (messages_used >= 0),
  games_used jsonb not null default '{}', day_started_at timestamptz not null,
  day_timezone text not null, reset_at timestamptz not null
);
create table bar_visitor_receipts (
  user_id uuid not null references users(id) on delete cascade, id uuid not null,
  kind text not null check (kind in ('message','game','purchase')),
  character_id text, source text, status text not null check (status in ('reserved','complete','released')),
  day_started_at timestamptz, pending_until timestamptz, payload jsonb,
  created_at timestamptz not null default now(), primary key(user_id,id)
);
create index bar_visitor_pending_idx on bar_visitor_receipts(user_id,pending_until) where status='reserved' and kind='message';
