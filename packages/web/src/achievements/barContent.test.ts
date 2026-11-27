import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBarAchievements, barAchievementDefinitions } from './barCatalog.js';
import { achievementThumbnailUrl } from './artwork.js';
describe('bar achievement authored content', () => {
  it('keeps the real server catalogue equal to the reviewed preview', () => {
    const live = JSON.parse(
      readFileSync(resolve(process.cwd(), '../server/src/achievements/barCatalog.json'), 'utf8'),
    );
    expect(live).toEqual(barAchievementDefinitions);
  });
  it('has authored descriptions distinct from exact level requirements', () => {
    for (const achievement of buildBarAchievements('amateur')) {
      expect(achievement.description.length, achievement.id).toBeGreaterThan(55);
      expect(achievement.description, achievement.id).not.toBe(achievement.requirement);
    }
  });
  it('uses a unique thematic image for each numbered achievement', () => {
    const definitions = new Map(barAchievementDefinitions.map((x) => [x.number, x]));
    expect(definitions.size).toBe(54);
    expect(new Set([...definitions.values()].map((x) => x.photoUrl)).size).toBe(54);
    for (const def of definitions.values()) {
      expect(def.photoUrl).toMatch(/^\/achievements\/bar\/.+-v1\.webp$/);
      const full = new URL('../../public' + def.photoUrl, import.meta.url);
      const thumbnail = new URL(
        '../../public' + achievementThumbnailUrl(def.photoUrl),
        import.meta.url,
      );
      expect(existsSync(full), def.photoUrl).toBe(true);
      expect(existsSync(thumbnail), achievementThumbnailUrl(def.photoUrl)).toBe(true);
      expect(statSync(full).size).toBeLessThanOrEqual(100_000);
      expect(statSync(thumbnail).size).toBeLessThanOrEqual(14_000);
    }
  });
});
