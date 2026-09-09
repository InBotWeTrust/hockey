import { describe, expect, it } from 'vitest';
import {
  classifyWeeklyChallengeForCatalog,
  type WeeklyChallengeDTO,
} from '../../src/weeklyChallenge/types.js';

function challenge(overrides: Partial<WeeklyChallengeDTO> = {}): WeeklyChallengeDTO {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Тестовый челлендж',
    description: '',
    status: 'future',
    startAt: '2026-09-08T09:00:00.000Z',
    endAt: '2026-09-15T09:00:00.000Z',
    reward: { coins: 10, stars: 20, experience: 20 },
    rewardClaimedAt: null,
    tasks: [],
    hasProgress: false,
    canClaimReward: false,
    allTasksCompleted: false,
    serverNow: '2026-09-02T09:00:00.000Z',
    ...overrides,
  };
}

describe('weekly challenge personal catalogue', () => {
  it('puts future challenges into future', () => {
    expect(classifyWeeklyChallengeForCatalog(challenge())).toBe('future');
  });

  it('shows every running challenge as active', () => {
    expect(classifyWeeklyChallengeForCatalog(challenge({ status: 'running' }))).toBe('active');
  });

  it('keeps only successfully completed challenges in history', () => {
    expect(
      classifyWeeklyChallengeForCatalog(
        challenge({ status: 'finished', allTasksCompleted: false }),
      ),
    ).toBeNull();
    expect(
      classifyWeeklyChallengeForCatalog(
        challenge({ status: 'finished', allTasksCompleted: true }),
      ),
    ).toBe('completed');
  });

});
