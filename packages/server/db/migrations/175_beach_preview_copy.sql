-- Catalog presentation only; existing immutable attempts and gameplay rules are untouched.
update bonus_game set
  preview_title = 'Жаркий матч',
  preview_story = 'Солнце припекло, и пляжный каток начал таять. С моря уже подступает прилив. Успей забить все шайбы, пока лёд ещё держится и площадку не залило водой.',
  preview_artwork_url = '/bonus-games/location-cards/beach-match.png',
  preview_revision = preview_revision + 1,
  revision = revision + 1,
  updated_at = now()
where slug = 'challenge-beach' and skill_code = 'challenge';
