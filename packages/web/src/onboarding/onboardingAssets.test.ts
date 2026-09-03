import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const APPROVED_ONBOARDING_REFERENCES = [
  'amateur-bonus-games.webp',
  'amateur-declare-yourself.webp',
  'amateur-duels.webp',
  'amateur-inventory.webp',
  'amateur-tournaments.webp',
  'amateur-training.webp',
  'amateur-welcome.webp',
  'beginner-amateur-preview.webp',
  'beginner-daily-game.webp',
  'beginner-gameplay-example.webp',
  'beginner-road-to-amateur.webp',
  'beginner-start-journey.webp',
  'beginner-story-example.webp',
  'beginner-training.webp',
] as const;

describe('approved onboarding reference assets', () => {
  it.each(APPROVED_ONBOARDING_REFERENCES)('%s is a decodable 1200x1200 WebP', async (name) => {
    const image = sharp(resolve(process.cwd(), 'public/onboarding/reference', name));
    const metadata = await image.metadata();
    const decoded = await image.raw().toBuffer({ resolveWithObject: true });

    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(1200);
    expect(decoded.info).toMatchObject({ width: 1200, height: 1200 });
    expect(decoded.data.byteLength).toBeGreaterThan(0);
  });
});
