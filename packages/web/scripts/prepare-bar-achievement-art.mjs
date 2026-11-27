import sharp from 'sharp';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const manifestPath = resolve(root, 'artifacts/bar-achievement-art-v1/manifest.json');
const args = process.argv.slice(2);
const number = Number(args[args.indexOf('--number') + 1]);
const sourceArg = args[args.indexOf('--source') + 1];
if (!Number.isInteger(number) || !sourceArg) throw new Error('Use --number N --source PATH');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const entry = manifest.entries.find((x) => x.number === number);
if (!entry) throw new Error('Unknown artwork number ' + number);
const source = resolve(root, sourceArg);
const bytes = await readFile(source);
const sha = createHash('sha256').update(bytes).digest('hex');
const sourcesDir = resolve(root, 'artifacts/bar-achievement-art-v1/sources');
await mkdir(sourcesDir, { recursive: true });
const savedSource = resolve(sourcesDir, entry.slug + extname(source));
await copyFile(source, savedSource);
const fullDir = resolve(root, 'packages/web/public/achievements/bar');
const thumbnailDir = resolve(root, 'packages/web/public/achievements/thumbnails/bar');
await mkdir(fullDir, { recursive: true });
await mkdir(thumbnailDir, { recursive: true });
const image =
  number === 53
    ? sharp(bytes).extract({ left: 235, top: 20, width: 560, height: 560 })
    : sharp(bytes);
async function compress(size, budget, initialQuality) {
  for (let quality = initialQuality; quality >= 54; quality -= 4) {
    const output = await image
      .clone()
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .webp({ quality, effort: 6, alphaQuality: 90 })
      .toBuffer();
    if (output.length <= budget) return { output, quality };
  }
  throw new Error('Image exceeds byte budget for ' + entry.slug);
}
const full = await compress(640, 100000, 84);
const thumbnail = await compress(160, 14000, 78);
const filename = entry.slug + '-v1.webp';
await writeFile(resolve(fullDir, filename), full.output);
await writeFile(resolve(thumbnailDir, filename), thumbnail.output);
Object.assign(entry, {
  status: 'ready',
  source: 'artifacts/bar-achievement-art-v1/sources/' + entry.slug + extname(source),
  sourceSha256: sha,
  fullUrl: '/achievements/bar/' + filename,
  thumbnailUrl: '/achievements/thumbnails/bar/' + filename,
  fullBytes: full.output.length,
  thumbnailBytes: thumbnail.output.length,
  fullQuality: full.quality,
  thumbnailQuality: thumbnail.quality,
  provenance: entry.provenance ?? 'built-in image_gen',
});
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const mapping = Object.fromEntries(
  manifest.entries.filter((x) => x.status === 'ready').map((x) => [x.number, x.fullUrl]),
);
await writeFile(
  resolve(root, 'packages/web/src/achievements/barArtwork.ts'),
  '// Updated by the deterministic bar artwork preparation script.\nexport const BAR_ARTWORK:Record<number,string> = ' +
    JSON.stringify(mapping, null, 2) +
    ';\n',
);
console.log(
  JSON.stringify({
    number,
    slug: entry.slug,
    fullBytes: full.output.length,
    thumbnailBytes: thumbnail.output.length,
    ready: Object.keys(mapping).length,
    total: manifest.entries.length,
  }),
);
