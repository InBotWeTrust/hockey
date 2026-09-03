import { access, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '../server/package.json'));
const sharp = require('sharp');
const arenaDir = path.join(root, 'public/bonus-games/arenas');
const goalkeeperDir = path.join(root, 'public/bonus-games/goalkeepers');
const previewDir = path.join(root, 'public/bonus-games/previews');
const locationCardDir = path.join(root, 'public/bonus-games/location-cards');
const generatedArenaDir = path.join(root, 'assets/bonus-games/generated-arenas');
const generatedPreviewDir = path.join(root, 'assets/bonus-games/generated-previews');

const slugs = [
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
];

const ARENA_WIDTH = 1212;
const ARENA_HEIGHT = 2000;
const LOCATION_CARD_SIZE = 1254;
const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 800;

async function buildArena(slug) {
  const arenaPath = path.join(arenaDir, `${slug}.webp`);
  const tempPath = path.join(arenaDir, `.${slug}.tmp.webp`);
  await sharp(path.join(generatedArenaDir, `${slug}.png`))
    .resize(ARENA_WIDTH, ARENA_HEIGHT, { fit: 'fill' })
    .webp({ quality: 92 })
    .toFile(tempPath);
  await rename(tempPath, arenaPath);
}

async function buildPreview(slug) {
  const generatedPreviewPath = path.join(generatedPreviewDir, `${slug}.png`);
  try {
    await access(generatedPreviewPath);
    await sharp(generatedPreviewPath)
      .resize(LOCATION_CARD_SIZE, LOCATION_CARD_SIZE, { fit: 'cover' })
      .webp({ quality: 92 })
      .toFile(path.join(locationCardDir, `${slug}.webp`));
    await sharp(generatedPreviewPath)
      .resize(PREVIEW_WIDTH, PREVIEW_WIDTH, { fit: 'cover' })
      .extract({ left: 0, top: 91, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT })
      .webp({ quality: 92 })
      .toFile(path.join(previewDir, `${slug}.webp`));
    return;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const arenaPath = path.join(arenaDir, `${slug}.webp`);
  const goalkeeperPath = path.join(goalkeeperDir, `${slug}-ready.webp`);
  const background = await sharp(arenaPath)
    .resize({ width: PREVIEW_WIDTH })
    .extract({ left: 0, top: 0, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT })
    .toBuffer();
  const goalkeeper = await sharp(goalkeeperPath)
    .resize(330, 330, { fit: 'contain', withoutEnlargement: true })
    .png()
    .toBuffer();

  await sharp(background)
    .composite([{ input: goalkeeper, left: 435, top: 455 }])
    .webp({ quality: 92 })
    .toFile(path.join(previewDir, `${slug}.webp`));
}

for (const slug of slugs) {
  await buildArena(slug);
  await buildPreview(slug);
}
