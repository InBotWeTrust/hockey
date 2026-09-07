import { resolve } from 'node:path';
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
