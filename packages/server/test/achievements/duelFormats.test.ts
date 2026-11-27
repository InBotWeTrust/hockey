import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_SEEDS } from '../../src/achievements/catalog.js';
import { ACHIEVEMENT_STAGE_DEFINITIONS } from '../../src/achievements/stageCatalog.js';

const ids = (id: string) => ACHIEVEMENT_STAGE_DEFINITIONS.filter((s) => s.achievementId === id);
describe('duel format achievement catalogue', () => {
  it('exposes 25 claimable task chains including two independent Marathon variants', () => {
    const cards = ACHIEVEMENT_SEEDS.filter(
      (s) =>
        s.id.startsWith('duel-format-') ||
        s.id.startsWith('duel-sniper-') ||
        s.id.startsWith('duel-marathon-') ||
        s.id.startsWith('duel-rhythm-') ||
        s.id === 'duel-universal',
    );
    expect(cards).toHaveLength(25);
    expect(cards.every((s) => s.category === 'duel' && s.availability === 'active')).toBe(true);
    expect(cards.reduce((sum, card) => sum + ids(card.id).length, 0)).toBe(124);
    for (const format of [
      'express',
      'mix',
      'classic',
      'sniper',
      'marathon-4',
      'marathon-7',
      'rhythm',
    ]) {
      expect(ids(`duel-format-${format}-wins`).map((s) => s.target.total)).toEqual([
        1, 5, 15, 50, 100, 250, 500, 1000,
      ]);
      expect(ids(`duel-format-${format}-streak`).map((s) => s.target.total)).toEqual([2, 5, 7, 10]);
    }
    for (const card of cards) {
      expect(card.photoUrl.startsWith('/achievements/duel-formats/')).toBe(true);
      const full = resolve(process.cwd(), '../web/public', card.photoUrl.split('?')[0]!.slice(1));
      const thumb = full.replace(
        '/achievements/duel-formats/',
        '/achievements/thumbnails/duel-formats/',
      );
      expect(existsSync(thumb)).toBe(true);
      expect(statSync(full).size).toBeLessThanOrEqual(100000);
      expect(statSync(thumb).size).toBeLessThanOrEqual(14000);

      expect(
        existsSync(resolve(process.cwd(), '../web/public', card.photoUrl.split('?')[0]!.slice(1))),
      ).toBe(true);
      expect(
        ids(card.id).every(
          (s) =>
            s.rewardStars > 0 &&
            s.rewardExperience === s.rewardStars &&
            s.rewardCurrency === 0 &&
            s.rewardTokens === 0,
        ),
      ).toBe(true);
    }
  });
  it('uses the requested within-match thresholds, including the one-time two-point Jeweler', () => {
    expect(ids('duel-sniper-jeweler').map((s) => s.target.total)).toEqual([2]);
    for (const window of [4, 7])
      expect(ids(`duel-marathon-${window}-tempo`).map((s) => s.target.total)).toEqual([
        5, 10, 20, 30, 40, 50, 60,
      ]);
    expect(ids('duel-rhythm-wave').map((s) => s.target.total)).toEqual([4, 10, 15, 20, 30, 40, 50]);
    expect(ids('duel-universal').map((s) => s.target.total)).toEqual([
      1, 5, 10, 20, 50, 100, 300, 500,
    ]);
  });
});
