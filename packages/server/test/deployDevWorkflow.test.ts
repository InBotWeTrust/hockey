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

describe('dev YooKassa deployment wiring', () => {
  it('forwards required staging credentials only into the dev server overlay', () => {
    expect(workflow).toContain('STAGING_YOOKASSA_SHOP_ID: ${{ secrets.STAGING_YOOKASSA_SHOP_ID }}');
    expect(workflow).toContain(
      'STAGING_YOOKASSA_SECRET_KEY: ${{ secrets.STAGING_YOOKASSA_SECRET_KEY }}',
    );
    expect(workflow).toContain('STAGING_YOOKASSA_SHOP_ID="$STAGING_YOOKASSA_SHOP_ID"');
    expect(workflow).toContain('STAGING_YOOKASSA_SECRET_KEY="$STAGING_YOOKASSA_SECRET_KEY"');
    expect(workflow).toMatch(
      /for name in[\s\S]*STAGING_YOOKASSA_SHOP_ID[\s\S]*STAGING_YOOKASSA_SECRET_KEY[\s\S]*do/,
    );
    expect(compose).toContain('YOOKASSA_SHOP_ID: ${STAGING_YOOKASSA_SHOP_ID:-}');
    expect(compose).toContain('YOOKASSA_SECRET_KEY: ${STAGING_YOOKASSA_SECRET_KEY:-}');
  });

  it('uses the exact dev return URL for YooKassa redirects', () => {
    expect(compose).toContain(
      'YOOKASSA_RETURN_URL: https://dev.hockey.inbotwetrust.ru/inventory?tab=bank&payment=return',
    );
  });
});
