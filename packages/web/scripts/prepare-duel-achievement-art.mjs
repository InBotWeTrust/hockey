import sharp from 'sharp';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const manifestPath = resolve(root, 'artifacts/duel-achievement-art-v1/manifest.json');
const args = process.argv.slice(2);
const id = args[args.indexOf('--id') + 1];
const sourceArg = args[args.indexOf('--source') + 1];
if (!id || !sourceArg) throw new Error('Use --id ACHIEVEMENT_ID --source PATH');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const entry = manifest.entries.find((candidate) => candidate.id === id);
if (!entry) throw new Error('Unknown artwork id ' + id);
const source = resolve(root, sourceArg);
const bytes = await readFile(source);
const sha = createHash('sha256').update(bytes).digest('hex');
const sourcesDir = resolve(root, 'artifacts/duel-achievement-art-v1/sources');
const fullDir = resolve(root, 'packages/web/public/achievements/duel-formats');
const thumbnailDir = resolve(root, 'packages/web/public/achievements/thumbnails/duel-formats');
await Promise.all([
  mkdir(sourcesDir, { recursive: true }),
  mkdir(fullDir, { recursive: true }),
  mkdir(thumbnailDir, { recursive: true }),
]);
const sourcePath = resolve(sourcesDir, entry.slug + extname(source));
if (source !== sourcePath) await copyFile(source, sourcePath);

async function compress(size, budget, initialQuality) {
  for (let quality = initialQuality; quality >= 54; quality -= 4) {
    const output = await sharp(bytes)
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .webp({ quality, effort: 6, alphaQuality: 90 })
      .toBuffer();
    if (output.length <= budget) return { output, quality };
  }
  throw new Error('Image exceeds byte budget for ' + entry.id);
}
const full = await compress(640, 100000, 84);
const thumbnail = await compress(160, 14000, 78);
const filename = entry.slug + '-v1.webp';
await writeFile(resolve(fullDir, filename), full.output);
await writeFile(resolve(thumbnailDir, filename), thumbnail.output);
Object.assign(entry, {
  status: 'ready',
  source: 'artifacts/duel-achievement-art-v1/sources/' + entry.slug + extname(source),
  sourceSha256: sha,
  fullUrl: '/achievements/duel-formats/' + filename,
  thumbnailUrl: '/achievements/thumbnails/duel-formats/' + filename,
  fullBytes: full.output.length,
  thumbnailBytes: thumbnail.output.length,
  fullQuality: full.quality,
  thumbnailQuality: thumbnail.quality,
  provenance: 'built-in image_gen',
});
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const mapping = Object.fromEntries(
  manifest.entries
    .filter((candidate) => candidate.status === 'ready')
    .map((candidate) => [candidate.id, candidate.fullUrl]),
);
await writeFile(
  resolve(root, 'packages/server/src/achievements/duelFormatArtwork.json'),
  JSON.stringify(mapping, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    id,
    fullBytes: full.output.length,
    thumbnailBytes: thumbnail.output.length,
    ready: Object.keys(mapping).length,
    total: manifest.entries.length,
  }),
);
