insert into push_notification_templates
  (key, category, title, body, trigger_description, click_url)
values
  (
    'tournament.registration_blocked',
    'tournament',
    'Турнир требует внимания',
    'В турнире «{{tournamentTitle}}» подтверждено {{approvedCount}} из {{requiredCount}} участников.',
    'Регистрация завершилась, но участников недостаточно для выбранного плей-офф.',
    '/admin'
  ),
  (
    'tournament.playoff_blocked',
    'tournament',
    'Плей-офф ожидает результатов',
    'В турнире «{{tournamentTitle}}» ещё не завершены все игры регулярного сезона.',
    'Время старта плей-офф наступило, но результаты регулярного сезона неполны.',
    '/admin'
  )
on conflict (key) do nothing;
