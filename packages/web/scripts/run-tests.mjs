import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const dailyScreenTest = 'src/screens/DailyScreen.test.tsx';

function runVitest(label, args) {
  console.log(`\n[web test] ${label}`);
  const result = spawnSync('pnpm', ['exec', 'vitest', ...args], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

runVitest('all files except DailyScreen', ['run', '--exclude', dailyScreenTest]);

const dailySource = readFileSync(resolve(packageRoot, dailyScreenTest), 'utf8');
const dailyTestNames = Array.from(dailySource.matchAll(/\bit\('([^']+)'/g), (match) => match[1]);

if (dailyTestNames.length === 0) {
  throw new Error(`No DailyScreen tests found in ${dailyScreenTest}`);
}

for (const testName of dailyTestNames) {
  runVitest(`DailyScreen: ${testName}`, ['run', dailyScreenTest, '-t', escapeRegExp(testName)]);
}
