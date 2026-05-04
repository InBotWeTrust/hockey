create table if not exists push_delivery_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null,
  event_key text not null,
  status text not null
    check (status in ('queued', 'processing', 'sent', 'partial', 'failed', 'skipped')),
  payload jsonb,
  attempt_count int not null default 0,
  next_attempt_at timestamptz not null default now(),
  subscription_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  click_count int not null default 0,
  clicked_at timestamptz,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_type, event_key)
);

create index if not exists push_delivery_log_event_created_idx
  on push_delivery_log (event_type, created_at desc);

create index if not exists push_delivery_log_queue_idx
  on push_delivery_log (next_attempt_at, created_at)
  where status in ('queued', 'processing');

create index if not exists push_delivery_log_clicked_idx
  on push_delivery_log (clicked_at desc)
  where clicked_at is not null;

create index if not exists shot_session_training_user_created_idx
  on shot_session (user_id, created_at desc)
  where mode = 'training';

insert into push_notification_templates
  (key, category, title, body, trigger_description, click_url)
values
  (
    'daily.unlocked_after_training',
    'daily',
    'Ежедневная игра открыта',
    'Восстановление после тренировки завершено.',
    'Через 2 часа после последнего тренировочного броска, если дневная игра ещё не начата.',
    '/?view=hub'
  )
on conflict (key) do nothing;

update push_notification_templates
   set click_url = '/?view=hub',
       updated_at = now()
 where key in ('daily.available', 'daily.break_finished')
   and click_url = '/';

update push_notification_templates
   set click_url = '/?view=daily',
       updated_at = now()
 where key = 'daily.period_ending'
   and click_url = '/';

update push_notification_templates
   set click_url = '/?view=training',
       updated_at = now()
 where key = 'training.available'
   and click_url = '/';

update push_notification_templates
   set title = 'Новое сообщение от {{senderName}}',
       body = '{{messagePreview}}',
       click_url = '/chat/{{chatId}}',
       updated_at = now()
 where key = 'chat.new_dialog_message'
   and title = 'Новое сообщение'
   and body = 'Вам написали в личку'
   and click_url = '/chat';
