import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  import.meta.dirname,
  '../db/migrations/181_remove_training_hub_intro.sql',
);

describe('migration 181 removes the training hub introduction', () => {
  it('deletes the obsolete destination and keeps the three training section destinations', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/delete from arsenich_destination_intro\s+where destination_key = 'training'/i);
    expect(sql).not.toMatch(/'training'\s*,/);
    expect(sql).toContain("'training-course'");
    expect(sql).toContain("'training-advanced'");
    expect(sql).toContain("'training-open'");
  });
});
