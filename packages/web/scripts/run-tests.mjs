import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const dailyScreenTest = 'src/screens/DailyScreen.test.tsx';
const tournamentAdminTest = 'src/tournament/TournamentAdmin.test.tsx';
const isolatedSuiteTests = [
  'src/chat/test/ChatRoomScreen.test.tsx',
  'src/screens/ProfileSettingsScreen.test.tsx',
];

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

runVitest('all files except isolated suites', [
  'run',
  '--exclude',
  `{${dailyScreenTest},${tournamentAdminTest},${isolatedSuiteTests.join(',')}}`,
]);

for (const testFile of isolatedSuiteTests) {
  runVitest(testFile, ['run', testFile]);
}

for (const testFile of [tournamentAdminTest, dailyScreenTest]) {
  const source = readFileSync(resolve(packageRoot, testFile), 'utf8');
  const testNames = Array.from(source.matchAll(/\bit\('([^']+)'/g), (match) => match[1]);
  if (testNames.length === 0) throw new Error(`No tests found in ${testFile}`);
  for (const testName of testNames) {
    runVitest(`${testFile}: ${testName}`, ['run', testFile, '-t', escapeRegExp(testName)]);
  }
}
