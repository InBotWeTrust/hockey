import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [distDir, expected] = process.argv.slice(2);
if (!distDir || !['enabled', 'disabled'].includes(expected)) {
  throw new Error('Usage: check-constructor-build.mjs <dist-dir> <enabled|disabled>');
}

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  }));
  return nested.flat();
}

const markers = ['MarksmanshipConstructorScreen', '/profile/marksmanship-constructor',
  'Конструктор меткости'];
const matches = [];
for (const path of await filesIn(distDir)) {
  if (!/\.(js|css|html|map)$/.test(path)) continue;
  const content = await readFile(path, 'utf8');
  if (markers.some((marker) => content.includes(marker))) matches.push(path);
}
if (expected === 'disabled' && matches.length > 0) {
  throw new Error(`Dev-only constructor leaked into build: ${matches.join(', ')}`);
}
if (expected === 'enabled' && matches.length === 0) {
  throw new Error('Dev-only constructor is missing from enabled build');
}
process.stdout.write(`Constructor build gate: ${expected}\n`);
