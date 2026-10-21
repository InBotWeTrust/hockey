import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const dailyScreenTest = 'src/screens/DailyScreen.test.tsx';
const isolatedSuiteTests = [
  // The real constructor scans goal situations in timer-driven CPU batches.
  // Run it without competing with the parallel component test workers.
  'src/screens/MarksmanshipConstructorScreen.test.tsx',
  'src/chat/test/ChatRoomScreen.test.tsx',
  'src/screens/ProfileSettingsScreen.test.tsx',
  'src/tournament/TournamentAdmin.test.tsx',
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

runVitest('all files except isolated suites', [
  'run',
  '--exclude',
  `{${dailyScreenTest},${isolatedSuiteTests.join(',')}}`,
]);

for (const testFile of isolatedSuiteTests) {
  runVitest(testFile, ['run', testFile]);
}

// Keep the suite isolated while letting Vitest collect every parameterized case.
runVitest(dailyScreenTest, ['run', dailyScreenTest]);
