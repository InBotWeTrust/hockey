function asset(slug: string) {
  return {
    arena: `/bonus-games/arenas/${slug}.webp`,
    goalkeeperReady: `/bonus-games/goalkeepers/${slug}-ready.webp`,
    goalkeeperSave: `/bonus-games/goalkeepers/${slug}-save.webp`,
  } as const;
}

function worldTourAsset(slug: string) {
  return {
    arena: `/bonus-games/world-tour/arenas/${slug}.webp`,
    preview: `/bonus-games/world-tour/previews/${slug}.webp`,
    goalkeeperReady: `/bonus-games/world-tour/goalkeepers/${slug}-ready.webp`,
    goalkeeperSave: `/bonus-games/world-tour/goalkeepers/${slug}-save.webp`,
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

export const WORLD_TOUR_BONUS_GAME_ASSETS = {
  moscow: worldTourAsset('moscow'),
  istanbul: worldTourAsset('istanbul'),
  rome: worldTourAsset('rome'),
  paris: worldTourAsset('paris'),
  london: worldTourAsset('london'),
  'new-york': worldTourAsset('new-york'),
  'rio-de-janeiro': worldTourAsset('rio-de-janeiro'),
  'cape-town': worldTourAsset('cape-town'),
  dubai: worldTourAsset('dubai'),
  mumbai: worldTourAsset('mumbai'),
  singapore: worldTourAsset('singapore'),
  beijing: worldTourAsset('beijing'),
  tokyo: worldTourAsset('tokyo'),
} as const;
