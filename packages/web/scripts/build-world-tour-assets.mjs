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
const BOARD_VALIDATION_XS = [82, 186, 300, 606, 912, 1026, 1130];

const worldTourArenaSourceDir = path.join(root, 'assets/bonus-games/world-tour/generated-arenas');
const worldTourArenaDir = path.join(root, 'public/bonus-games/world-tour/arenas');
const worldTourGoalkeeperSourceDir = path.join(
  root,
  'assets/bonus-games/world-tour/generated-goalkeepers',
);
const worldTourGoalkeeperDir = path.join(root, 'public/bonus-games/world-tour/goalkeepers');
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
const requestedArenas = process.argv.slice(2);
const arenasToBuild = requestedArenas.length > 0 ? requestedArenas : approvedArenas;
for (const slug of arenasToBuild) {
  if (!approvedArenas.includes(slug)) throw new Error(`Unknown World Tour arena: ${slug}`);
}

async function detectSourceGoalGeometry(sourcePath) {
  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sourceCurve = detectKickplateCurve(data, info);
  const centreX = Math.round(info.width / 2);
  const centreCurveY = median(Array.from(sourceCurve.slice(centreX - 8, centreX + 9)));

  // The generated flag colours can make a red-signal search mistake a board
  // detail for the goal line. The compact cyan crease is stable in every
  // approved master: find its first wide row below the kickplate, then step
  // back to the red outline immediately above it.
  const findCreaseTop = (startY, endY) => {
    for (let y = startY; y <= endY; y += 1) {
      const isCreasePixel = (x) => {
        const offset = (y * info.width + x) * info.channels;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        return blue - red > 20 && blue - green > 3;
      };
      if (!isCreasePixel(centreX)) continue;

      let left = centreX;
      let right = centreX;
      while (left > 0 && isCreasePixel(left - 1)) left -= 1;
      while (right + 1 < info.width && isCreasePixel(right + 1)) right += 1;
      const width = right - left + 1;
      if (width >= 70 && width <= 200) {
        return { goalLineY: y - 1, creaseCenterX: (left + right) / 2 };
      }
    }
    return null;
  };

  const nearKickplate = findCreaseTop(
    Math.round(centreCurveY + 25),
    Math.round(centreCurveY + 100),
  );
  if (nearKickplate !== null) return nearKickplate;

  // A national flag can overpower the warm kickplate colour signal in an
  // otherwise valid generated master. Fall back to the complete upper-rink
  // corridor and still require the compact cyan region to be centred.
  const upperRink = findCreaseTop(
    Math.round(info.height * 0.35),
    Math.round(info.height * 0.55),
  );
  if (upperRink !== null) return upperRink;

  throw new Error(`Unable to detect source goal crease in ${sourcePath}`);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function detectKickplateCurve(data, info) {
  const searchStartY = Math.round((620 / ARENA_HEIGHT) * info.height);
  const searchEndY = Math.round((880 / ARENA_HEIGHT) * info.height);
  const rawCurve = new Float64Array(info.width);
  for (let x = 0; x < info.width; x += 1) {
    let bestY = searchStartY;
    let bestSignal = Number.NEGATIVE_INFINITY;
    for (let y = searchStartY; y <= searchEndY; y += 1) {
      let signal = 0;
      for (
        let sampleX = Math.max(0, x - 3);
        sampleX <= Math.min(info.width - 1, x + 3);
        sampleX += 1
      ) {
        const offset = (y * info.width + sampleX) * info.channels;
        signal += data[offset] + data[offset + 1] - 2 * data[offset + 2];
      }
      if (signal > bestSignal) {
        bestSignal = signal;
        bestY = y;
      }
    }
    rawCurve[x] = bestY;
  }

  const curve = new Float64Array(info.width);
  for (let x = 0; x < info.width; x += 1) {
    const window = [];
    for (
      let sampleX = Math.max(0, x - 8);
      sampleX <= Math.min(info.width - 1, x + 8);
      sampleX += 1
    ) {
      window.push(rawCurve[sampleX]);
    }
    curve[x] = median(window);
  }
  return curve;
}

function detectGoalCreaseTopY(data, info) {
  const curve = detectKickplateCurve(data, info);
  const centreX = Math.round(info.width / 2);
  const centreCurveY = median(Array.from(curve.slice(centreX - 8, centreX + 9)));
  const minWidth = Math.round((70 / 976) * info.width);
  const maxWidth = Math.round((200 / 976) * info.width);

  for (let y = Math.round(centreCurveY + 25); y <= centreCurveY + 150; y += 1) {
    const isCreasePixel = (x) => {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      return blue - red > 20 && blue - green > 3;
    };
    if (!isCreasePixel(centreX)) continue;

    let left = centreX;
    let right = centreX;
    while (left > 0 && isCreasePixel(left - 1)) left -= 1;
    while (right + 1 < info.width && isCreasePixel(right + 1)) right += 1;
    const width = right - left + 1;
    if (width >= minWidth && width <= maxWidth) return y;
  }

  throw new Error('Unable to detect goal crease');
}

async function buildArena(slug) {
  const outputPath = path.join(worldTourArenaDir, `${slug}.webp`);
  const temporaryPath = path.join(worldTourArenaDir, `.${slug}.tmp.webp`);
  const sourcePath = path.join(worldTourArenaSourceDir, `${slug}-approved-source.png`);
  const sourceMetadata = await sharp(sourcePath).metadata();

  if (!sourceMetadata.height) {
    throw new Error(`Missing source height for ${slug}`);
  }

  const sourceGoalGeometry = await detectSourceGoalGeometry(sourcePath);
  const sourceGoalLineY = sourceGoalGeometry.goalLineY;
  console.log(`${slug}: source goal line ${sourceGoalLineY}`);

  const sourceCenterX = sourceMetadata.width / 2;
  const horizontalCorrection = Math.round(sourceCenterX - sourceGoalGeometry.creaseCenterX);
  let sourceInput = sourcePath;
  if (horizontalCorrection !== 0) {
    const shift = Math.abs(horizontalCorrection);
    const extended = await sharp(sourcePath)
      .extend({
        left: horizontalCorrection > 0 ? shift : 0,
        right: horizontalCorrection < 0 ? shift : 0,
        top: 0,
        bottom: 0,
        extendWith: 'copy',
      })
      .png()
      .toBuffer();
    sourceInput = await sharp(extended)
      .extract({
        left: horizontalCorrection < 0 ? shift : 0,
        top: 0,
        width: sourceMetadata.width,
        height: sourceMetadata.height,
      })
      .png()
      .toBuffer();
  }

  const renderGeometry = async (goalLineAnchorY) => {
    // Keep the approved location as one coherent image. The two contiguous
    // pieces only normalise its vertical geometry; no second rink or marking
    // layer is introduced.
    const upper = await sharp(sourceInput)
      .extract({
        left: 0,
        top: 0,
        width: sourceMetadata.width,
        height: sourceGoalLineY + 1,
      })
      .resize(ARENA_WIDTH, goalLineAnchorY + 1, { fit: 'fill' })
      .toBuffer();
    const lower = await sharp(sourceInput)
      .extract({
        left: 0,
        top: sourceGoalLineY + 1,
        width: sourceMetadata.width,
        height: sourceMetadata.height - sourceGoalLineY - 1,
      })
      .resize(ARENA_WIDTH, ARENA_HEIGHT - goalLineAnchorY - 1, { fit: 'fill' })
      .toBuffer();
    const verticallyNormalised = await sharp({
      create: {
        width: ARENA_WIDTH,
        height: ARENA_HEIGHT,
        channels: 3,
        background: '#eaf1f8',
      },
    })
      .composite([
        { input: upper, left: 0, top: 0 },
        { input: lower, left: 0, top: goalLineAnchorY + 1 },
      ])
      .png()
      .toBuffer();
    // Keep the approved master coherent. Per-column board correction bends
    // the face line and tears the yellow kickplate into visible steps. The two
    // uniform vertical pieces only anchor the generated face line to gameplay;
    // they never deform individual columns or overlay a second rink.
    return sharp(verticallyNormalised)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => ({
        buffer: data,
        raw: { width: info.width, height: info.height, channels: info.channels },
      }));
  };

  let goalLineAnchorY = GOAL_LINE_Y;
  let geometry = await renderGeometry(goalLineAnchorY);
  let previousAnchorY = null;
  let previousMeasuredY = null;
  const targetCreaseTopY = GOAL_LINE_Y + 2;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const measuredCreaseTopY = detectGoalCreaseTopY(geometry.buffer, geometry.raw);
    const correction = targetCreaseTopY - measuredCreaseTopY;
    if (correction === 0) break;
    let nextAnchorY = goalLineAnchorY + Math.sign(correction) * 40;
    if (
      previousAnchorY !== null &&
      previousMeasuredY !== null &&
      measuredCreaseTopY !== previousMeasuredY
    ) {
      nextAnchorY = Math.round(
        goalLineAnchorY +
          (correction * (goalLineAnchorY - previousAnchorY)) /
            (measuredCreaseTopY - previousMeasuredY),
      );
    }
    previousAnchorY = goalLineAnchorY;
    previousMeasuredY = measuredCreaseTopY;
    goalLineAnchorY = Math.max(500, Math.min(1100, nextAnchorY));
    geometry = await renderGeometry(goalLineAnchorY);
  }
  await sharp(geometry.buffer, { raw: geometry.raw }).webp({ quality: 92 }).toFile(temporaryPath);
  await rename(temporaryPath, outputPath);

  const { data, info } = await sharp(outputPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const outputCurve = detectKickplateCurve(data, info);
  for (const [leftX, rightX] of [
    [82, 1130],
    [186, 1026],
    [300, 912],
  ]) {
    if (Math.abs(outputCurve[leftX] - outputCurve[rightX]) > 12) {
      throw new Error(`${slug}: board is not centred at X=${leftX}/${rightX}`);
    }
  }
  if (outputCurve[606] > Math.min(outputCurve[300], outputCurve[912])) {
    throw new Error(`${slug}: board centre is lower than its shoulders`);
  }
  const outputCreaseTopY = detectGoalCreaseTopY(data, info);
  if (Math.abs(outputCreaseTopY - targetCreaseTopY) > 1) {
    throw new Error(
      `${slug}: goal crease starts at Y=${outputCreaseTopY}, expected ${targetCreaseTopY}`,
    );
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
  const sourcePath = path.join(worldTourGoalkeeperSourceDir, `${slug}-${pose}-source.png`);
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
      return (
        Math.min(red, green, blue) >= 230 &&
        Math.max(red, green, blue) - Math.min(red, green, blue) <= 8
      );
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
  const target = {
    canvasWidth: 1254,
    canvasHeight: 1254,
    maxWidth: pose === 'save' ? 1230 : 1025,
    visibleHeight: 1050,
  };
  const heightNormalised = await sharp(trimmed)
    .resize({ height: target.visibleHeight })
    .png()
    .toBuffer();
  const heightNormalisedMetadata = await sharp(heightNormalised).metadata();
  if (!heightNormalisedMetadata.width) throw new Error(`${slug}-${pose}: missing fitted width`);
  const fitted =
    heightNormalisedMetadata.width > target.maxWidth
      ? await sharp(heightNormalised)
          .resize(target.maxWidth, target.visibleHeight, { fit: 'fill' })
          .png()
          .toBuffer()
      : heightNormalised;
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
for (const arena of arenasToBuild) await buildArena(arena);
for (const slug of arenasToBuild) {
  await buildGoalkeeper(slug, 'ready');
  await buildGoalkeeper(slug, 'save');
}
