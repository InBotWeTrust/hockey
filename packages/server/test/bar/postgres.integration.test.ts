import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { getTestUrls, hasIntegrationEnv } from '../helpers/testDb.js';
import { getBarBoard, getBarLive } from '../../src/bar/service.js';
// Requires an already migrated isolated integration database. Never reset storage here.
describe.skipIf(!hasIntegrationEnv)('bar PostgreSQL read-only query contracts', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = new Pool({
      connectionString: getTestUrls().databaseUrl,
      options: '-c default_transaction_read_only=on',
    });
  });
  afterAll(async () => {
    await pool?.end();
  });
  it('queries both groups against the migrated schema with bounded public data', async () => {
    const board = await getBarBoard(pool, 0);
    expect(board.online.length).toBeLessThanOrEqual(40);
    expect(board.upcoming.length).toBeLessThanOrEqual(40);
    expect(board.online.every((m) => m.group === 'online')).toBe(true);
    expect(board.upcoming.every((m) => m.group === 'upcoming')).toBe(true);
    expect(JSON.stringify(board)).not.toMatch(/match_seed|rules_snapshot|input_payload/);
  });
  it('does not resolve a nonexistent public duel or fixture', async () => {
    for (const kind of ['duel', 'tournament'] as const)
      expect(await getBarLive(pool, kind, '11111111-1111-4111-8111-111111111111')).toEqual({
        match: null,
        shots: [],
        complete: true,
        playbackId: null,
      });
  });
  it('has the committed read indexes available', async () => {
    const result = await pool.query(
      "select indexname from pg_indexes where indexname in ('shot_session_bar_recent_idx','amateur_duel_match_bar_open_idx')",
    );
    expect(result.rows).toHaveLength(2);
  });
});
