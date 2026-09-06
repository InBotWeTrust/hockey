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
    status: 'join_open',
    joinOpenAt: '2026-09-01T09:00:00.000Z',
    startAt: '2026-09-08T09:00:00.000Z',
    endAt: '2026-09-15T09:00:00.000Z',
    joinEnabled: true,
    reward: { coins: 10, stars: 20, experience: 20 },
    participant: null,
    declinedAt: null,
    tasks: [],
    canJoin: true,
    canClaimReward: false,
    allTasksCompleted: false,
    serverNow: '2026-09-02T09:00:00.000Z',
    ...overrides,
  };
}

describe('weekly challenge personal catalogue', () => {
  it('puts available not-started challenges into future', () => {
    expect(classifyWeeklyChallengeForCatalog(challenge())).toBe('future');
  });

  it('shows running challenges only when the player participates', () => {
    expect(classifyWeeklyChallengeForCatalog(challenge({ status: 'running' }))).toBeNull();
    expect(
      classifyWeeklyChallengeForCatalog(
        challenge({
          status: 'running',
          participant: { joinedAt: '2026-09-01T10:00:00.000Z', rewardClaimedAt: null },
        }),
      ),
    ).toBe('active');
  });

  it('keeps only successfully completed participant challenges in history', () => {
    const participant = {
      joinedAt: '2026-08-20T10:00:00.000Z',
      rewardClaimedAt: null,
    };
    expect(
      classifyWeeklyChallengeForCatalog(
        challenge({ status: 'finished', participant, allTasksCompleted: false }),
      ),
    ).toBeNull();
    expect(
      classifyWeeklyChallengeForCatalog(
        challenge({ status: 'finished', participant, allTasksCompleted: true }),
      ),
    ).toBe('completed');
  });

  it('hides declined future challenges', () => {
    expect(
      classifyWeeklyChallengeForCatalog(
        challenge({ declinedAt: '2026-09-02T10:00:00.000Z', canJoin: false }),
      ),
    ).toBeNull();
  });
});
