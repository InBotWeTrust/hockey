import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_SEEDS } from '../../src/achievements/catalog.js';

type ExpectedReward = readonly [coins: number, stars: number, experience: number, tokens: number];

const EXPECTED_REWARDS: Record<string, ExpectedReward> = {
  'ideal-day': [0, 25, 25, 0],
  'first-goal': [0, 1, 1, 0],
  'first-daily-game': [0, 2, 2, 0],
  'first-training': [0, 2, 2, 0],
  'amateur-ticket': [25_000, 250, 250, 5],
  'pro-ticket': [0, 0, 0, 0],
  'daily-sniper-streak': [0, 5, 5, 0],
  'ice-hand': [0, 5, 5, 0],
  'steady-tempo': [0, 5, 5, 0],
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
  'economical-master': [0, 25, 25, 1],
  'regular-season-champion': [250, 50, 50, 3],
  'regular-season-medalist': [220, 45, 45, 2],
  'playoff-semifinal': [100, 50, 50, 1],
  'playoff-final': [150, 75, 75, 2],
  'tournament-cup': [1_000, 100, 100, 5],
  'dark-horse': [0, 25, 25, 0],
  'death-bracket': [0, 25, 25, 0],
  'series-comeback': [0, 35, 35, 0],
  'no-shake': [0, 20, 20, 0],
  'tournament-streak': [2_500, 250, 250, 5],
  'monthly-top-1': [1_000, 100, 100, 3],
};

describe('achievement economy catalog', () => {
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

  it('hides removed achievements and leaves the deferred monthly top-three reward untouched', () => {
    const byId = new Map(ACHIEVEMENT_SEEDS.map((achievement) => [achievement.id, achievement]));

    for (const id of ['almost-perfect-training', 'handled-pressure', 'master-arsenal']) {
      expect(byId.get(id)?.availability, id).toBe('hidden');
    }
    expect(byId.get('monthly-top-3')).toMatchObject({
      availability: 'future',
      rewardCurrency: 0,
      rewardStars: 0,
      rewardExperience: 0,
    });
  });
});
