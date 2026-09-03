insert into push_notification_templates
  (key, category, title, body, trigger_description, click_url)
values
  (
    'tournament.opponent_ready',
    'tournament',
    'Соперник готов',
    '{{opponentName}} подтвердил готовность к игре.',
    'Один игрок подтвердил готовность к матчу плей-офф.',
    '/?view=amateur&section=tournaments'
  ),
  (
    'tournament.readiness_ending',
    'tournament',
    'Осталась минута',
    'Подтвердите готовность, иначе будет засчитано техническое поражение.',
    'За минуту до закрытия подтверждения готовности.',
    '/?view=amateur&section=tournaments'
  )
on conflict (key) do nothing;
