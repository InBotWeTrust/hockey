import { describe, expect, it } from 'vitest';
import { catalogBonusGameArtwork, versionBonusGameArtwork } from './bonusGameArtwork.js';

describe('catalogBonusGameArtwork', () => {
  it.each([['philadelphia', '20261012-philadelphia-v4'], ['chicago', '20261012-chicago-v2']])('refreshes the cache URL for the new %s preview', (city, version) => {
    expect(versionBonusGameArtwork(`/bonus-games/nhl-cities/previews/${city}.webp`)).toBe(`/bonus-games/nhl-cities/previews/${city}.webp?v=${version}`);
  });
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
