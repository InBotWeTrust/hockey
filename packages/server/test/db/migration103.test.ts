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
  ['regular-season-medalist', 'Призёр регулярки', 50, 100, 100],
  ['playoff-semifinal', 'Турнирный характер', 75, 150, 150],
  ['no-shake', 'Без дрожи', 75, 150, 150],
  ['dark-horse', 'Тёмная лошадка', 100, 200, 200],
  ['regular-season-champion', 'Победитель регулярки', 125, 250, 250],
  ['playoff-final', 'Финальный лёд', 125, 250, 250],
  ['series-comeback', 'Мощный камбэк', 150, 300, 300],
  ['tournament-cup', 'Кубок над головой', 200, 400, 400],
  ['death-bracket', 'Сетка смерти', 250, 500, 500],
  ['tournament-streak', 'Турнирная серия', 300, 700, 700],
] as const;

function tuple(achievement: (typeof ACHIEVEMENT_SEEDS)[number]) {
  return [
    achievement.id,
    achievement.title,
    achievement.rewardCurrency,
    achievement.rewardStars,
    achievement.rewardExperience,
  ];
}

describe('tournament achievement catalogue', () => {
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
    }>(
      `select id, title, availability, future_tag,
              reward_currency, reward_stars, reward_experience
         from achievements
        where category = 'tournament'
        order by id`,
    );

    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.availability === 'active' && row.future_tag === null)).toBe(
      true,
    );
    expect(
      rows.map((row) => [
        row.id,
        row.title,
        row.reward_currency,
        row.reward_stars,
        row.reward_experience,
      ]),
    ).toEqual(
      [...expectedTournamentAchievements].sort((left, right) => left[0].localeCompare(right[0])),
    );
  });
});
