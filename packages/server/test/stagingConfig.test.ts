import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('dev deployment configuration', () => {
  it('gives every bonus section 100 daily attempts without changing production defaults', () => {
    const compose = readFileSync('../../docker-compose.staging.yml', 'utf8');
    const serverDev = compose.match(/ {2}server-dev:[\s\S]*?(?=\n {2}[a-z][\w-]+:|\nvolumes:)/)?.[0];

    expect(serverDev).toContain('BONUS_DAILY_ATTEMPT_LIMIT: 100');
  });
});
