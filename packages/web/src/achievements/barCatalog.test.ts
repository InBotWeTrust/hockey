import { describe, expect, it } from 'vitest';
import { buildBarAchievements, barAchievementDefinitions } from './barCatalog.js';
describe('bar achievement catalogue', () => {
  it('contains every separate mode and reward stage from the agreed list', () => {
    expect(barAchievementDefinitions).toHaveLength(95);
    expect(new Set(barAchievementDefinitions.map((x) => x.id)).size).toBe(95);
    expect(barAchievementDefinitions.reduce((n, x) => n + x.levels.length, 0)).toBe(268);
    expect(
      barAchievementDefinitions.reduce((n, x) => n + x.levels.reduce((s, l) => s + l.stars, 0), 0),
    ).toBe(10363);
  });
  it('redacts inaccessible characters before the UI receives beginner cards', () => {
    const cards = buildBarAchievements('beginner');
    const hidden = cards.filter((x) => x.accessRequirement);
    expect(hidden.length).toBeGreaterThan(0);
    for (const x of hidden) {
      expect(JSON.stringify(x)).not.toMatch(/Арсенич|Тимофей|Мария|Элина|шашк|дурак|морской/iu);
      expect(x.title).toBe('Неизвестное задание');
      expect(x.rewardStars).toBe(0);
      expect(x.isClaimable).toBe(false);
      expect(x.requirement).toBe('Доступно со статуса «Любитель»');
    }
  });
  it('opens the entire catalogue for amateurs and preserves exact pool margins', () => {
    const cards = buildBarAchievements('amateur');
    expect(cards.every((x) => !x.accessRequirement)).toBe(true);
    const pool = barAchievementDefinitions.find((x) => x.number === 9);
    expect(pool?.levels.map((x) => x.target)).toEqual([3, 4, 5, 6]);
    expect(pool?.levels.map((x) => x.stars)).toEqual([3, 5, 8, 12]);
    expect(barAchievementDefinitions.find((x) => x.number === 38)?.levels).toHaveLength(2);
    expect(barAchievementDefinitions.find((x) => x.number === 4)?.levels[0]?.target).toBe(9);
  });
});
