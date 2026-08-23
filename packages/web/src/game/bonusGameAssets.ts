function asset(slug: string) {
  return {
    arena: `/bonus-games/arenas/${slug}.webp`,
    goalkeeperReady: `/bonus-games/goalkeepers/${slug}-ready.webp`,
    goalkeeperSave: `/bonus-games/goalkeepers/${slug}-save.webp`,
  } as const;
}

export const BONUS_GAME_SECTION_ARTWORK = '/bonus-games/section-card.webp';

export const BONUS_GAME_ASSETS = {
  beach: asset('beach'),
  'ski-resort': asset('ski-resort'),
  'cyberpunk-yard': asset('cyberpunk-yard'),
  'abandoned-waterpark': asset('abandoned-waterpark'),
  'pirate-bay': asset('pirate-bay'),
  'north-pole': asset('north-pole'),
  desert: asset('desert'),
  'volcanic-ice': asset('volcanic-ice'),
  castle: asset('castle'),
  space: asset('space'),
} as const;
