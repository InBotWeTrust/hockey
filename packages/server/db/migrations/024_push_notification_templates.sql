create table if not exists push_notification_templates (
  key text primary key,
  category text not null check (category in ('chat', 'daily', 'training', 'news')),
  title text not null check (length(title) between 1 and 80),
  body text not null check (length(body) between 1 and 240),
  trigger_description text not null check (length(trigger_description) between 1 and 500),
  click_url text not null check (click_url ~ '^/([^/].*)?$'),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);

insert into push_notification_templates
  (key, category, title, body, trigger_description, click_url)
values
  (
    'chat.new_dialog_message',
    'chat',
    'Новое сообщение от {{senderName}}',
    '{{messagePreview}}',
    'Первое сообщение в новом личном диалоге.',
    '/chat/{{chatId}}'
  ),
  (
    'daily.available',
    'daily',
    'Ежедневная игра доступна',
    'Новый игровой день уже открыт.',
    'Начало нового дня по часовому поясу игрока.',
    '/?view=hub'
  ),
  (
    'daily.unlocked_after_training',
    'daily',
    'Ежедневная игра открыта',
    'Восстановление после тренировки завершено.',
    'Через 2 часа после последнего тренировочного броска, если дневная игра ещё не начата.',
    '/?view=hub'
  ),
  (
    'daily.period_ending',
    'daily',
    'Период скоро закончится',
    'Осталось немного времени на броски.',
    'Перед окончанием активного периода ежедневной игры.',
    '/?view=daily'
  ),
  (
    'daily.break_finished',
    'daily',
    'Перерыв окончен',
    'Следующий период можно начинать.',
    'После окончания перерыва между периодами.',
    '/?view=hub'
  ),
  (
    'training.available',
    'training',
    'Тренировка доступна',
    'Можно снова потренироваться.',
    'Через 24 часа после прошлой тренировки.',
    '/?view=training'
  ),
  (
    'news.posted',
    'news',
    'Новости игры',
    '{{postContent}}',
    'Админ публикует новый пост в новостном канале.',
    '/chat/{{chatId}}'
  )
on conflict (key) do nothing;
