import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  ...execFileSync('git', ['diff', '--name-only', 'b85823e81a5dc8e64a04012610e9cc6fd07d3b04'], { encoding: 'utf8' }).trim().split('\n'),
  ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'),
];
// Reviewed bonus package plus exactly five files from user-selected commit 66b48ad2.
const approved = new Set(JSON.parse(readFileSync(new URL('./bonus-production-allowlist.json', import.meta.url), 'utf8')));
function assertApprovedPaths(candidates) {
  for (const file of candidates.filter(Boolean)) assert(approved.has(file), `Excluded release file: ${file}`);
}
assertApprovedPaths(files);
assert.throws(() => assertApprovedPaths(['packages/server/src/unrelatedFeature.ts']));
assert.throws(() => assertApprovedPaths(['packages/server/src/duel/unselectedChange.ts']));
assert.throws(() => assertApprovedPaths(['packages/web/src/onboarding/unselectedChange.tsx']));
assert.equal(execFileSync('git', ['diff', 'b85823e81a5dc8e64a04012610e9cc6fd07d3b04', '--', 'packages/game-core/src/version.ts'], { encoding: 'utf8' }), '', 'Do not bump the global production engine for a bonus-only release');
const runtime = execFileSync('git', ['ls-files', 'packages/web/public/bonus-games/nhl-cities/arenas'], { encoding: 'utf8' });
assert.equal(runtime.trim().split('\n').filter(Boolean).length, 20, 'All twenty NHL arenas must be present');
console.log('Bonus-only scope and twenty NHL arenas: PASS');
const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8');
const backup = deploy.indexOf('bonus-release-prod-');
assert(backup >= 0 && backup < deploy.indexOf('server node packages/server/dist/db/migrate-cli.js'), 'A verified production backup must precede migrations');
assert(deploy.includes('pg_restore --list'), 'Check backup archive readability before migrations');
