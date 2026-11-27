import { test } from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
  mock('python3', 'cp "$2" "$3"\n');
  mock(
    'docker',
    `
case "$1 $2" in
 'login ghcr.io') cat >/dev/null ;;
 'logout ghcr.io'|'pull '*|'image prune') ;;
 'inspect --format') if [ \"\$IMAGE_TEST_CASE\" = no-basis ]; then exit 1; fi; if [[ \"\${!#}\" == *web-dev* ]]; then printf 'ghcr.io/test/hockey-web:old\\n'; else printf 'ghcr.io/test/hockey-server:old\\n'; fi ;;
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
  mock(
    'rsync',
    `
if [ "$IMAGE_TEST_CASE" = rsync-failure ]; then exit 23; fi
args=("$@")
source_path="\${args[\${#args[@]}-2]}"
target_path="\${args[\${#args[@]}-1]}"
cp "$source_path" "\${target_path#*:}"
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

test('a failed delta transfer blocks loading and deployment', () => {
  const r = run('rsync-failure');
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /Verified staging image content/);
});

test('real rsync reuses unchanged bytes while preserving the exact new archive', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hockey-rsync-delta-'));
  try {
    const unchanged = randomBytes(2 * 1024 * 1024);
    const source = join(dir, 'source.tar'),
      target = join(dir, 'basis.tar');
    writeFileSync(target, unchanged);
    const next = Buffer.concat([
      Buffer.from('new image metadata'),
      unchanged,
      Buffer.from('new assets'),
    ]);
    writeFileSync(source, next);
    const result = spawnSync(
      'rsync',
      [
        '--checksum',
        '--no-whole-file',
        '--block-size=1024',
        '--compress',
        '--stats',
        source,
        target,
      ],
      { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      createHash('sha256').update(readFileSync(target)).digest('hex'),
      createHash('sha256').update(next).digest('hex'),
    );
    const literal = Number(
      result.stdout
        .match(/(?:Literal|Unmatched) data: ([\d,]+) (?:bytes|B)/)[1]
        .replaceAll(',', ''),
    );
    assert.ok(literal < 100000, `Expected unchanged bytes to be reused, sent ${literal}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('can deploy without existing dev containers as a delta basis', () => {
  const r = run('no-basis');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Verified staging image content/);
});
