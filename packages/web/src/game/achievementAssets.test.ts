import { readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { placeholderArtworkForKind } from '../screens/inventoryArtwork.js';

const achievementAssetDirectory = path.resolve('public/achievements');
const achievementAssets = readdirSync(achievementAssetDirectory)
  .filter((filename) => filename.endsWith('.webp'))
  .sort();

describe('achievement assets', () => {
  it.each(achievementAssets)(
    'ships %s as a 1024px square WebP',
    async (filename) => {
      const metadata = await sharp(path.join(achievementAssetDirectory, filename)).metadata();
      expect(metadata.format).toBe('webp');
      expect({ width: metadata.width, height: metadata.height }).toEqual({
        width: 1024,
        height: 1024,
      });
    },
  );
});

describe('base inventory artwork', () => {
  it.each([
    ['stick', '/inventory/stick-base.webp'],
    ['skates', '/inventory/skates-base.webp'],
    ['nutrition', '/inventory/nutrition-none.webp'],
  ] as const)('ships the %s fallback as WebP', async (kind, expectedUrl) => {
    expect(placeholderArtworkForKind(kind)).toContain(expectedUrl);

    const metadata = await sharp(path.resolve('public', expectedUrl.slice(1))).metadata();
    expect(metadata.format).toBe('webp');
  });
});
