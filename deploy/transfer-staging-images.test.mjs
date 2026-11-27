import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./transfer-staging-images.sh', import.meta.url));
function run(scenario) {
  const bin = mkdtempSync(join(tmpdir(), 'hockey-image-transfer-'));
  const mock = (name, body) =>
    writeFileSync(join(bin, name), '#!/usr/bin/env bash\nset -euo pipefail\n' + body, {
      mode: 0o755,
    });
  mock('timeout', 'shift\nexec "$@"\n');
  mock(
    'docker',
    `
case "$1 $2" in
 'login ghcr.io') cat >/dev/null ;;
 'logout ghcr.io'|'pull '*|'image prune') ;;
 'image inspect')
   if [ "\$IMAGE_TEST_CASE" = bad-id ] && [ "\${IMAGE_TEST_REMOTE:-0}" = 1 ]; then printf 'sha256:%064d\\n' 0
   elif [[ "\${!#}" == *hockey-web* ]]; then printf 'sha256:%064d\\n' 2
   else printf 'sha256:%064d\\n' 1; fi ;;
 'image save') if [ "\$IMAGE_TEST_CASE" = save-failure ]; then exit 7; fi; printf 'test image archive' ;;
 'image load') cat >/dev/null ;;
 *) exit 9 ;;
esac
`,
  );
  mock(
    'ssh',
    `
while [[ "$1" == -* ]]; do shift 2; done
shift
export IMAGE_TEST_REMOTE=1
if [ "$1" = bash ] && [ "$2" = -s ]; then exec "$@"; fi
exec bash -c "$*"
`,
  );
  try {
    return spawnSync('bash', [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: bin + ':' + process.env.PATH,
        STAGING_SSH_USER: 'test',
        STAGING_SSH_HOST: 'test.invalid',
        STAGING_IMAGE_TAG: 'dev-sha-abcdef0',
        SERVER_IMAGE: 'ghcr.io/test/hockey-server',
        WEB_IMAGE: 'ghcr.io/test/hockey-web',
        GHCR_USER: 'test',
        GHCR_TOKEN: 'test-placeholder',
        IMAGE_TEST_CASE: scenario,
      },
    });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}
test('verifies the exact content of both transferred tags', () => {
  const r = run('success');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Verified staging image content/);
});
test('a failed image producer cannot turn into a successful deployment', () => {
  const r = run('save-failure');
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /Verified staging image content/);
});
test('an image ID mismatch blocks container recreation', () => {
  const r = run('bad-id');
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /Verified staging image content/);
});
