import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const GOALKEEPER_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../web/public/bonus-games/goalkeepers',
);
const WORLD_TOUR_GOALKEEPER_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../web/public/bonus-games/world-tour/goalkeepers',
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

async function visibleBounds(
  filePath: string,
  minimumAlpha = 8,
): Promise<{ width: number; height: number }> {
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
      if (data[(y * info.width + x) * info.channels + 3] <= minimumAlpha) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) throw new Error(`Transparent goalkeeper asset: ${filePath}`);
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function visibleFill(filePath: string): Promise<{
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
}> {
  const metadata = await sharp(filePath).metadata();
  const bounds = await visibleBounds(filePath, 8);
  if (!metadata.width || !metadata.height) throw new Error(`Missing dimensions: ${filePath}`);
  return {
    ...bounds,
    canvasWidth: metadata.width,
    canvasHeight: metadata.height,
  };
}

async function visibleAlphaComponentSizes(filePath: string): Promise<number[]> {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const visited = new Uint8Array(info.width * info.height);
  const sizes: number[] = [];

  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] !== 0 || data[start * info.channels + 3]! <= 8) continue;
    const queue = [start];
    visited[start] = 1;
    let size = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const pixel = queue[cursor]!;
      const x = pixel % info.width;
      const y = Math.floor(pixel / info.width);
      size += 1;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextY < 0 || nextX >= info.width || nextY >= info.height) continue;
          const next = nextY * info.width + nextX;
          if (visited[next] !== 0 || data[next * info.channels + 3]! <= 8) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    sizes.push(size);
  }

  return sizes.sort((left, right) => right - left);
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

  it.each(WORLD_TOUR_SLUGS)(
    'matches %s World Tour ready and save framing to the training goalkeeper',
    async (slug) => {
      const readyPath = path.join(WORLD_TOUR_GOALKEEPER_DIR, `${slug}-ready.webp`);
      const savePath = path.join(WORLD_TOUR_GOALKEEPER_DIR, `${slug}-save.webp`);
      const trainingReadyPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../web/public/sprites/training-goalie-amateur.webp',
      );
      const trainingSavePath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../web/public/sprites/training-goalie-amateur-save.webp',
      );
      const [readyMetadata, saveMetadata] = await Promise.all([
        sharp(readyPath).metadata(),
        sharp(savePath).metadata(),
      ]);

      expect(readyMetadata.hasAlpha, `${slug} ready alpha`).toBe(true);
      expect(saveMetadata.hasAlpha, `${slug} save alpha`).toBe(true);
      expect([readyMetadata.width, readyMetadata.height]).toEqual([1_254, 1_254]);
      expect([saveMetadata.width, saveMetadata.height]).toEqual([1_254, 1_254]);

      const [ready, save, trainingReady, trainingSave] = await Promise.all([
        visibleFill(readyPath),
        visibleFill(savePath),
        visibleFill(trainingReadyPath),
        visibleFill(trainingSavePath),
      ]);
      const readyHeightRatio =
        ready.height / ready.canvasHeight / (trainingReady.height / trainingReady.canvasHeight);
      const saveHeightRatio =
        save.height / save.canvasHeight / (trainingSave.height / trainingSave.canvasHeight);
      const readyWidthRatio =
        ready.width / ready.canvasWidth / (trainingReady.width / trainingReady.canvasWidth);
      const saveWidthRatio =
        save.width / save.canvasWidth / (trainingSave.width / trainingSave.canvasWidth);

      expect(readyHeightRatio, `${slug} ready height`).toBeGreaterThanOrEqual(0.95);
      expect(readyHeightRatio, `${slug} ready height`).toBeLessThanOrEqual(1.05);
      expect(saveHeightRatio, `${slug} save height`).toBeGreaterThanOrEqual(0.95);
      expect(saveHeightRatio, `${slug} save height`).toBeLessThanOrEqual(1.1);
      expect(readyWidthRatio, `${slug} ready width`).toBeGreaterThanOrEqual(0.85);
      expect(readyWidthRatio, `${slug} ready width`).toBeLessThanOrEqual(1.08);
      expect(saveWidthRatio, `${slug} save width`).toBeGreaterThanOrEqual(0.84);
      expect(saveWidthRatio, `${slug} save width`).toBeLessThanOrEqual(1.05);
    },
  );

  it.each(WORLD_TOUR_SLUGS)(
    'removes disconnected alpha noise from %s World Tour poses',
    async (slug) => {
      const [readyComponents, saveComponents] = await Promise.all([
        visibleAlphaComponentSizes(path.join(WORLD_TOUR_GOALKEEPER_DIR, `${slug}-ready.webp`)),
        visibleAlphaComponentSizes(path.join(WORLD_TOUR_GOALKEEPER_DIR, `${slug}-save.webp`)),
      ]);

      expect(readyComponents, `${slug} ready components`).toHaveLength(1);
      expect(saveComponents, `${slug} save components`).toHaveLength(1);
    },
  );
});
