import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/deploy-dev.yml', import.meta.url), 'utf8');
const commands = workflow.replace(/\\\n\s*/g, ' ');

describe('dev deployment production isolation', () => {
  it('recreates only staging application services', () => {
    const recreateCommands = commands.split('\n').filter(line => /docker compose .*up .*--force-recreate/.test(line));
    expect(recreateCommands).toHaveLength(1);
    expect(recreateCommands[0]).toMatch(/up -d --force-recreate server-dev push-worker-dev web-dev < \/dev\/null/);
  });

  it('leaves the shared proxy configuration under production deployment control', () => {
    const uploads = commands.split('\n').filter(line => /\bscp\b/.test(line));
    expect(uploads.length).toBeGreaterThan(0);
    expect(uploads.join('\n')).not.toContain('Caddyfile');
    expect(commands).not.toMatch(/docker (?:compose|exec|restart|stop|kill).*\bcaddy\b/);
  });
});
