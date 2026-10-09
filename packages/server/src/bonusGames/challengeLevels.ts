import type { BonusChallengeEnvironmentRules } from '@hockey/game-core';

export type ChallengeLevel = 1 | 2 | 3;
const tieredSlugs = new Set(['challenge-beach', 'challenge-ski-resort', 'challenge-cyberpunk-yard']);

export function supportsChallengeLevels(slug: string): boolean {
  return tieredSlugs.has(slug);
}

export function buildChallengeLevelEnvironment(
  slug: string,
  level: ChallengeLevel,
  environment: BonusChallengeEnvironmentRules,
): BonusChallengeEnvironmentRules {
  const result = structuredClone(environment);
  if (!supportsChallengeLevels(slug)) return result;
  if (level < 3) {
    delete result.fatigue;
    delete result.stumbleWindows;
  }
  if (slug === 'challenge-beach' && result.beach && level === 1) result.beach.puddles = [];
  if (slug === 'challenge-ski-resort' && result.ski) {
    result.ski.slipsEnabled = level >= 2;
    result.ski.fatigueEnabled = level === 3;
  }
  if (slug === 'challenge-cyberpunk-yard' && result.cyberpunk) {
    result.cyberpunk.outagesEnabled = level >= 2;
    result.cyberpunk.fatigueEnabled = level === 3;
  }
  return result;
}

const levelStories: Record<string, readonly string[]> = {
  'challenge-beach': [
    'С моря поднялся ветер. Порывы сносят игрока, вратаря и даже ворота. Успей забить все шайбы, пока погода не разыгралась.',
    'Солнце припекло, и пляжный каток начал таять. На льду проступают лужи, а ветер всё ещё мешает играть. Успей забить все шайбы, пока площадку не залило приливом.',
    'Волны уже захлёстывают борт. Лёд тает, ветер сбивает с ног, а игроку всё чаще нужна передышка. Забей все шайбы, пока море не накрыло каток.',
  ],
  'challenge-ski-resort': [
    'Каток устроили прямо на горном склоне. С горы легко разогнаться, зато наверх придётся карабкаться. Успей закончить матч: в горах надвигается лавина.',
    'Снегопад усилился, и лёд стал скользким. Игрок, вратарь и ворота то и дело срываются вниз. Забей все шайбы, пока лавина не добралась до катка.',
    'Лавина всё ближе. Снег мешает держаться на склоне, а каждый подъём отнимает силы. Успей забить все шайбы, пока каток не засыпало.',
  ],
  'challenge-cyberpunk-yard': [
    'Во дворе сбоит электросеть. Магнитные полосы на льду мешают шайбе, но щитки ещё можно отключить. Забей все шайбы, пока авария не остановила матч.',
    'Авария добралась до освещения. Свет гаснет, а магнитные полосы продолжают работать даже в темноте. Успей закончить матч, пока сеть окончательно не отключилась.',
    'Сеть вот-вот выгорит. Магниты мешают броскам, свет пропадает, а игрок уже выбивается из сил. Забей все шайбы до полного отключения двора.',
  ],
};
export function challengeLevelPreview(slug: string, level: ChallengeLevel, fallbackArtwork: string): { preview_story: string; preview_artwork_url: string } {
  const artworkLocation = { 'challenge-beach': 'beach', 'challenge-ski-resort': 'ski', 'challenge-cyberpunk-yard': 'cyberpunk' }[slug];
  return { preview_story: levelStories[slug]?.[level - 1] ?? '', preview_artwork_url: artworkLocation ? `/bonus-games/level-previews/${artworkLocation}-level-${level}.webp` : fallbackArtwork };
}
