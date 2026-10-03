import type { Pool } from 'pg';
import { onboardingStepInputSchema } from '../../src/onboarding/types.js';
import { describe, expect, it, vi } from 'vitest';
import { BEGINNER_STORY_TUTORIAL_STEP, RESET_KEY, resetBeginnerStory } from '../../src/ops/beginnerStoryReset.js';

function fakePool(previous = false, published = true, failPublication = false) {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (failPublication && sql.includes('insert into onboarding_step')) throw new Error('publication failure');
    if (sql.includes('select payload')) return { rows: previous ? [{ payload: { usersReset: 12 } }] : [] };
    if (sql.includes('select chain.key')) return { rows: published ? [{ id: 'chain' }] : [] };
    if (sql.includes('insert into onboarding_version')) return { rows: [{ id: 'new-version' }] };
    if (sql.includes('update users')) return { rows: [], rowCount: 12 };
    return { rows: [] };
  });
  const release = vi.fn();
  return { pool: { connect: async () => ({ query, release }) } as unknown as Pool, statements, release };
}

describe('one-time beginner story reset', () => {
  it('rolls back by default and preserves other user fields', async () => {
    const f = fakePool();
    expect(await resetBeginnerStory(f.pool, { apply: false })).toEqual({ usersReset: 12, applied: false, alreadyApplied: false });
    expect(f.statements.at(-1)).toBe('rollback');
    const update = f.statements.find((s) => s.includes('update users'))!;
    expect(update).toContain('beginner_onboarding_completed = false');
    expect(update).toContain('beginner_onboarding_reset_at = transaction_timestamp()');
    expect(update).not.toMatch(/amateur|competition_level|goals|password|delete/i);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it('commits with a durable marker and serializes concurrent retries', async () => {
    const f = fakePool();
    expect(await resetBeginnerStory(f.pool, { apply: true })).toEqual({ usersReset: 12, applied: true, alreadyApplied: false });
    expect(f.statements.some((s) => s.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(f.statements.some((s) => s.includes('insert into production_data_operations'))).toBe(true);
    expect(f.statements.at(-1)).toBe('commit');
    expect(RESET_KEY).toContain('beginner');
  });
  it('does not reset users again after the operation was applied', async () => {
    const f = fakePool(true);
    expect((await resetBeginnerStory(f.pool, { apply: true })).alreadyApplied).toBe(true);
    expect(f.statements.some((s) => s.includes('update users'))).toBe(false);
  });
  it('publishes the cinematic tutorial contract when production has no beginner version', async () => {
    const f = fakePool(false, false);
    expect((await resetBeginnerStory(f.pool, { apply: true })).publishedVersionCreated).toBe(true);
    expect(onboardingStepInputSchema.parse(BEGINNER_STORY_TUTORIAL_STEP)).toEqual(BEGINNER_STORY_TUTORIAL_STEP);
    expect(f.statements.some((s) => s.includes('insert into onboarding_version'))).toBe(true);
    expect(f.statements.some((s) => s.includes('insert into onboarding_step'))).toBe(true);
    expect(f.statements.findIndex((s) => s.includes('insert into onboarding_step'))).toBeLessThan(
      f.statements.findIndex((s) => s.includes('update users')),
    );
    expect(f.statements.join(' ')).not.toMatch(/delete|truncate|status = 'draft'|amateur/);
    expect(f.statements.at(-1)).toBe('commit');
  });
  it('rolls back publication failures before touching users', async () => {
    const f = fakePool(false, false, true);
    await expect(resetBeginnerStory(f.pool, { apply: true })).rejects.toThrow('publication failure');
    expect(f.statements.at(-1)).toBe('rollback');
    expect(f.statements.some((s) => s.includes('update users'))).toBe(false);
  });
  it('preserves an existing published version and all drafts', async () => {
    const f = fakePool();
    await resetBeginnerStory(f.pool, { apply: true });
    expect(f.statements.some((s) => s.includes('insert into onboarding_version'))).toBe(false);
  });
});
