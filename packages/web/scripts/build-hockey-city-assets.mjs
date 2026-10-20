import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const root = process.cwd();
const sourceRoot = path.resolve(root, 'assets/bonus-games/hockey-cities');
const publicRoot = path.resolve(root, 'public/bonus-games');
const arenaLimit = 600 * 1024;
const goalkeeperLimit = 405 * 1024;
const previewLimit = 150 * 1024;
const readyNormalisationSlugs = new Set([
  'astana',
  'shanghai',
  'khabarovsk',
  'yekaterinburg',
  'cherepovets',
  'yaroslavl',
  'kazan',
  'saint-petersburg',
  'magnitogorsk',
]);
const goalkeeperCanvasSize = 500;
const readyVisibleHeight = 416;
const readyBottomPadding = 42;
const arenaVerticalOffsets = {
  astana: 45,
  nizhnekamsk: -5,
  novosibirsk: -5,
  vladivostok: 5,
  khabarovsk: -20,
  ufa: -5,
  yekaterinburg: -25,
  omsk: -5,
  chelyabinsk: -5,
  magnitogorsk: -5,
  minsk: -5,
  shanghai: -5,
  sochi: -5,
  tolyatti: -5,
  moscow: -5,
  'nizhny-novgorod': -5,
  cherepovets: -5,
  yaroslavl: -5,
  kazan: -5,
  'saint-petersburg': -15,
};

async function encodeWithinLimit(pipeline, destination, limit, qualities) {
  for (const quality of qualities) {
    await pipeline.clone().webp({ quality, effort: 6, alphaQuality: 100 }).toFile(destination);
    if ((await stat(destination)).size <= limit) return;
  }
  throw new Error(`${destination} exceeds ${limit} bytes`);
}

async function normaliseReadyGoalkeeper(source) {
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
  const visibleWidth = maxX - minX + 1;
  const visibleHeight = maxY - minY + 1;
  const targetWidth = Math.round((visibleWidth * readyVisibleHeight) / visibleHeight);
  const left = Math.floor((goalkeeperCanvasSize - targetWidth) / 2);
  const top = goalkeeperCanvasSize - readyBottomPadding - readyVisibleHeight;

  return sharp(source)
    .extract({ left: minX, top: minY, width: visibleWidth, height: visibleHeight })
    .resize(targetWidth, readyVisibleHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .extend({
      top,
      bottom: goalkeeperCanvasSize - top - readyVisibleHeight,
      left,
      right: goalkeeperCanvasSize - left - targetWidth,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
}

async function build(slug, collection = 'hockey-cities', readyOnly = false) {
  const sourceDir = path.join(sourceRoot, slug);
  const runtimeDir = path.join(publicRoot, collection);
  const arenaDestination = path.join(runtimeDir, 'arenas', `${slug}.webp`);
  const previewDestination = path.join(runtimeDir, 'previews', `${slug}.webp`);
  const readyDestination = path.join(runtimeDir, 'goalkeepers', `${slug}-ready.webp`);
  const saveDestination = path.join(runtimeDir, 'goalkeepers', `${slug}-save.webp`);
  await mkdir(path.dirname(readyDestination), { recursive: true });

  if (!readyOnly) {
    await Promise.all([
      mkdir(path.dirname(arenaDestination), { recursive: true }),
      mkdir(path.dirname(previewDestination), { recursive: true }),
    ]);

    let arena = sharp(path.join(sourceDir, 'arena.png')).resize(1212, 2000, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    });
    const arenaVerticalOffset = arenaVerticalOffsets[slug] ?? 0;
    if (arenaVerticalOffset > 0) {
      arena = arena
        .extract({ left: 0, top: 0, width: 1212, height: 2000 - arenaVerticalOffset })
        .extend({ top: arenaVerticalOffset, extendWith: 'copy' });
    } else if (arenaVerticalOffset < 0) {
      const shiftUp = Math.abs(arenaVerticalOffset);
      arena = arena
        .extract({ left: 0, top: shiftUp, width: 1212, height: 2000 - shiftUp })
        .extend({ bottom: shiftUp, extendWith: 'copy' });
    }
    await encodeWithinLimit(arena, arenaDestination, arenaLimit, [88, 84, 80, 76, 72]);
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
  }

  for (const [pose, destination] of [
    ['ready', readyDestination],
    ['save', saveDestination],
  ]) {
    if (readyOnly && pose !== 'ready') continue;
    const source = path.join(sourceDir, `${pose}.png`);
    const goalkeeper =
      pose === 'ready' && readyNormalisationSlugs.has(slug)
        ? await normaliseReadyGoalkeeper(source)
        : sharp(source).resize(500, 500, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            kernel: sharp.kernel.lanczos3,
          });
    await encodeWithinLimit(goalkeeper, destination, goalkeeperLimit, [90, 86, 82, 78, 74]);
  }
}

const [slug, collection, mode] = process.argv.slice(2);
if (!slug) {
  throw new Error(
    'Usage: node scripts/build-hockey-city-assets.mjs <slug> [collection] [--ready-only]',
  );
}
await build(slug, collection, mode === '--ready-only');
