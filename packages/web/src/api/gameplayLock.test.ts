import { describe, expect, it } from 'vitest';
import { dailyGameplayLockCopy, gameplayLockCopy } from './gameplayLock';

describe('gameplayLockCopy', () => {
  it('names training as the recovery source for the daily game', () => {
    expect(
      dailyGameplayLockCopy({
        blocked: true,
        reason: 'recent_gameplay',
        ends_at: '2030-09-01T08:00:00.000Z',
        tournament_starts_at: null,
      }),
    ).toBe('Восстановление после тренировки');
  });

  it('tells the player to finish an active daily game without showing recovery', () => {
    expect(
      gameplayLockCopy({
        blocked: true,
        reason: 'active_daily',
        ends_at: null,
        tournament_starts_at: null,
      }),
    ).toBe('Завершите ежедневную игру');
  });

  it('uses the tournament wording for an active Classic game', () => {
    expect(
      gameplayLockCopy({
        blocked: true,
        reason: 'active_classic',
        ends_at: null,
        tournament_starts_at: null,
      }),
    ).toBe('Завершите текущую игру в турнире');
  });
});
