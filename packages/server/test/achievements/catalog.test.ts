import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_SEEDS } from '../../src/achievements/catalog.js';
import {
  ACHIEVEMENT_STAGE_DEFINITIONS,
  TIERED_ACHIEVEMENT_IDS,
} from '../../src/achievements/stageCatalog.js';

type ExpectedReward = readonly [coins: number, stars: number, experience: number, tokens: number];

const EXPECTED_REWARDS: Record<string, ExpectedReward> = {
  'ideal-day': [0, 25, 25, 0],
  'first-goal': [0, 1, 1, 0],
  'first-daily-game': [0, 2, 2, 0],
  'first-training': [0, 2, 2, 0],
  'amateur-ticket': [25_000, 250, 250, 0],
  'pro-ticket': [0, 0, 0, 0],
  'daily-sniper-streak': [0, 5, 5, 0],
  'ice-hand': [0, 5, 5, 0],
  'third-period-decides': [0, 5, 5, 0],
  'final-push': [0, 5, 5, 0],
  'no-panic': [0, 5, 5, 0],
  'dry-finish': [0, 5, 5, 0],
  'keeping-fit': [0, 15, 15, 0],
  'sniper-week': [0, 20, 20, 0],
  'sniper-month': [0, 50, 50, 0],
  'training-monster': [0, 5, 5, 0],
  'rhythm-control': [0, 5, 5, 0],
  'cold-start': [0, 3, 3, 0],
  'no-warmup-needed': [0, 2, 2, 0],
  'finish-machine': [0, 3, 3, 0],
  underdog: [0, 8, 8, 0],
  'classic-speed': [0, 3, 3, 0],
  'nervous-finish': [0, 8, 8, 0],
  'stable-student': [0, 15, 15, 0],
  'training-before-battle': [0, 5, 5, 0],
  'dangerous-host': [0, 5, 5, 0],
  blowout: [0, 3, 3, 0],
  'thin-edge': [0, 3, 3, 0],
  revenge: [0, 5, 5, 0],
  'hunter-streak': [0, 10, 10, 0],
  'clean-win': [0, 5, 5, 0],
  'dangerous-guest': [0, 8, 8, 0],
  'no-room-for-error': [0, 3, 3, 0],
  wallet: [0, 15, 15, 0],
  'regular-season-champion': [1_500, 50, 50, 0],
  'regular-season-medalist': [1_000, 45, 45, 0],
  'playoff-semifinal': [750, 50, 50, 0],
  'playoff-final': [1_500, 75, 75, 0],
  'tournament-cup': [3_750, 100, 100, 0],
  'dark-horse': [0, 25, 25, 0],
  'death-bracket': [0, 25, 25, 0],
  'series-comeback': [0, 35, 35, 0],
  'no-shake': [0, 20, 20, 0],
  'tournament-streak': [7_500, 250, 250, 0],
  'monthly-top-1': [7_500, 100, 100, 0],
  'monthly-top-3': [3_750, 50, 50, 0],
};

describe('achievement economy catalog', () => {
  it('explains the exact experience comparison for the dark horse achievement', () => {
    expect(ACHIEVEMENT_SEEDS.find((achievement) => achievement.id === 'dark-horse')?.requirement)
      .toBe('Выиграть серию плей-офф у соперника, у которого на начало серии больше опыта.');
  });

  it('keeps the approved reward for every in-scope achievement', () => {
    const byId = new Map(ACHIEVEMENT_SEEDS.map((achievement) => [achievement.id, achievement]));

    for (const [id, [coins, stars, experience, tokens]] of Object.entries(EXPECTED_REWARDS)) {
      const achievement = byId.get(id) as
        | (NonNullable<ReturnType<typeof byId.get>> & { rewardTokens?: number })
        | undefined;
      expect(achievement, id).toBeDefined();
      expect(
        [
          achievement?.rewardCurrency,
          achievement?.rewardStars,
          achievement?.rewardExperience,
          achievement?.rewardTokens,
        ],
        id,
      ).toEqual([coins, stars, experience, tokens]);
    }
  });

  it('hides removed achievements and activates the approved monthly rating rewards', () => {
    const byId = new Map(ACHIEVEMENT_SEEDS.map((achievement) => [achievement.id, achievement]));

    for (const id of [
      'steady-tempo',
      'almost-perfect-training',
      'handled-pressure',
      'economical-master',
      'master-arsenal',
      'no-room-for-error',
      'tournament-streak',
    ]) {
      expect(byId.get(id)?.availability, id).toBe('hidden');
    }
    expect(byId.get('monthly-top-1')).toMatchObject({
      availability: 'active',
      rewardCurrency: 7_500,
      rewardStars: 100,
      rewardExperience: 100,
      rewardTokens: 0,
    });
    expect(byId.get('monthly-top-3')).toMatchObject({
      availability: 'active',
      rewardCurrency: 3_750,
      rewardStars: 50,
      rewardExperience: 50,
      rewardTokens: 0,
    });
  });

  it('exposes career and contiguous configured stages for every tiered achievement', () => {
    expect(ACHIEVEMENT_CATEGORIES).toContain('career');

    for (const achievementId of TIERED_ACHIEVEMENT_IDS) {
      const stages = ACHIEVEMENT_STAGE_DEFINITIONS.filter(
        (stage) => stage.achievementId === achievementId,
      );
      expect(stages.length, achievementId).toBeGreaterThan(1);
      expect(
        stages.map((stage) => stage.stageNumber),
        achievementId,
      ).toEqual(Array.from({ length: stages.length }, (_, index) => index + 1));
      expect(
        stages.every(
          (stage) =>
            stage.rewardCurrency >= 0 &&
            stage.rewardStars >= 0 &&
            stage.rewardExperience >= 0 &&
            stage.rewardTokens >= 0,
        ),
        achievementId,
      ).toBe(true);
    }

    expect(TIERED_ACHIEVEMENT_IDS).toEqual(
      new Set([
        'career-goals',
        'career-experience',
        'career-streak',
        'daily-sniper-streak',
        'ice-hand',
        'third-period-decides',
        'final-push',
        'no-panic',
        'dry-finish',
        'keeping-fit',
        'sniper-week',
        'sniper-month',
        'training-monster',
        'rhythm-control',
        'cold-start',
        'no-warmup-needed',
        'finish-machine',
        'underdog',
        'classic-speed',
        'stable-student',
        'training-before-battle',
        'dangerous-host',
        'dangerous-guest',
        'blowout',
        'hunter-streak',
        'express-sniper',
        'mix-sniper',
        'no-error-express',
        'no-error-mix',
        'no-error-classic',
        'monthly-top-1',
        'monthly-top-3',
        'regular-season-champion',
        'regular-season-medalist',
        'playoff-semifinal',
        'playoff-final',
        'tournament-cup',
        'series-comeback',
        'no-shake',
      ]),
    );
  });

  it('keeps exact boundary stages and rewards from the approved design', () => {
    const byKey = new Map(
      ACHIEVEMENT_STAGE_DEFINITIONS.map((stage) => [
        `${stage.achievementId}:${stage.stageNumber}`,
        stage,
      ]),
    );

    expect(byKey.get('career-goals:8')).toMatchObject({
      target: { total: 1_000_000 },
      rewardStars: 1_000,
      rewardExperience: 1_000,
      rewardTokens: 0,
    });
    expect(byKey.get('ice-hand:2')).toMatchObject({
      target: { accuracyPercent: 92 },
      rewardStars: 6,
      rewardExperience: 6,
    });
    expect(byKey.get('stable-student:7')).toMatchObject({
      target: { days: 100, minimumAccuracyPercent: 80 },
      rewardStars: 120,
      rewardExperience: 120,
      rewardTokens: 0,
    });
    expect(byKey.get('mix-sniper:8')).toMatchObject({
      target: { format: 'mix', goals: 110 },
      rewardStars: 12,
      rewardExperience: 12,
    });
    expect(byKey.get('no-error-classic:6')).toMatchObject({
      target: { format: 'classic', maximumNonGoals: 0 },
      rewardStars: 10,
      rewardExperience: 10,
    });
  });

  it('uses the approved revised ladders and removes tokens from every achievement reward', () => {
    const targets = (id: string, field: string) =>
      ACHIEVEMENT_STAGE_DEFINITIONS.filter((stage) => stage.achievementId === id).map(
        (stage) => stage.target[field],
      );

    expect(targets('daily-sniper-streak', 'goalStreak')).toEqual([30, 50, 60, 65, 70, 75, 80, 85]);
    expect(targets('ice-hand', 'accuracyPercent')).toEqual([90, 92, 96, 97, 98, 99, 100]);
    expect(targets('keeping-fit', 'minimumAccuracyPercent')).toEqual([50, 60, 65, 75, 85, 95]);
    expect(targets('sniper-week', 'accuracyPercent')).toEqual([70, 75, 80, 85, 90, 95]);
    expect(targets('sniper-month', 'accuracyPercent')).toEqual([70, 75, 80, 85, 90, 95]);
    expect(targets('training-monster', 'accuracyPercent')).toEqual([90, 92, 94, 96, 97, 98, 99, 100]);
    expect(targets('rhythm-control', 'goalStreak')).toEqual([30, 40, 50, 60, 75, 80, 85, 90]);
    expect(targets('blowout', 'minimumMargin')).toEqual([20, 25, 30, 35, 40, 45]);
    expect(targets('express-sniper', 'goals')).toEqual([50, 55, 60, 65, 70, 75, 80]);
    expect(targets('mix-sniper', 'goals')).toEqual([75, 80, 85, 90, 95, 100, 105, 110]);
    expect(targets('monthly-top-1', 'placements')).toEqual([1, 2, 3, 4, 5]);
    expect(targets('monthly-top-3', 'placements')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(targets('series-comeback', 'minimumDeficit')).toEqual([2, 3]);
    expect(targets('no-shake', 'accuracyPercent')).toEqual([90, 92, 94, 95, 97, 99, 100]);

    expect(ACHIEVEMENT_SEEDS.every((achievement) => achievement.rewardTokens === 0)).toBe(true);
    expect(ACHIEVEMENT_STAGE_DEFINITIONS.every((stage) => stage.rewardTokens === 0)).toBe(true);
  });
});
