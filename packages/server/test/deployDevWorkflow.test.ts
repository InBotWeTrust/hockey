import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const productionWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const productionCompose = readFileSync(
  new URL('../../../docker-compose.yml', import.meta.url),
  'utf8',
);
const productionServerCompose = productionCompose.slice(
  productionCompose.indexOf('  server:'),
  productionCompose.indexOf('  push-worker:'),
);
const productionPushWorkerCompose = productionCompose.slice(
  productionCompose.indexOf('  push-worker:'),
  productionCompose.indexOf('  web:'),
);
const productionSshCommand = productionWorkflow.slice(
  productionWorkflow.indexOf('          ssh -i ~/.ssh/id_ed25519'),
  productionWorkflow.indexOf("            bash -s <<'ENDSSH'"),
);

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
