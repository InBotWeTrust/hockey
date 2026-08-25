import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const GOALKEEPER_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../web/public/bonus-games/goalkeepers',
);

const SLUGS = [
  'beach',
  'ski-resort',
  'cyberpunk-yard',
  'abandoned-waterpark',
  'pirate-bay',
  'north-pole',
  'desert',
  'volcanic-ice',
  'castle',
  'space',
] as const;

async function visibleBounds(filePath: string): Promise<{ width: number; height: number }> {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) throw new Error(`Transparent goalkeeper asset: ${filePath}`);
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

describe('bonus goalkeeper asset framing', () => {
  it.each(SLUGS)(
    'keeps %s ready and save poses proportioned like training sprites',
    async (slug) => {
      const ready = await visibleBounds(path.join(GOALKEEPER_DIR, `${slug}-ready.webp`));
      const save = await visibleBounds(path.join(GOALKEEPER_DIR, `${slug}-save.webp`));

      expect(ready.width).toBeGreaterThanOrEqual(820);
      expect(ready.width).toBeLessThanOrEqual(850);
      expect(ready.height).toBeGreaterThanOrEqual(815);
      expect(ready.height).toBeLessThanOrEqual(860);

      expect(save.width).toBeGreaterThanOrEqual(850);
      expect(save.width).toBeLessThanOrEqual(1_015);
      expect(save.height).toBeGreaterThanOrEqual(745);
      expect(save.height).toBeLessThanOrEqual(815);
      expect(save.width / ready.width).toBeGreaterThanOrEqual(1.02);
      expect(save.height / ready.height).toBeGreaterThanOrEqual(0.88);
      expect(save.height / ready.height).toBeLessThanOrEqual(0.99);
    },
  );
});
