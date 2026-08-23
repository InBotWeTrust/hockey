-- Stable launch catalog for bonus games and their reusable arena themes.

insert into arena_theme
  (id, slug, title, artwork_url, thumbnail_url, status, is_selectable)
values
  (
    '00000000-0000-4000-8000-000000000590',
    'default',
    'Стандартная арена',
    '/sprites/arena-ice-court-v2.webp',
    '/sprites/arena-ice-court-v2.webp',
    'active',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000591',
    'beach',
    'Пляж',
    '/bonus-games/arenas/beach.webp',
    '/bonus-games/arenas/beach.webp',
    'active',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000592',
    'ski-resort',
    'Горнолыжный курорт',
    '/bonus-games/arenas/ski-resort.webp',
    '/bonus-games/arenas/ski-resort.webp',
    'active',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000593',
    'cyberpunk-yard',
    'Киберпанк-двор',
    '/bonus-games/arenas/cyberpunk-yard.webp',
    '/bonus-games/arenas/cyberpunk-yard.webp',
    'active',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000594',
    'abandoned-waterpark',
    'Заброшенный аквапарк',
    '/bonus-games/arenas/abandoned-waterpark.webp',
    '/bonus-games/arenas/abandoned-waterpark.webp',
    'active',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000595',
    'pirate-bay',
    'Пиратская бухта',
    '/bonus-games/arenas/pirate-bay.webp',
    '/bonus-games/arenas/pirate-bay.webp',
    'active',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000596',
    'north-pole',
    'Северный полюс',
    '/bonus-games/arenas/north-pole.webp',
    '/bonus-games/arenas/north-pole.webp',
    'active',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000597',
    'desert',
    'Пустыня',
    '/bonus-games/arenas/desert.webp',
    '/bonus-games/arenas/desert.webp',
    'active',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000598',
    'volcanic-ice',
    'Вулканический лёд',
    '/bonus-games/arenas/volcanic-ice.webp',
    '/bonus-games/arenas/volcanic-ice.webp',
    'active',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000599',
    'castle',
    'Замок',
    '/bonus-games/arenas/castle.webp',
    '/bonus-games/arenas/castle.webp',
    'active',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000600',
    'space',
    'Космос',
    '/bonus-games/arenas/space.webp',
    '/bonus-games/arenas/space.webp',
    'active',
    true
  );

insert into bonus_game
  (id, slug, title, description, sort_order, status, access_type,
   unlock_price_stars, target_goals, total_periods, break_duration_ms,
   period_rules, reward_coins, reward_stars, reward_experience,
   arena_theme_id, goalkeeper_ready_url, goalkeeper_save_url, revision)
values
  (
    '00000000-0000-4000-8000-000000000601',
    'beach',
    'Пляж',
    '',
    1,
    'active',
    'free',
    0,
    18,
    1,
    30000,
    '[
      {
        "periodNumber": 1,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.45,
        "goalieFrequency": 0.50,
        "shooterFrequency": 0.65,
        "puckSpeedPerMs": 1.20,
        "goaliePattern": "linear",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      }
    ]'::jsonb,
    100,
    1,
    50,
    '00000000-0000-4000-8000-000000000591',
    '/bonus-games/goalkeepers/beach-ready.webp',
    '/bonus-games/goalkeepers/beach-save.webp',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    'ski-resort',
    'Горнолыжный курорт',
    '',
    2,
    'active',
    'paid',
    1,
    20,
    1,
    30000,
    '[
      {
        "periodNumber": 1,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.45,
        "goalieFrequency": 0.55,
        "shooterFrequency": 0.68,
        "puckSpeedPerMs": 1.20,
        "goaliePattern": "sine",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      }
    ]'::jsonb,
    150,
    1,
    75,
    '00000000-0000-4000-8000-000000000592',
    '/bonus-games/goalkeepers/ski-resort-ready.webp',
    '/bonus-games/goalkeepers/ski-resort-save.webp',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000603',
    'cyberpunk-yard',
    'Киберпанк-двор',
    '',
    3,
    'active',
    'free',
    0,
    21,
    1,
    30000,
    '[
      {
        "periodNumber": 1,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.48,
        "goalieFrequency": 0.60,
        "shooterFrequency": 0.70,
        "puckSpeedPerMs": 1.22,
        "goaliePattern": "dash",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      }
    ]'::jsonb,
    200,
    1,
    100,
    '00000000-0000-4000-8000-000000000593',
    '/bonus-games/goalkeepers/cyberpunk-yard-ready.webp',
    '/bonus-games/goalkeepers/cyberpunk-yard-save.webp',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000604',
    'abandoned-waterpark',
    'Заброшенный аквапарк',
    '',
    4,
    'active',
    'paid',
    2,
    36,
    2,
    30000,
    '[
      {
        "periodNumber": 1,
        "durationMs": 240000,
        "shotsLimit": 25,
        "goalFrequency": 0.50,
        "goalieFrequency": 0.60,
        "shooterFrequency": 0.70,
        "puckSpeedPerMs": 1.24,
        "goaliePattern": "sine",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      },
      {
        "periodNumber": 2,
        "durationMs": 240000,
        "shotsLimit": 25,
        "goalFrequency": 0.52,
        "goalieFrequency": 0.65,
        "shooterFrequency": 0.72,
        "puckSpeedPerMs": 1.26,
        "goaliePattern": "sine",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      }
    ]'::jsonb,
    300,
    2,
    150,
    '00000000-0000-4000-8000-000000000594',
    '/bonus-games/goalkeepers/abandoned-waterpark-ready.webp',
    '/bonus-games/goalkeepers/abandoned-waterpark-save.webp',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000605',
    'pirate-bay',
    'Пиратская бухта',
    '',
    5,
    'active',
    'free',
    0,
    38,
    2,
    30000,
    '[
      {
        "periodNumber": 1,
        "durationMs": 240000,
        "shotsLimit": 25,
        "goalFrequency": 0.52,
        "goalieFrequency": 0.65,
        "shooterFrequency": 0.72,
        "puckSpeedPerMs": 1.26,
        "goaliePattern": "dash",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      },
      {
        "periodNumber": 2,
        "durationMs": 240000,
        "shotsLimit": 25,
        "goalFrequency": 0.54,
        "goalieFrequency": 0.70,
        "shooterFrequency": 0.74,
        "puckSpeedPerMs": 1.28,
        "goaliePattern": "dash",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      }
    ]'::jsonb,
    400,
    2,
    200,
    '00000000-0000-4000-8000-000000000595',
    '/bonus-games/goalkeepers/pirate-bay-ready.webp',
    '/bonus-games/goalkeepers/pirate-bay-save.webp',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000606',
    'north-pole',
    'Северный полюс',
    '',
    6,
    'active',
    'paid',
    3,
    40,
    2,
    30000,
    '[
      {
        "periodNumber": 1,
        "durationMs": 240000,
        "shotsLimit": 25,
        "goalFrequency": 0.54,
        "goalieFrequency": 0.70,
        "shooterFrequency": 0.74,
        "puckSpeedPerMs": 1.28,
        "goaliePattern": "sine",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      },
      {
        "periodNumber": 2,
        "durationMs": 240000,
        "shotsLimit": 25,
        "goalFrequency": 0.56,
        "goalieFrequency": 0.75,
        "shooterFrequency": 0.76,
        "puckSpeedPerMs": 1.30,
        "goaliePattern": "sine",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      }
    ]'::jsonb,
    500,
    3,
    250,
    '00000000-0000-4000-8000-000000000596',
    '/bonus-games/goalkeepers/north-pole-ready.webp',
    '/bonus-games/goalkeepers/north-pole-save.webp',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000607',
    'desert',
    'Пустыня',
    '',
    7,
    'active',
    'free',
    0,
    47,
    2,
    30000,
    '[
      {
        "periodNumber": 1,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.56,
        "goalieFrequency": 0.75,
        "shooterFrequency": 0.76,
        "puckSpeedPerMs": 1.30,
        "goaliePattern": "linear",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      },
      {
        "periodNumber": 2,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.58,
        "goalieFrequency": 0.80,
        "shooterFrequency": 0.78,
        "puckSpeedPerMs": 1.32,
        "goaliePattern": "linear",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      }
    ]'::jsonb,
    650,
    3,
    325,
    '00000000-0000-4000-8000-000000000597',
    '/bonus-games/goalkeepers/desert-ready.webp',
    '/bonus-games/goalkeepers/desert-save.webp',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000608',
    'volcanic-ice',
    'Вулканический лёд',
    '',
    8,
    'active',
    'paid',
    5,
    49,
    2,
    30000,
    '[
      {
        "periodNumber": 1,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.58,
        "goalieFrequency": 0.80,
        "shooterFrequency": 0.78,
        "puckSpeedPerMs": 1.32,
        "goaliePattern": "dash",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      },
      {
        "periodNumber": 2,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.60,
        "goalieFrequency": 0.85,
        "shooterFrequency": 0.80,
        "puckSpeedPerMs": 1.34,
        "goaliePattern": "dash",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      }
    ]'::jsonb,
    800,
    4,
    400,
    '00000000-0000-4000-8000-000000000598',
    '/bonus-games/goalkeepers/volcanic-ice-ready.webp',
    '/bonus-games/goalkeepers/volcanic-ice-save.webp',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000609',
    'castle',
    'Замок',
    '',
    9,
    'active',
    'free',
    0,
    52,
    2,
    30000,
    '[
      {
        "periodNumber": 1,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.60,
        "goalieFrequency": 0.85,
        "shooterFrequency": 0.80,
        "puckSpeedPerMs": 1.34,
        "goaliePattern": "sine",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      },
      {
        "periodNumber": 2,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.62,
        "goalieFrequency": 0.90,
        "shooterFrequency": 0.82,
        "puckSpeedPerMs": 1.36,
        "goaliePattern": "sine",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      }
    ]'::jsonb,
    1000,
    5,
    500,
    '00000000-0000-4000-8000-000000000599',
    '/bonus-games/goalkeepers/castle-ready.webp',
    '/bonus-games/goalkeepers/castle-save.webp',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000610',
    'space',
    'Космос',
    '',
    10,
    'active',
    'paid',
    8,
    80,
    3,
    30000,
    '[
      {
        "periodNumber": 1,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.62,
        "goalieFrequency": 0.90,
        "shooterFrequency": 0.82,
        "puckSpeedPerMs": 1.36,
        "goaliePattern": "dash",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      },
      {
        "periodNumber": 2,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.65,
        "goalieFrequency": 0.95,
        "shooterFrequency": 0.85,
        "puckSpeedPerMs": 1.40,
        "goaliePattern": "dash",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      },
      {
        "periodNumber": 3,
        "durationMs": 240000,
        "shotsLimit": 30,
        "goalFrequency": 0.68,
        "goalieFrequency": 1.00,
        "shooterFrequency": 0.88,
        "puckSpeedPerMs": 1.45,
        "goaliePattern": "dash",
        "goalieAmplitude": 1,
        "goalAmplitude": 220
      }
    ]'::jsonb,
    1500,
    8,
    750,
    '00000000-0000-4000-8000-000000000600',
    '/bonus-games/goalkeepers/space-ready.webp',
    '/bonus-games/goalkeepers/space-save.webp',
    1
  );
