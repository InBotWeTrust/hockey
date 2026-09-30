import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../../db/migrations/168_move_monthly_rating_achievements_to_duels.sql', import.meta.url);

describe('migration 168 monthly rating achievement categories', () => {
  it('moves only the two monthly rating achievements into duels', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toMatch(/update achievements\s+set category = 'duel'/i);
    expect(sql).toContain("'monthly-top-1'");
    expect(sql).toContain("'monthly-top-3'");
    expect(sql).toMatch(/where id in \([\s\S]*monthly-top-1[\s\S]*monthly-top-3[\s\S]*\)/i);
  });
});
