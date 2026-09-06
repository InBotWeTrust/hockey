import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

describe('tournament achievement assets', () => {
  it.each(['regular-season-champion.webp', 'regular-season-medalist.webp'])(
    'ships %s as a 256px square WebP',
    async (filename) => {
      const metadata = await sharp(path.resolve('public/achievements', filename)).metadata();
      expect(metadata.format).toBe('webp');
      expect({ width: metadata.width, height: metadata.height }).toEqual({
        width: 256,
        height: 256,
      });
    },
  );
});
