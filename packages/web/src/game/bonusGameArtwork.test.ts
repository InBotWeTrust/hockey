import { describe, expect, it } from 'vitest';
import { catalogBonusGameArtwork, versionBonusGameArtwork } from './bonusGameArtwork.js';

describe('catalogBonusGameArtwork', () => {
  it('versions challenge stories without invalidating unrelated artwork', () => {
    for (const folder of ['level-previews', 'finales']) {
      expect(versionBonusGameArtwork(`/bonus-games/${folder}/beach.webp`)).toBe(
        `/bonus-games/${folder}/beach.webp?v=20261007-challenge-story-v1`,
      );
    }
    expect(versionBonusGameArtwork('/bonus-games/arenas/beach.webp')).toContain('20261001-nhl-city-tours-v1');
    expect(versionBonusGameArtwork('/bonus-games/finales/beach.webp?v=42')).toBe('/bonus-games/finales/beach.webp?v=42');
  });
  it('uses a compact pre-cropped arena rendition and preserves the cache revision', () => {
    expect(catalogBonusGameArtwork('/bonus-games/arenas/beach.webp?v=42', 'compact')).toBe(
      '/bonus-games/arenas/compact/beach.webp?v=42',
    );
  });

  it('keeps a non-standard arena URL intact', () => {
    expect(catalogBonusGameArtwork('https://cdn.example.com/beach.webp', 'featured')).toBe(
      'https://cdn.example.com/beach.webp',
    );
  });
});

it('versions all new Rhythm city images without invalidating existing city caches', async () => {
  const {versionBonusGameGoalkeeper} = await import('./bonusGameArtwork.js');
  for (const slug of ['raleigh','columbus','buffalo','miami','ottawa','tampa','st-louis','saint-paul','anaheim','san-jose']) {
    for(const kind of ['arenas','previews'])
      expect(versionBonusGameArtwork(`/bonus-games/nhl-cities/${kind}/${slug}.webp`)).toContain('?v=20261018-rhythm-cities-v1');
    for(const pose of ['ready','save'])
      expect(versionBonusGameGoalkeeper(`/bonus-games/nhl-cities/goalkeepers/${slug}-${pose}.webp`)).toContain('?v=20261018-rhythm-cities-v1');
  }
  expect(versionBonusGameGoalkeeper('/bonus-games/nhl-cities/goalkeepers/toronto-ready.webp')).toContain('20261001-nhl-city-tours-v1');
});
