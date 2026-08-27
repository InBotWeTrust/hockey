import { mkdir, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '../server/package.json'));
const sharp = require('sharp');

const ARENA_WIDTH = 1212;
const ARENA_HEIGHT = 2000;
const GOAL_LINE_Y = 779;

const worldTourArenaSourceDir = path.join(
  root,
  'assets/bonus-games/world-tour/generated-arenas',
);
const worldTourArenaDir = path.join(root, 'public/bonus-games/world-tour/arenas');
const worldTourGoalkeeperSourceDir = path.join(
  root,
  'assets/bonus-games/world-tour/generated-goalkeepers',
);
const worldTourGoalkeeperDir = path.join(
  root,
  'public/bonus-games/world-tour/goalkeepers',
);
const approvedArenas = [
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
];

async function detectSourceGoalLineY(sourcePath) {
  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const startY = Math.round(info.height * 0.32);
  const endY = Math.round(info.height * 0.54);
  const rowSignals = new Map();

  for (let y = startY - 8; y <= endY + 8; y += 1) {
    let signal = 0;
    let samples = 0;
    for (const [startRatio, endRatio] of [
      [0.05, 0.4],
      [0.6, 0.95],
    ]) {
      for (let x = Math.round(info.width * startRatio); x < info.width * endRatio; x += 2) {
        const offset = (y * info.width + x) * info.channels;
        signal += data[offset] + data[offset + 2] - 2 * data[offset + 1];
        samples += 1;
      }
    }
    rowSignals.set(y, signal / samples);
  }

  let best = { y: startY, prominence: Number.NEGATIVE_INFINITY };
  for (let y = startY; y <= endY; y += 1) {
    const neighbours = [-8, -6, -4, 4, 6, 8].map((offset) => rowSignals.get(y + offset));
    const baseline = neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length;
    const prominence = rowSignals.get(y) - baseline;
    if (prominence > best.prominence) best = { y, prominence };
  }
  return best.y;
}

async function buildArena(slug) {
  const sourcePath = path.join(worldTourArenaSourceDir, `${slug}-approved-source.png`);
  const outputPath = path.join(worldTourArenaDir, `${slug}.webp`);
  const temporaryPath = path.join(worldTourArenaDir, `.${slug}.tmp.webp`);
  const sourceMetadata = await sharp(sourcePath).metadata();

  if (!sourceMetadata.height) {
    throw new Error(`Missing source height for ${slug}`);
  }

  const sourceGoalLineY = await detectSourceGoalLineY(sourcePath);
  console.log(`${slug}: source goal line ${sourceGoalLineY}`);

  // Keep the approved location as one coherent image. The two contiguous
  // pieces only normalise its vertical geometry so the source goal line maps
  // to the fixed gameplay line at Y=779; no second rink or marking layer is
  // introduced.
  const upper = await sharp(sourcePath)
    .extract({
      left: 0,
      top: 0,
      width: sourceMetadata.width,
      height: sourceGoalLineY + 1,
    })
    .resize(ARENA_WIDTH, GOAL_LINE_Y + 1, { fit: 'fill' })
    .toBuffer();
  const lower = await sharp(sourcePath)
    .extract({
      left: 0,
      top: sourceGoalLineY + 1,
      width: sourceMetadata.width,
      height: sourceMetadata.height - sourceGoalLineY - 1,
    })
    .resize(ARENA_WIDTH, ARENA_HEIGHT - GOAL_LINE_Y - 1, { fit: 'fill' })
    .toBuffer();

  await sharp({
    create: {
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT,
      channels: 3,
      background: '#eaf1f8',
    },
  })
    .composite([
      { input: upper, left: 0, top: 0 },
      { input: lower, left: 0, top: GOAL_LINE_Y + 1 },
    ])
    .webp({ quality: 92 })
    .toFile(temporaryPath);
  await rename(temporaryPath, outputPath);

  const { data, info } = await sharp(outputPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const candidates = [];
  for (let y = 775; y <= 783; y += 1) {
    let warmLineSignal = 0;
    for (const [startX, endX] of [
      [80, 400],
      [812, 1132],
    ]) {
      for (let x = startX; x < endX; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        warmLineSignal += data[offset] + data[offset + 2] - 2 * data[offset + 1];
      }
    }
    candidates.push({ y, warmLineSignal });
  }
  candidates.sort((left, right) => right.warmLineSignal - left.warmLineSignal);
  if (Math.abs(candidates[0].y - GOAL_LINE_Y) > 1) {
    throw new Error(`${slug}: expected goal line at ${GOAL_LINE_Y}, got ${candidates[0].y}`);
  }
}

async function visibleAlphaBounds(input) {
  const { data, info } = await sharp(input)
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

  if (maxX < minX || maxY < minY) throw new Error('Goalkeeper source is fully transparent');
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function retainLargestAlphaComponent(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const labels = new Uint32Array(info.width * info.height);
  const queue = new Uint32Array(info.width * info.height);
  const sizes = [0];
  let label = 0;

  for (let start = 0; start < labels.length; start += 1) {
    if (labels[start] !== 0 || data[start * info.channels + 3] <= 8) continue;
    label += 1;
    let queueStart = 0;
    let queueEnd = 1;
    let size = 0;
    queue[0] = start;
    labels[start] = label;

    while (queueStart < queueEnd) {
      const pixel = queue[queueStart];
      queueStart += 1;
      size += 1;
      const x = pixel % info.width;
      const y = Math.floor(pixel / info.width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextY < 0 || nextX >= info.width || nextY >= info.height) continue;
          const next = nextY * info.width + nextX;
          if (labels[next] !== 0 || data[next * info.channels + 3] <= 8) continue;
          labels[next] = label;
          queue[queueEnd] = next;
          queueEnd += 1;
        }
      }
    }
    sizes.push(size);
  }

  if (label === 0) throw new Error('Goalkeeper source is fully transparent');
  let largestLabel = 1;
  for (let candidate = 2; candidate < sizes.length; candidate += 1) {
    if (sizes[candidate] > sizes[largestLabel]) largestLabel = candidate;
  }
  for (let pixel = 0; pixel < labels.length; pixel += 1) {
    if (labels[pixel] !== largestLabel) data[pixel * info.channels + 3] = 0;
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

async function buildGoalkeeper(slug, pose) {
  const sourcePath = path.join(
    worldTourGoalkeeperSourceDir,
    `${slug}-${pose}-source.png`,
  );
  const outputPath = path.join(worldTourGoalkeeperDir, `${slug}-${pose}.webp`);
  const temporaryPath = path.join(worldTourGoalkeeperDir, `.${slug}-${pose}.tmp.webp`);
  const sourceMetadata = await sharp(sourcePath).metadata();
  let source;

  if (sourceMetadata.hasAlpha) {
    source = sharp(sourcePath);
  } else {
    const { data, info } = await sharp(sourcePath)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rgba = Buffer.alloc(info.width * info.height * 4);
    const background = new Uint8Array(info.width * info.height);
    const queue = new Uint32Array(info.width * info.height);
    let queueStart = 0;
    let queueEnd = 0;

    const isLightNeutral = (pixelIndex) => {
      const offset = pixelIndex * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      return Math.min(red, green, blue) >= 230 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 8;
    };
    const enqueueBackground = (pixelIndex) => {
      if (background[pixelIndex] !== 0 || !isLightNeutral(pixelIndex)) return;
      background[pixelIndex] = 1;
      queue[queueEnd] = pixelIndex;
      queueEnd += 1;
    };

    for (let x = 0; x < info.width; x += 1) {
      enqueueBackground(x);
      enqueueBackground((info.height - 1) * info.width + x);
    }
    for (let y = 0; y < info.height; y += 1) {
      enqueueBackground(y * info.width);
      enqueueBackground(y * info.width + info.width - 1);
    }

    while (queueStart < queueEnd) {
      const pixelIndex = queue[queueStart];
      queueStart += 1;
      const x = pixelIndex % info.width;
      const y = Math.floor(pixelIndex / info.width);
      if (x > 0) enqueueBackground(pixelIndex - 1);
      if (x + 1 < info.width) enqueueBackground(pixelIndex + 1);
      if (y > 0) enqueueBackground(pixelIndex - info.width);
      if (y + 1 < info.height) enqueueBackground(pixelIndex + info.width);
    }

    for (let pixelIndex = 0; pixelIndex < info.width * info.height; pixelIndex += 1) {
      const sourceOffset = pixelIndex * info.channels;
      const targetOffset = pixelIndex * 4;
      rgba[targetOffset] = data[sourceOffset];
      rgba[targetOffset + 1] = data[sourceOffset + 1];
      rgba[targetOffset + 2] = data[sourceOffset + 2];
      rgba[targetOffset + 3] = background[pixelIndex] === 1 ? 0 : 255;
    }

    source = sharp(rgba, {
      raw: { width: info.width, height: info.height, channels: 4 },
    });
  }

  const sourceBuffer = await retainLargestAlphaComponent(await source.png().toBuffer());
  const sourceBounds = await visibleAlphaBounds(sourceBuffer);
  const trimmed = await sharp(sourceBuffer).extract(sourceBounds).png().toBuffer();
  const target =
    pose === 'save'
      ? { canvasWidth: 1354, canvasHeight: 1254, width: 1340, height: 989 }
      : { canvasWidth: 1254, canvasHeight: 1254, width: 1025, height: 1050 };
  const fitted = await sharp(trimmed)
    .resize(target.width, target.height, { fit: 'inside' })
    .png()
    .toBuffer();
  const fittedMetadata = await sharp(fitted).metadata();
  const fittedWidth = fittedMetadata.width;
  const fittedHeight = fittedMetadata.height;
  if (!fittedWidth || !fittedHeight) throw new Error(`${slug}-${pose}: missing fitted size`);
  const normalizedSource = await sharp(fitted)
    .extend({
      top: Math.floor((target.canvasHeight - fittedHeight) / 2),
      bottom: Math.ceil((target.canvasHeight - fittedHeight) / 2),
      left: Math.floor((target.canvasWidth - fittedWidth) / 2),
      right: Math.ceil((target.canvasWidth - fittedWidth) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const cleanedNormalizedSource = await retainLargestAlphaComponent(normalizedSource);

  await sharp(cleanedNormalizedSource)
    .webp({ quality: 94, alphaQuality: 100 })
    .toFile(temporaryPath);
  await rename(temporaryPath, outputPath);

  const metadata = await sharp(outputPath).metadata();
  if (
    metadata.width !== target.canvasWidth ||
    metadata.height !== target.canvasHeight ||
    metadata.hasAlpha !== true
  ) {
    throw new Error(`${slug}-${pose}: invalid goalkeeper output`);
  }
}

await mkdir(worldTourArenaDir, { recursive: true });
await mkdir(worldTourGoalkeeperDir, { recursive: true });
for (const arena of approvedArenas) await buildArena(arena);
for (const slug of approvedArenas) {
  await buildGoalkeeper(slug, 'ready');
  await buildGoalkeeper(slug, 'save');
}
