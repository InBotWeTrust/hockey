import { describe, expect, it } from 'vitest';
import { gameplayLockCopy } from './gameplayLock';

describe('gameplayLockCopy', () => {
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
