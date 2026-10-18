import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AMATEUR_DAILY_COURT_BACKGROUND, AMATEUR_TOURNAMENT_COURT_BACKGROUND } from './matchCourt.js';

const expectedUrl = '/sprites/amateur-central-indoor-00eb88ddee05.webp';

describe('Central indoor amateur match artwork', () => {
  it('uses one content-versioned background for ordinary daily, duel and tournament courts', () => {
    expect(AMATEUR_DAILY_COURT_BACKGROUND).toBe(expectedUrl);
    expect(AMATEUR_TOURNAMENT_COURT_BACKGROUND).toBe(expectedUrl);
  });

  it('ships the aligned WebP with a content-matching filename and mobile byte budget', async () => {
    const bytes = await readFile(path.join('public', expectedUrl));
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect([metadata.width, metadata.height]).toEqual([1212, 2000]);
    expect(bytes.length).toBeLessThanOrEqual(350 * 1024);
    expect(createHash('sha256').update(bytes).digest('hex').slice(0, 12)).toBe('00eb88ddee05');
  });

  it('bakes the agreed nine-source-pixel lift into the end line without actor offsets', async () => {
    const { data, info } = await sharp(path.join('public', expectedUrl)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const signal = (x: number, y: number): number => {
      let sum = 0;
      for (let dx = -4; dx <= 4; dx++) {
        const i = (y * info.width + x + dx) * info.channels;
        sum += data[i]! + data[i + 2]! - 2 * data[i + 1]!;
      }
      return sum / 9;
    };
    for (const x of [400, 812]) {
      let peak = { y: 755, contrast: -Infinity };
      for (let y = 755; y <= 790; y++) {
        const contrast = signal(x, y) - (signal(x, y - 5) + signal(x, y + 5)) / 2;
        if (contrast > peak.contrast) peak = { y, contrast };
      }
      expect(peak.contrast).toBeGreaterThan(3);
      expect(Math.abs(peak.y - 770)).toBeLessThanOrEqual(1);
    }
  });
});

