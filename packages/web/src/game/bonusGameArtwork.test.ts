import { describe, expect, it } from 'vitest';
import { catalogBonusGameArtwork } from './bonusGameArtwork.js';

describe('catalogBonusGameArtwork', () => {
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
