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

function hockeyCityAsset(slug: string) {
  const root = '/bonus-games/hockey-cities';
  return {
    arena: `${root}/arenas/${slug}.webp`,
    preview: `${root}/previews/${slug}.webp`,
    goalkeeperReady: `${root}/goalkeepers/${slug}-ready.webp`,
    goalkeeperSave: `${root}/goalkeepers/${slug}-save.webp`,
  } as const;
}

function nhlCityAsset(slug: string) {
  const root = '/bonus-games/nhl-cities';
  return {
    arena: `${root}/arenas/${slug}.webp`,
    preview: `${root}/previews/${slug}.webp`,
    goalkeeperReady: `${root}/goalkeepers/${slug}-ready.webp`,
    goalkeeperSave: `${root}/goalkeepers/${slug}-save.webp`,
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
  'buenos-aires': worldTourAsset('buenos-aires'),
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

export const HOCKEY_CITY_BONUS_GAME_ASSETS = {
  minsk: hockeyCityAsset('minsk'),
  shanghai: hockeyCityAsset('shanghai'),
  sochi: hockeyCityAsset('sochi'),
  tolyatti: hockeyCityAsset('tolyatti'),
  moscow: hockeyCityAsset('moscow'),
  'nizhny-novgorod': hockeyCityAsset('nizhny-novgorod'),
  cherepovets: hockeyCityAsset('cherepovets'),
  yaroslavl: hockeyCityAsset('yaroslavl'),
  kazan: hockeyCityAsset('kazan'),
  'saint-petersburg': hockeyCityAsset('saint-petersburg'),
  astana: hockeyCityAsset('astana'),
  nizhnekamsk: hockeyCityAsset('nizhnekamsk'),
  novosibirsk: hockeyCityAsset('novosibirsk'),
  vladivostok: hockeyCityAsset('vladivostok'),
  khabarovsk: hockeyCityAsset('khabarovsk'),
  ufa: hockeyCityAsset('ufa'),
  yekaterinburg: hockeyCityAsset('yekaterinburg'),
  omsk: hockeyCityAsset('omsk'),
  chelyabinsk: hockeyCityAsset('chelyabinsk'),
  magnitogorsk: hockeyCityAsset('magnitogorsk'),
} as const;

export const NHL_CITY_BONUS_GAME_ASSETS = {
  toronto: nhlCityAsset('toronto'),
  montreal: nhlCityAsset('montreal'),
  boston: nhlCityAsset('boston'),
  'new-york-metro': nhlCityAsset('new-york-metro'),
  philadelphia: nhlCityAsset('philadelphia'),
  washington: nhlCityAsset('washington'),
  pittsburgh: nhlCityAsset('pittsburgh'),
  detroit: nhlCityAsset('detroit'),
  chicago: nhlCityAsset('chicago'),
  nashville: nhlCityAsset('nashville'),
  dallas: nhlCityAsset('dallas'),
  denver: nhlCityAsset('denver'),
  'salt-lake-city': nhlCityAsset('salt-lake-city'),
  winnipeg: nhlCityAsset('winnipeg'),
  edmonton: nhlCityAsset('edmonton'),
  calgary: nhlCityAsset('calgary'),
  vancouver: nhlCityAsset('vancouver'),
  seattle: nhlCityAsset('seattle'),
  'los-angeles': nhlCityAsset('los-angeles'),
  'las-vegas': nhlCityAsset('las-vegas'),
} as const;
