import { readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

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
