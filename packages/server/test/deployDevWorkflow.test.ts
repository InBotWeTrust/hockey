import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/deploy-dev.yml', import.meta.url),
  'utf8',
);
const compose = readFileSync(
  new URL('../../../docker-compose.staging.yml', import.meta.url),
  'utf8',
);
const productionWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const productionCompose = readFileSync(
  new URL('../../../docker-compose.yml', import.meta.url),
  'utf8',
);
const serverDevCompose = compose.slice(
  compose.indexOf('  server-dev:'),
  compose.indexOf('  push-worker-dev:'),
);
const productionServerCompose = productionCompose.slice(
  productionCompose.indexOf('  server:'),
  productionCompose.indexOf('  push-worker:'),
);
const productionPushWorkerCompose = productionCompose.slice(
  productionCompose.indexOf('  push-worker:'),
  productionCompose.indexOf('  web:'),
);
const sshCommand = workflow.slice(
  workflow.indexOf('          ssh -i ~/.ssh/id_ed25519'),
  workflow.indexOf("            bash -s <<'ENDSSH'"),
);
const productionSshCommand = productionWorkflow.slice(
  productionWorkflow.indexOf('          ssh -i ~/.ssh/id_ed25519'),
  productionWorkflow.indexOf("            bash -s <<'ENDSSH'"),
);

function encodeBase64Value(value: string): string {
  return execFileSync(
    'bash',
    [
      '-euo',
      'pipefail',
      '-c',
      String.raw`
        printf '%s' "$VALUE" | base64 | tr -d '\r\n'
      `,
    ],
    { encoding: 'utf8', env: { ...process.env, VALUE: value }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function decodeBase64Value(encoded: string): string {
  return execFileSync(
    'bash',
    [
      '-euo',
      'pipefail',
      '-c',
      String.raw`
        decode_staging_yookassa_value() {
          local encoded="$1"
          local decoded
          local normalized
          if [ -z "$encoded" ] || ! decoded="$(printf '%s' "$encoded" | base64 --decode)"; then
            return 1
          fi
          if [ -z "$decoded" ] || [[ "$decoded" == *$'\n'* || "$decoded" == *$'\r'* ]]; then
            return 1
          fi
          normalized="$(printf '%s' "$decoded" | base64 | tr -d '\r\n')"
          if [ "$encoded" != "$normalized" ]; then
            return 1
          fi
          printf '%s' "$decoded"
        }
        decode_staging_yookassa_value "$ENCODED"
      `,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, ENCODED: encoded },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

describe('dev YooKassa deployment wiring', () => {
  it('passes credentials to SSH only as base64 and restores them before the required guard', () => {
    expect(workflow).toContain('STAGING_YOOKASSA_SHOP_ID: ${{ secrets.STAGING_YOOKASSA_SHOP_ID }}');
    expect(workflow).toContain(
      'STAGING_YOOKASSA_SECRET_KEY: ${{ secrets.STAGING_YOOKASSA_SECRET_KEY }}',
    );
    expect(workflow).toContain(
      'STAGING_YOOKASSA_SHOP_ID_B64="$(printf \'%s\' "$STAGING_YOOKASSA_SHOP_ID" | base64 | tr -d \'\\r\\n\')"',
    );
    expect(workflow).toContain(
      'STAGING_YOOKASSA_SECRET_KEY_B64="$(printf \'%s\' "$STAGING_YOOKASSA_SECRET_KEY" | base64 | tr -d \'\\r\\n\')"',
    );
    expect(sshCommand).toContain('STAGING_YOOKASSA_SHOP_ID_B64="$STAGING_YOOKASSA_SHOP_ID_B64"');
    expect(sshCommand).toContain(
      'STAGING_YOOKASSA_SECRET_KEY_B64="$STAGING_YOOKASSA_SECRET_KEY_B64"',
    );
    expect(sshCommand).not.toContain('STAGING_YOOKASSA_SHOP_ID="$STAGING_YOOKASSA_SHOP_ID"');
    expect(sshCommand).not.toContain('STAGING_YOOKASSA_SECRET_KEY="$STAGING_YOOKASSA_SECRET_KEY"');
    expect(workflow).toContain('decode_staging_yookassa_value()');
    expect(workflow).toContain(
      'if [ -z "$encoded" ] || ! decoded="$(printf \'%s\' "$encoded" | base64 --decode 2>/dev/null)"; then',
    );
    expect(workflow).toContain(
      'if ! STAGING_YOOKASSA_SHOP_ID="$(decode_staging_yookassa_value "$STAGING_YOOKASSA_SHOP_ID_B64")"; then',
    );
    expect(workflow).toContain(
      'if ! STAGING_YOOKASSA_SECRET_KEY="$(decode_staging_yookassa_value "$STAGING_YOOKASSA_SECRET_KEY_B64")"; then',
    );
    expect(workflow).toContain('if [ "$encoded" != "$normalized" ]; then');
    expect(workflow).toContain(
      'unset STAGING_YOOKASSA_SHOP_ID_B64 STAGING_YOOKASSA_SECRET_KEY_B64',
    );
    expect(workflow).toMatch(
      /for name in[\s\S]*STAGING_YOOKASSA_SHOP_ID[\s\S]*STAGING_YOOKASSA_SECRET_KEY[\s\S]*do/,
    );
    expect(workflow).toContain('export STAGING_YOOKASSA_SHOP_ID STAGING_YOOKASSA_SECRET_KEY');
  });

  it('round-trips SSH-hostile test credentials and rejects malformed encoded values', () => {
    const fixture = 'spaces "quotes" $dollar `backtick`; semicolon';

    expect(decodeBase64Value(encodeBase64Value(fixture))).toBe(fixture);
    expect(() => decodeBase64Value('not-valid-base64!')).toThrow();
    expect(() => decodeBase64Value(encodeBase64Value(`${fixture}\n`))).toThrow();
  });

  it('keeps staging YooKassa credentials scoped to server-dev', () => {
    expect(serverDevCompose).toContain('YOOKASSA_SHOP_ID: ${STAGING_YOOKASSA_SHOP_ID:-}');
    expect(serverDevCompose).toContain('YOOKASSA_SECRET_KEY: ${STAGING_YOOKASSA_SECRET_KEY:-}');
    expect(productionWorkflow).not.toContain('STAGING_YOOKASSA_');
    expect(productionCompose).not.toContain('STAGING_YOOKASSA_');
  });

  it('uses the exact dev return URL for YooKassa redirects', () => {
    expect(compose).toContain(
      'YOOKASSA_RETURN_URL: https://dev.hockey.inbotwetrust.ru/inventory?tab=bank&payment=return',
    );
  });
});

describe('production YooKassa deployment wiring', () => {
  it('passes optional production credentials safely and uses the ultimatehockey.ru return URL', () => {
    expect(productionWorkflow).toContain(
      'PRODUCTION_YOOKASSA_SHOP_ID: ${{ secrets.PRODUCTION_YOOKASSA_SHOP_ID }}',
    );
    expect(productionWorkflow).toContain(
      'PRODUCTION_YOOKASSA_SECRET_KEY: ${{ secrets.PRODUCTION_YOOKASSA_SECRET_KEY }}',
    );
    expect(productionWorkflow).toContain('PRODUCTION_YOOKASSA_SHOP_ID_B64=');
    expect(productionWorkflow).toContain('PRODUCTION_YOOKASSA_SECRET_KEY_B64=');
    expect(productionSshCommand).not.toContain(
      'PRODUCTION_YOOKASSA_SHOP_ID="$PRODUCTION_YOOKASSA_SHOP_ID"',
    );
    expect(productionSshCommand).not.toContain(
      'PRODUCTION_YOOKASSA_SECRET_KEY="$PRODUCTION_YOOKASSA_SECRET_KEY"',
    );
    expect(productionWorkflow).toContain(
      'https://ultimatehockey.ru/inventory?tab=bank&payment=return',
    );
  });

  it('allows both credentials to be absent but rejects a partial production configuration', () => {
    expect(productionWorkflow).toContain(
      'if [ -z "$PRODUCTION_YOOKASSA_SHOP_ID" ] && [ -z "$PRODUCTION_YOOKASSA_SECRET_KEY" ]; then',
    );
    expect(productionWorkflow).toContain(
      'elif [ -z "$PRODUCTION_YOOKASSA_SHOP_ID" ] || [ -z "$PRODUCTION_YOOKASSA_SECRET_KEY" ]; then',
    );
    expect(productionWorkflow).toContain(
      'PRODUCTION_YOOKASSA_SHOP_ID and PRODUCTION_YOOKASSA_SECRET_KEY must both be set or both be empty',
    );
  });

  it('exposes YooKassa only to the production API server', () => {
    expect(productionServerCompose).toContain(
      'YOOKASSA_SHOP_ID: ${PRODUCTION_YOOKASSA_SHOP_ID:-}',
    );
    expect(productionServerCompose).toContain(
      'YOOKASSA_SECRET_KEY: ${PRODUCTION_YOOKASSA_SECRET_KEY:-}',
    );
    expect(productionServerCompose).toContain(
      'YOOKASSA_RETURN_URL: ${PRODUCTION_YOOKASSA_RETURN_URL:-}',
    );
    expect(productionPushWorkerCompose).not.toContain('YOOKASSA_');
  });
});

describe('production review access wiring', () => {
  it('enables the revocable access-code route and its login control in production', () => {
    expect(productionWorkflow).toContain('VITE_DEV_ACCESS_CODE_LOGIN_ENABLED=true');
    expect(productionWorkflow).toContain('DEV_ACCESS_CODE_LOGIN_ENABLED=true');
  });
});
