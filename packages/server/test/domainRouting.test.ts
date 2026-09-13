import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function repoFile(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

const caddy = repoFile('Caddyfile');
const compose = repoFile('docker-compose.yml');
const productionWorkflow = repoFile('.github/workflows/deploy.yml');
const devWorkflow = repoFile('.github/workflows/deploy-dev.yml');

describe('production domain migration phase 1', () => {
  it('serves canonical and legacy production hosts while redirecting www', () => {
    expect(caddy).toContain('{$APP_DOMAIN}, {$LEGACY_APP_DOMAIN}');
    expect(caddy).toContain('{$WWW_APP_DOMAIN}');
    expect(caddy).toContain('redir https://{$APP_DOMAIN}{uri} 308');
    expect(caddy).toContain('{$DEV_APP_DOMAIN}');
  });

  it('gives shared Caddy explicit safe hostname defaults', () => {
    expect(compose).toContain('APP_DOMAIN: ${APP_DOMAIN:-ultimatehockey.ru}');
    expect(compose).toContain(
      'LEGACY_APP_DOMAIN: ${LEGACY_APP_DOMAIN:-hockey.inbotwetrust.ru}',
    );
    expect(compose).toContain('WWW_APP_DOMAIN: ${WWW_APP_DOMAIN:-www.ultimatehockey.ru}');
    expect(compose).toContain(
      'DEV_APP_DOMAIN: ${DEV_APP_DOMAIN:-dev.hockey.inbotwetrust.ru}',
    );
  });

  it('smokes the canonical production origin and keeps the legacy host explicit', () => {
    expect(productionWorkflow).toContain('APP_DOMAIN: ultimatehockey.ru');
    expect(productionWorkflow).toContain('LEGACY_APP_DOMAIN: hockey.inbotwetrust.ru');
    expect(productionWorkflow).toContain('WWW_APP_DOMAIN: www.ultimatehockey.ru');
    expect(productionWorkflow).toContain(
      'HEALTH_URL: https://ultimatehockey.ru/api/health',
    );
    expect(productionWorkflow).toContain('LEGACY_URL: https://hockey.inbotwetrust.ru');
  });

  it('keeps dev on its current host and preserves production hosts for shared Caddy', () => {
    expect(devWorkflow).toContain('DEV_APP_DOMAIN: dev.hockey.inbotwetrust.ru');
    expect(devWorkflow).toContain('APP_DOMAIN: ultimatehockey.ru');
    expect(devWorkflow).toContain('LEGACY_APP_DOMAIN: hockey.inbotwetrust.ru');
    expect(devWorkflow).toContain('WWW_APP_DOMAIN: www.ultimatehockey.ru');
    expect(devWorkflow).toContain(
      'HEALTH_URL: https://dev.hockey.inbotwetrust.ru/api/health',
    );
  });
});
