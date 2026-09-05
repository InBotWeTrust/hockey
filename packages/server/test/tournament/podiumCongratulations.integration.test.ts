import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  acknowledgeRegularSeasonPodiumCongratulation,
  listPendingRegularSeasonPodiumCongratulations,
} from '../../src/tournament/podiumCongratulations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const PLAYER_ID = '00000000-0000-4000-8000-000000000951';
const OTHER_PLAYER_ID = '00000000-0000-4000-8000-000000000952';

describe.skipIf(!hasIntegrationEnv)('regular season podium congratulations', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, 'Podium Player', 'Europe/Moscow', 'player'),
              ($2, 'Other Player', 'Europe/Moscow', 'player')`,
      [PLAYER_ID, OTHER_PLAYER_ID],
    );
  });

  async function insertCongratulation(input: {
    slug: string;
    title: string;
    place: 1 | 2 | 3;
    createdAt: string;
  }): Promise<{ congratulationId: string; tournamentId: string }> {
    const tournament = await pool.query<{ id: string }>(
      `insert into tournament
         (slug, title, regular_source, visibility, created_by)
       values ($1, $2, 'head_to_head', 'public', $3)
       returning id`,
      [input.slug, input.title, PLAYER_ID],
    );
    const congratulation = await pool.query<{ id: string }>(
      `insert into tournament_regular_podium_congratulation
         (tournament_id, user_id, place, tournament_title,
          reward_coins, reward_stars, reward_experience, created_at)
       values ($1, $2, $3, $4, 5000, 25, 1500, $5)
       returning id`,
      [tournament.rows[0]!.id, PLAYER_ID, input.place, input.title, input.createdAt],
    );
    return {
      congratulationId: congratulation.rows[0]!.id,
      tournamentId: tournament.rows[0]!.id,
    };
  }

  it('lists pending congratulations oldest first with reward snapshots', async () => {
    const older = await insertCongratulation({
      slug: 'older-cup',
      title: 'Старый кубок',
      place: 2,
      createdAt: '2026-09-02T21:00:00.000Z',
    });
    const newer = await insertCongratulation({
      slug: 'newer-cup',
      title: 'Кубок Ледовой арены',
      place: 1,
      createdAt: '2026-09-03T21:00:00.000Z',
    });

    expect(await listPendingRegularSeasonPodiumCongratulations(pool, PLAYER_ID)).toEqual([
      {
        id: older.congratulationId,
        tournamentId: older.tournamentId,
        tournamentTitle: 'Старый кубок',
        place: 2,
        reward: { coins: 5000, stars: 25, experience: 1500 },
        createdAt: '2026-09-02T21:00:00.000Z',
      },
      {
        id: newer.congratulationId,
        tournamentId: newer.tournamentId,
        tournamentTitle: 'Кубок Ледовой арены',
        place: 1,
        reward: { coins: 5000, stars: 25, experience: 1500 },
        createdAt: '2026-09-03T21:00:00.000Z',
      },
    ]);
  });

  it('acknowledges only the owner and remains idempotent across devices', async () => {
    const { congratulationId } = await insertCongratulation({
      slug: 'owner-cup',
      title: 'Кубок владельца',
      place: 1,
      createdAt: '2026-09-03T21:00:00.000Z',
    });

    await expect(
      acknowledgeRegularSeasonPodiumCongratulation(pool, {
        congratulationId,
        userId: OTHER_PLAYER_ID,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });

    await expect(
      acknowledgeRegularSeasonPodiumCongratulation(pool, {
        congratulationId,
        userId: PLAYER_ID,
      }),
    ).resolves.toEqual({ acknowledged: true });
    await expect(
      acknowledgeRegularSeasonPodiumCongratulation(pool, {
        congratulationId,
        userId: PLAYER_ID,
      }),
    ).resolves.toEqual({ acknowledged: true });

    expect(await listPendingRegularSeasonPodiumCongratulations(pool, PLAYER_ID)).toEqual([]);
  });
});
