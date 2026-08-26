import { rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '../server/package.json'));
const sharp = require('sharp');
const arenaDir = path.join(root, 'public/bonus-games/arenas');
const goalkeeperDir = path.join(root, 'public/bonus-games/goalkeepers');
const previewDir = path.join(root, 'public/bonus-games/previews');
const locationDir = path.join(root, 'assets/bonus-games/locations');
const textureDir = path.join(root, 'assets/bonus-games/textures');
const masterCourtPath = path.join(root, 'public/sprites/amateur-daily-court.webp');

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

const textureConfig = {
  beach: { blend: 'over', gain: 1 },
  'ski-resort': { blend: 'screen', gain: 3 },
  'cyberpunk-yard': { blend: 'screen', gain: 4 },
  'abandoned-waterpark': { blend: 'screen', gain: 3.5 },
  'pirate-bay': { blend: 'screen', gain: 6 },
  'north-pole': { blend: 'screen', gain: 5 },
  desert: { blend: 'screen', gain: 6 },
  'volcanic-ice': { blend: 'screen', gain: 8 },
  castle: { blend: 'screen', gain: 3 },
  space: { blend: 'screen', gain: 11 },
};

const ARENA_WIDTH = 1212;
const ARENA_HEIGHT = 2000;
const LOCATION_HEIGHT = 740;
const LOCATION_FADE_START = 620;
const TEXTURE_TOP = 760;
const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 800;

async function buildArena(slug) {
  const config = textureConfig[slug];
  const arenaPath = path.join(arenaDir, `${slug}.webp`);
  const tempPath = path.join(arenaDir, `.${slug}.tmp.webp`);
  const locationMask = Buffer.from(`
    <svg width="${ARENA_WIDTH}" height="${LOCATION_HEIGHT}">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="white" stop-opacity="1" />
          <stop offset="${(LOCATION_FADE_START / LOCATION_HEIGHT) * 100}%"
                stop-color="white" stop-opacity="1" />
          <stop offset="100%" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect width="${ARENA_WIDTH}" height="${LOCATION_HEIGHT}" fill="url(#fade)" />
    </svg>
  `);
  const location = await sharp(path.join(locationDir, `${slug}.webp`))
    .resize(ARENA_WIDTH, LOCATION_HEIGHT, { fit: 'fill' })
    .ensureAlpha()
    .composite([{ input: locationMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  let texturePipeline = sharp(path.join(textureDir, `${slug}.png`))
    .resize(ARENA_WIDTH, ARENA_HEIGHT, { fit: 'fill' })
    .extract({
      left: 0,
      top: TEXTURE_TOP,
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT - TEXTURE_TOP,
    });
  if (config.gain !== 1) texturePipeline = texturePipeline.linear(config.gain);
  const texture = await texturePipeline.png().toBuffer();

  await sharp(masterCourtPath)
    .resize(ARENA_WIDTH, ARENA_HEIGHT, { fit: 'fill' })
    .composite([
      { input: location, left: 0, top: 0 },
      { input: texture, left: 0, top: TEXTURE_TOP, blend: config.blend },
    ])
    .webp({ quality: 92 })
    .toFile(tempPath);
  await rename(tempPath, arenaPath);
}

async function buildPreview(slug) {
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
