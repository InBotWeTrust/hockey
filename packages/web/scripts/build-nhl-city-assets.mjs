import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const root = process.cwd();
const sourceRoot = path.resolve(root, 'assets/bonus-games/nhl-cities');
const publicRoot = path.resolve(root, 'public/bonus-games/nhl-cities');
const arenaLimit = 600 * 1024;
const goalkeeperLimit = 405 * 1024;
const previewLimit = 150 * 1024;
const goalkeeperCanvasSize = 500;
const readyVisibleHeight = 416;
const saveVisibleHeight = 403;
const bottomPadding = 42;

async function encodeWithinLimit(pipeline, destination, limit, qualities) {
  for (const quality of qualities) {
    await pipeline.clone().webp({ quality, effort: 6, alphaQuality: 100 }).toFile(destination);
    if ((await stat(destination)).size <= limit) return;
  }
  throw new Error(`${destination} exceeds ${limit} bytes`);
}

async function normaliseGoalkeeper(source, visibleHeight) {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) throw new Error(`No visible goalkeeper pixels in ${source}`);
  const sourceWidth = maxX - minX + 1;
  const sourceHeight = maxY - minY + 1;
  const targetWidth = Math.round((sourceWidth * visibleHeight) / sourceHeight);
  const left = Math.floor((goalkeeperCanvasSize - targetWidth) / 2);
  const top = goalkeeperCanvasSize - bottomPadding - visibleHeight;

  return sharp(source)
    .extract({ left: minX, top: minY, width: sourceWidth, height: sourceHeight })
    .resize(targetWidth, visibleHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .extend({
      top,
      bottom: goalkeeperCanvasSize - top - visibleHeight,
      left,
      right: goalkeeperCanvasSize - left - targetWidth,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
}

async function build(slug) {
  const sourceDir = path.join(sourceRoot, slug);
  const arenaDestination = path.join(publicRoot, 'arenas', `${slug}.webp`);
  const previewDestination = path.join(publicRoot, 'previews', `${slug}.webp`);
  const readyDestination = path.join(publicRoot, 'goalkeepers', `${slug}-ready.webp`);
  const saveDestination = path.join(publicRoot, 'goalkeepers', `${slug}-save.webp`);

  await Promise.all([
    mkdir(path.dirname(arenaDestination), { recursive: true }),
    mkdir(path.dirname(previewDestination), { recursive: true }),
    mkdir(path.dirname(readyDestination), { recursive: true }),
  ]);

  await encodeWithinLimit(
    sharp(path.join(sourceDir, 'arena.png')).resize(1212, 2000, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    }),
    arenaDestination,
    arenaLimit,
    [88, 84, 80, 76, 72],
  );
  await encodeWithinLimit(
    sharp(path.join(sourceDir, 'preview.png')).resize(600, 600, {
      fit: 'cover',
      position: 'attention',
      kernel: sharp.kernel.lanczos3,
    }),
    previewDestination,
    previewLimit,
    [86, 82, 78, 74, 70],
  );
  await encodeWithinLimit(
    await normaliseGoalkeeper(path.join(sourceDir, 'ready.png'), readyVisibleHeight),
    readyDestination,
    goalkeeperLimit,
    [90, 86, 82, 78, 74],
  );
  await encodeWithinLimit(
    await normaliseGoalkeeper(path.join(sourceDir, 'save.png'), saveVisibleHeight),
    saveDestination,
    goalkeeperLimit,
    [90, 86, 82, 78, 74],
  );
}

const [slug] = process.argv.slice(2);
if (!slug) throw new Error('Usage: node scripts/build-nhl-city-assets.mjs <slug>');
await build(slug);
