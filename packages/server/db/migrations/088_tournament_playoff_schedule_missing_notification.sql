insert into push_notification_templates
  (key, category, title, body, trigger_description, click_url)
values
  (
    'tournament.playoff_schedule_missing',
    'tournament',
    'Настройте расписание плей-офф',
    'В турнире «{{tournamentTitle}}» завершён регулярный сезон. Укажите даты и время игр плей-офф.',
    'Регулярный сезон завершён, но даты и время игр плей-офф не заданы.',
    '/admin'
  )
on conflict (key) do nothing;
