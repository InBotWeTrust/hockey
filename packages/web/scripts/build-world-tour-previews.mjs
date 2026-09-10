import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '../server/package.json'));
const sharp = require('sharp');

const PREVIEW_SIZE = 1254;
const CONTACT_TILE_SIZE = 320;
const CONTACT_LABEL_HEIGHT = 42;
const CONTACT_COLUMNS = 4;
const FEATURE_TILE_WIDTH = 340;
const FEATURE_TILE_HEIGHT = 196;

const previews = [
  ['moscow', 'Москва'],
  ['istanbul', 'Стамбул'],
  ['rome', 'Рим'],
  ['paris', 'Париж'],
  ['london', 'Лондон'],
  ['new-york', 'Нью-Йорк'],
  ['rio-de-janeiro', 'Рио-де-Жанейро'],
  ['cape-town', 'Кейптаун'],
  ['dubai', 'Дубай'],
  ['mumbai', 'Мумбаи'],
  ['singapore', 'Сингапур'],
  ['beijing', 'Пекин'],
  ['tokyo', 'Токио'],
];

const featuredFocus = { moscow: 0.5 };

const sourceDir = path.join(root, 'assets/bonus-games/world-tour/generated-previews');
const outputDir = path.join(root, 'public/bonus-games/world-tour/previews');
const contactSheetPath = '/private/tmp/world-tour-previews-contact.webp';
const featuredContactSheetPath = '/private/tmp/world-tour-featured-crops.webp';

await mkdir(outputDir, { recursive: true });

const contactComposites = [];
const featuredContactComposites = [];
for (const [index, [slug, title]] of previews.entries()) {
  const sourcePath = path.join(sourceDir, `${slug}-approved-source.png`);
  const outputPath = path.join(outputDir, `${slug}.webp`);
  const metadata = await sharp(sourcePath).metadata();

  const squarePng = await sharp(sourcePath)
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  // Keep approved sources square too, so future builds cannot accidentally
  // stretch a portrait generation into the catalog card.
  await sharp(squarePng).toFile(sourcePath);
  await sharp(squarePng).webp({ quality: 92 }).toFile(outputPath);

  const column = index % CONTACT_COLUMNS;
  const row = Math.floor(index / CONTACT_COLUMNS);
  const tile = await sharp(squarePng)
    .resize(CONTACT_TILE_SIZE, CONTACT_TILE_SIZE)
    .toBuffer();
  contactComposites.push({
    input: tile,
    left: column * CONTACT_TILE_SIZE,
    top: row * (CONTACT_TILE_SIZE + CONTACT_LABEL_HEIGHT),
  });

  const featureSourceHeight = Math.round((PREVIEW_SIZE * FEATURE_TILE_HEIGHT) / FEATURE_TILE_WIDTH);
  const featureSourceTop = Math.round(
    (PREVIEW_SIZE - featureSourceHeight) * (featuredFocus[slug] ?? 0.43),
  );
  const featureTile = await sharp(squarePng)
    .extract({
      left: 0,
      top: featureSourceTop,
      width: PREVIEW_SIZE,
      height: featureSourceHeight,
    })
    .resize(FEATURE_TILE_WIDTH, FEATURE_TILE_HEIGHT)
    .toBuffer();
  featuredContactComposites.push({
    input: featureTile,
    left: column * FEATURE_TILE_WIDTH,
    top: row * (FEATURE_TILE_HEIGHT + CONTACT_LABEL_HEIGHT),
  });
  featuredContactComposites.push({
    input: Buffer.from(
      `<svg width="${FEATURE_TILE_WIDTH}" height="${CONTACT_LABEL_HEIGHT}">
        <rect width="100%" height="100%" fill="#111827"/>
        <text x="16" y="28" fill="#ffffff" font-size="21" font-family="Arial, sans-serif">${title}</text>
      </svg>`,
    ),
    left: column * FEATURE_TILE_WIDTH,
    top: row * (FEATURE_TILE_HEIGHT + CONTACT_LABEL_HEIGHT) + FEATURE_TILE_HEIGHT,
  });
  contactComposites.push({
    input: Buffer.from(
      `<svg width="${CONTACT_TILE_SIZE}" height="${CONTACT_LABEL_HEIGHT}">
        <rect width="100%" height="100%" fill="#111827"/>
        <text x="16" y="28" fill="#ffffff" font-size="21" font-family="Arial, sans-serif">${title}</text>
      </svg>`,
    ),
    left: column * CONTACT_TILE_SIZE,
    top: row * (CONTACT_TILE_SIZE + CONTACT_LABEL_HEIGHT) + CONTACT_TILE_SIZE,
  });

  console.log(`${slug}: ${metadata.width}x${metadata.height} -> ${PREVIEW_SIZE}x${PREVIEW_SIZE}`);
}

const contactRows = Math.ceil(previews.length / CONTACT_COLUMNS);
await sharp({
  create: {
    width: CONTACT_COLUMNS * CONTACT_TILE_SIZE,
    height: contactRows * (CONTACT_TILE_SIZE + CONTACT_LABEL_HEIGHT),
    channels: 3,
    background: '#111827',
  },
})
  .composite(contactComposites)
  .webp({ quality: 90 })
  .toFile(contactSheetPath);

console.log(`contact sheet: ${contactSheetPath}`);

await sharp({
  create: {
    width: CONTACT_COLUMNS * FEATURE_TILE_WIDTH,
    height: contactRows * (FEATURE_TILE_HEIGHT + CONTACT_LABEL_HEIGHT),
    channels: 3,
    background: '#111827',
  },
})
  .composite(featuredContactComposites)
  .webp({ quality: 90 })
  .toFile(featuredContactSheetPath);

console.log(`featured crops: ${featuredContactSheetPath}`);
