import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBeginnerStoryResetArgs } from '../../src/ops/beginnerStoryResetCli.js';
import { RESET_KEY } from '../../src/ops/beginnerStoryReset.js';

describe('beginner reset release safeguards', () => {
  it('requires the exact confirmation key to apply', () => {
    expect(parseBeginnerStoryResetArgs([], undefined)).toEqual({ apply: false });
    expect(() => parseBeginnerStoryResetArgs(['--apply'], undefined)).toThrow('confirmation key');
    expect(parseBeginnerStoryResetArgs(['--apply'], RESET_KEY)).toEqual({ apply: true });
    expect(() => parseBeginnerStoryResetArgs(['--all'], RESET_KEY)).toThrow('unknown argument');
  });
  it('keeps reset opt-in and verifies the backup before applying with detached stdin', () => {
    const workflow = readFileSync(new URL('../../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
    expect(workflow).toMatch(/reset_beginner_onboarding:[\s\S]*?default: false/);
    const block = workflow.slice(workflow.indexOf('          if [ "$RESET_BEGINNER_ONBOARDING"'));
    expect(block.indexOf('pg_restore --list')).toBeLessThan(block.indexOf('beginnerStoryResetCli.js --apply'));
    expect(block).toContain('> "$BEGINNER_BACKUP_FILE" < /dev/null');
    expect(block).toContain('beginnerStoryResetCli.js --apply < /dev/null');
  });
});
