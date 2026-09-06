import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACHIEVEMENT_SEEDS } from '../../src/achievements/catalog.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const expectedTournamentAchievements = [
  ['regular-season-medalist', 'Призёр регулярки', 220, 45, 45, 2],
  ['playoff-semifinal', 'Турнирный характер', 100, 50, 50, 1],
  ['no-shake', 'Без дрожи', 0, 20, 20, 0],
  ['dark-horse', 'Тёмная лошадка', 0, 25, 25, 0],
  ['regular-season-champion', 'Победитель регулярки', 250, 50, 50, 3],
  ['playoff-final', 'Финальный лёд', 150, 75, 75, 2],
  ['series-comeback', 'Мощный камбэк', 0, 35, 35, 0],
  ['tournament-cup', 'Кубок над головой', 1000, 100, 100, 5],
  ['death-bracket', 'Сетка смерти', 0, 25, 25, 0],
  ['tournament-streak', 'Турнирная серия', 2500, 250, 250, 5],
] as const;

function tuple(achievement: (typeof ACHIEVEMENT_SEEDS)[number]) {
  return [
    achievement.id,
    achievement.title,
    achievement.rewardCurrency,
    achievement.rewardStars,
    achievement.rewardExperience,
    achievement.rewardTokens,
  ];
}

describe('tournament achievement catalogue', () => {
  it('versions every bundled artwork URL so clients cannot reuse stale thumbnails', () => {
    expect(ACHIEVEMENT_SEEDS).not.toHaveLength(0);
    expect(
      ACHIEVEMENT_SEEDS.every((achievement) =>
        /^\/achievements\/[^?]+\.webp\?v=20260906-hd1$/.test(achievement.photoUrl),
      ),
    ).toBe(true);
  });

  it('defines ten active tournament achievements with the approved rewards', () => {
    const tournamentAchievements = ACHIEVEMENT_SEEDS.filter(
      (achievement) => achievement.category === 'tournament',
    );

    expect(tournamentAchievements).toHaveLength(10);
    expect(
      tournamentAchievements.every((achievement) => achievement.availability === 'active'),
    ).toBe(true);
    expect(tournamentAchievements.every((achievement) => achievement.futureTag === null)).toBe(
      true,
    );
    expect(
      tournamentAchievements.map(tuple).sort((left, right) => left[0].localeCompare(right[0])),
    ).toEqual(
      [...expectedTournamentAchievements].sort((left, right) => left[0].localeCompare(right[0])),
    );
  });
});

describe.skipIf(!hasIntegrationEnv)('migration 103 tournament achievements', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('stores the same ten active achievements in PostgreSQL', async () => {
    const { rows } = await pool.query<{
      id: string;
      title: string;
      availability: string;
      future_tag: string | null;
      reward_currency: number;
      reward_stars: number;
      reward_experience: number;
      reward_tokens: number;
      photo_url: string;
    }>(
      `select id, title, availability, future_tag, photo_url,
              reward_currency, reward_stars, reward_experience, reward_tokens
         from achievements
        where category = 'tournament'
        order by id`,
    );

    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.availability === 'active' && row.future_tag === null)).toBe(
      true,
    );
    expect(
      rows.every((row) => /^\/achievements\/[^?]+\.webp\?v=20260906-hd1$/.test(row.photo_url)),
    ).toBe(true);
    expect(
      rows.map((row) => [
        row.id,
        row.title,
        row.reward_currency,
        row.reward_stars,
        row.reward_experience,
        row.reward_tokens,
      ]),
    ).toEqual(
      [...expectedTournamentAchievements].sort((left, right) => left[0].localeCompare(right[0])),
    );
  });
});
