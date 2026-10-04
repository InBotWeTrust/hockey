import { resolve } from 'node:path';
import { statSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const AMATEUR_ONBOARDING_REFERENCES = [
  'amateur-bonus-games.webp',
  'amateur-declare-yourself.webp',
  'amateur-duels.webp',
  'amateur-inventory.webp',
  'amateur-tournaments.webp',
  'amateur-training.webp',
  'amateur-welcome.webp',
] as const;

const BEGINNER_ONBOARDING_REFERENCES = [
  'beginner-last-on-ice.webp',
  'beginner-one-shot.webp',
  'beginner-result-goal.webp',
  'beginner-result-miss.webp',
  'beginner-daily-game.webp',
  'beginner-training.webp',
  'beginner-road-to-amateur.webp',
  'beginner-amateur-preview.webp',
  'beginner-start-journey.webp',
] as const;

describe('approved onboarding reference assets', () => {
  it.each(AMATEUR_ONBOARDING_REFERENCES)('%s is a decodable 1200x1200 WebP', async (name) => {
    const image = sharp(resolve(process.cwd(), 'public/onboarding/reference', name));
    const metadata = await image.metadata();
    const decoded = await image.raw().toBuffer({ resolveWithObject: true });

    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(1200);
    expect(decoded.info).toMatchObject({ width: 1200, height: 1200 });
    expect(decoded.data.byteLength).toBeGreaterThan(0);
  });

  it.each(BEGINNER_ONBOARDING_REFERENCES)('%s is a decodable 800x800 WebP', async (name) => {
    const image = sharp(resolve(process.cwd(), 'public/onboarding/reference', name));
    const metadata = await image.metadata();
    const decoded = await image.raw().toBuffer({ resolveWithObject: true });

    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(800);
    expect(decoded.info).toMatchObject({ width: 800, height: 800 });
    expect(decoded.data.byteLength).toBeGreaterThan(0);
  });
});

describe('amateur story frame pairs', () => {
  it.each(Array.from({ length: 6 }, (_, i) => String(i + 1).padStart(2, '0')))('scene %s has two optimized portrait WebP frames', async (scene) => {
    for (const frame of ['a', 'b']) {
      const path = resolve(process.cwd(), `public/onboarding/amateur/scene-${scene}-${frame}.webp`);
      const metadata = await sharp(path).metadata();
      expect(metadata).toMatchObject({ format: 'webp', width: 941, height: 1672 });
      expect(statSync(path).size).toBeLessThan(400 * 1024);
      expect((await sharp(path).raw().toBuffer()).byteLength).toBeGreaterThan(0);
    }
  });
});
