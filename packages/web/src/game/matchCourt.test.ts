import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AMATEUR_DAILY_COURT_BACKGROUND, AMATEUR_TOURNAMENT_COURT_BACKGROUND } from './matchCourt.js';

const expectedUrl = '/sprites/amateur-central-empty-2ef71ce6f102.webp';
const courts = [
  expectedUrl,
  '/sprites/amateur-central-half-c950229b0ea9.webp',
  '/sprites/amateur-central-full-6b9cc1c314c7.webp',
];

describe('Central indoor amateur match artwork', () => {
  it.each(courts)('continues textured ice to the bottom without letterboxing: %s', async (url) => {
    const { data, info } = await sharp(path.join('public', url)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = info.height - 11; y < info.height; y++) {
      const values = Array.from({ length: info.width - 40 }, (_, x) => {
        const i = (y * info.width + x + 20) * info.channels;
        return (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      });
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      expect(Math.sqrt(variance), `ice texture at row ${y}`).toBeGreaterThan(4);
      expect(mean, `ice brightness at row ${y}`).toBeLessThan(225);
    }
  });
  it('uses an empty daily court and a full standard tournament court', () => {
    expect(AMATEUR_DAILY_COURT_BACKGROUND).toBe(expectedUrl);
    expect(AMATEUR_TOURNAMENT_COURT_BACKGROUND).toBe('/sprites/amateur-central-full-6b9cc1c314c7.webp');
  });

  it.each(courts)('ships opaque WebP with a content-matching filename and mobile byte budget: %s', async (url) => {
    const bytes = await readFile(path.join('public', url));
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.hasAlpha).toBe(false);
    expect([metadata.width, metadata.height]).toEqual([1212, 2000]);
    expect(bytes.length).toBeLessThanOrEqual(350 * 1024);
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    expect(url.endsWith(`-${hash}.webp`)).toBe(true);
  });

  it.each(courts)('aligns the end line without actor offsets: %s', async (url) => {
    const { data, info } = await sharp(path.join('public', url)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
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
