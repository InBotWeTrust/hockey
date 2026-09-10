alter table push_notification_templates
  drop constraint if exists push_notification_templates_category_check;

alter table push_notification_templates
  add constraint push_notification_templates_category_check
  check (category in ('chat', 'daily', 'training', 'duel', 'tournament', 'news'));

insert into push_notification_templates
  (key, category, title, body, trigger_description, click_url)
values (
  'tournament.manual',
  'tournament',
  '{{title}}',
  '{{body}}',
  'Ручная рассылка администратора участникам турнира.',
  '/?view=amateur&section=tournaments'
)
on conflict (key) do nothing;
