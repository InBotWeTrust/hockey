import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as bonusGameAssets from './bonusGameAssets';

const { BONUS_GAME_ASSETS, BONUS_GAME_SECTION_ARTWORK, WORLD_TOUR_BONUS_GAME_ASSETS } =
  bonusGameAssets;

const WORLD_TOUR_SLUGS = [
  'moscow',
  'istanbul',
  'rome',
  'paris',
  'london',
  'new-york',
  'rio-de-janeiro',
  'cape-town',
  'dubai',
  'mumbai',
  'singapore',
  'beijing',
  'tokyo',
] as const;

interface RawImage {
  data: Buffer;
  info: { width: number; height: number; channels: number };
}

interface SharpPipeline {
  removeAlpha(): SharpPipeline;
  raw(): SharpPipeline;
  toBuffer(options: { resolveWithObject: true }): Promise<RawImage>;
}

const require = createRequire(path.resolve('../server/package.json'));
const sharp = require('sharp') as (input: string) => SharpPipeline;

function readWebpDimensions(filePath: string): { width: number; height: number } {
  const bytes = readFileSync(filePath);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`Not a WebP file: ${filePath}`);
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunkType === 'VP8X') {
      return {
        width: bytes.readUIntLE(dataOffset + 4, 3) + 1,
        height: bytes.readUIntLE(dataOffset + 7, 3) + 1,
      };
    }
    if (chunkType === 'VP8 ') {
      return {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }
    if (chunkType === 'VP8L') {
      const bits = bytes.readUInt32LE(dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  throw new Error(`Missing WebP image chunk: ${filePath}`);
}

describe('bonus game runtime assets', () => {
  it('rebuilds arenas from the approved generated masters instead of legacy overlays', () => {
    const script = readFileSync(path.resolve('scripts/build-bonus-assets.mjs'), 'utf8');

    expect(script).toContain("assets/bonus-games/generated-arenas");
    expect(script).toContain("assets/bonus-games/generated-previews");
    expect(script).not.toContain("assets/bonus-games/textures");
    expect(script).not.toContain('amateur-daily-court.webp');
  });

  it('rebuilds World Tour arenas from each complete generated location without a second ice layer', () => {
    const script = readFileSync(path.resolve('scripts/build-world-tour-assets.mjs'), 'utf8');

    expect(script).toContain('assets/bonus-games/world-tour/generated-arenas');
    expect(script).not.toContain('amateur-daily-court.webp');
    expect(script).not.toContain('flagColourField');
    expect(script).not.toContain('createCanonicalMarkingLayer');
  });

  it('keeps the larger featured artwork height scoped to World Tour cards', () => {
    const styles = readFileSync(path.resolve('src/app/design-system.css'), 'utf8');

    expect(styles).toContain(
      '.bonus-game-card--featured .bonus-game-card__artwork-frame {\n  width: 100%;\n  height: 154px;',
    );
    expect(styles).toContain(
      '.bonus-game-card--featured.bonus-game-card--world-tour .bonus-game-card__artwork-frame {',
    );
    expect(styles).toContain('height: clamp(176px, 48vw, 204px);');
  });

  it('declares all approved bonus asset paths', () => {
    expect(Object.keys(BONUS_GAME_ASSETS)).toEqual([
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
    ]);
    expect(BONUS_GAME_SECTION_ARTWORK).toBe('/bonus-games/section-card.webp');

    const runtimePaths = [
      BONUS_GAME_SECTION_ARTWORK,
      ...Object.values(BONUS_GAME_ASSETS).flatMap((entry) => [
        entry.arena,
        entry.goalkeeperReady,
        entry.goalkeeperSave,
      ]),
    ];

    expect(runtimePaths).toHaveLength(31);
    for (const runtimePath of runtimePaths) {
      expect(existsSync(path.resolve('public', runtimePath.slice(1)))).toBe(true);
    }
  });

  it('keeps every bonus arena on the same 1212x2000 geometry as the live game court', () => {
    for (const entry of [
      ...Object.values(BONUS_GAME_ASSETS),
      ...Object.values(WORLD_TOUR_BONUS_GAME_ASSETS),
    ]) {
      const filePath = path.resolve('public', entry.arena.slice(1));
      expect(readWebpDimensions(filePath), entry.arena).toEqual({ width: 1212, height: 2000 });
    }
  });

  it('keeps every themed ice treatment visibly distinct from the daily court at the rink edges', async () => {
    const master = await sharp(path.resolve('public/sprites/amateur-daily-court.webp'))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (const entry of Object.values(BONUS_GAME_ASSETS)) {
      const arena = await sharp(path.resolve('public', entry.arena.slice(1)))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let totalDifference = 0;
      let samples = 0;

      for (let y = 840; y < 1900; y += 4) {
        for (const [startX, endX] of [
          [0, 260],
          [952, 1212],
        ] as const) {
          for (let x = startX; x < endX; x += 4) {
            for (let channel = 0; channel < 3; channel += 1) {
              const offset = (y * arena.info.width + x) * arena.info.channels + channel;
              totalDifference += Math.abs(arena.data[offset]! - master.data[offset]!);
              samples += 1;
            }
          }
        }
      }

      const averageDifference = totalDifference / samples;
      expect(averageDifference, entry.arena).toBeGreaterThanOrEqual(3.5);
    }
  });

  it('keeps every themed ice treatment visibly distinct from the other bonus arenas', async () => {
    const arenas = await Promise.all(
      Object.values(BONUS_GAME_ASSETS).map(async (entry) => ({
        path: entry.arena,
        image: await sharp(path.resolve('public', entry.arena.slice(1)))
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true }),
      })),
    );

    for (let leftIndex = 0; leftIndex < arenas.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < arenas.length; rightIndex += 1) {
        const left = arenas[leftIndex]!;
        const right = arenas[rightIndex]!;
        let totalDifference = 0;
        let samples = 0;

        for (let y = 840; y < 1900; y += 8) {
          for (const [startX, endX] of [
            [0, 260],
            [952, 1212],
          ] as const) {
            for (let x = startX; x < endX; x += 8) {
              for (let channel = 0; channel < 3; channel += 1) {
                const leftOffset =
                  (y * left.image.info.width + x) * left.image.info.channels + channel;
                const rightOffset =
                  (y * right.image.info.width + x) * right.image.info.channels + channel;
                totalDifference += Math.abs(
                  left.image.data[leftOffset]! - right.image.data[rightOffset]!,
                );
                samples += 1;
              }
            }
          }
        }

        expect(totalDifference / samples, `${left.path} vs ${right.path}`).toBeGreaterThanOrEqual(
          5,
        );
      }
    }
  });

  it('ships one square WebP location card for every bonus preview', () => {
    for (const slug of Object.keys(BONUS_GAME_ASSETS)) {
      const previewPath = path.resolve('public/bonus-games/location-cards', `${slug}.webp`);
      expect(existsSync(previewPath), slug).toBe(true);
      expect(readWebpDimensions(previewPath), slug).toEqual({ width: 1254, height: 1254 });
    }
  });

  it('declares the complete 13-city World Tour runtime asset set', () => {
    const worldTour = (
      bonusGameAssets as unknown as {
        WORLD_TOUR_BONUS_GAME_ASSETS?: Record<
          string,
          {
            arena: string;
            preview: string;
            goalkeeperReady: string;
            goalkeeperSave: string;
          }
        >;
      }
    ).WORLD_TOUR_BONUS_GAME_ASSETS;

    expect(worldTour).toBeDefined();
    expect(Object.keys(worldTour ?? {})).toEqual(WORLD_TOUR_SLUGS);

    for (const slug of WORLD_TOUR_SLUGS) {
      const entry = worldTour?.[slug];
      expect(entry).toEqual({
        arena: `/bonus-games/world-tour/arenas/${slug}.webp`,
        preview: `/bonus-games/world-tour/previews/${slug}.webp`,
        goalkeeperReady: `/bonus-games/world-tour/goalkeepers/${slug}-ready.webp`,
        goalkeeperSave: `/bonus-games/world-tour/goalkeepers/${slug}-save.webp`,
      });
      expect(readWebpDimensions(path.resolve('public', entry!.arena.slice(1)))).toEqual({
        width: 1212,
        height: 2000,
      });
      expect(readWebpDimensions(path.resolve('public', entry!.preview.slice(1)))).toEqual({
        width: 1254,
        height: 1254,
      });
      expect(existsSync(path.resolve('public', entry!.goalkeeperReady.slice(1)))).toBe(true);
      expect(existsSync(path.resolve('public', entry!.goalkeeperSave.slice(1)))).toBe(true);
    }
  });

  it('keeps the upper goal line aligned with the daily-court master at Y=779', async () => {
    for (const entry of [
      ...Object.values(BONUS_GAME_ASSETS),
      ...Object.values(WORLD_TOUR_BONUS_GAME_ASSETS),
    ]) {
      const filePath = path.resolve('public', entry.arena.slice(1));
      const { data, info } = await sharp(filePath)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const candidates: Array<{ y: number; warmLineSignal: number }> = [];

      // Search tightly around the fixed goal-line guide so stronger red details
      // from the nearby faceoff circles cannot mask a deliberately faded line.
      for (let y = 775; y <= 783; y += 1) {
        let warmLineSignal = 0;
        for (const [startX, endX] of [
          [80, 400],
          [812, 1132],
        ] as const) {
          for (let x = startX; x < endX; x += 1) {
            const offset = (y * info.width + x) * info.channels;
            const red = data[offset]!;
            const green = data[offset + 1]!;
            const blue = data[offset + 2]!;
            // Red and cyberpunk magenta both separate from the cool ice by
            // carrying substantially less green than their red/blue channels.
            warmLineSignal += red + blue - 2 * green;
          }
        }
        candidates.push({ y, warmLineSignal });
      }

      candidates.sort((left, right) => right.warmLineSignal - left.warmLineSignal);
      expect(Math.abs(candidates[0]!.y - 779), entry.arena).toBeLessThanOrEqual(1);
    }
  });
});
