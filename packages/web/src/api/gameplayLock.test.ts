import { describe, expect, it } from 'vitest';
import { dailyGameplayLockCopy, gameplayLockCopy, tournamentGameDateCopy } from './gameplayLock';

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

  it('uses clear copy for a scheduled tournament lock', () => {
    expect(
      gameplayLockCopy(
        {
          blocked: true,
          reason: 'scheduled_tournament',
          ends_at: null,
          tournament_starts_at: '2030-09-09T15:00:00.000Z',
        },
        Date.parse('2030-09-09T14:00:00.000Z'),
      ),
    ).toBe('Недоступно до окончания игры в турнире');
  });

  it('formats the scheduled tournament date for the daily-game card', () => {
    expect(
      tournamentGameDateCopy({
        blocked: true,
        reason: 'scheduled_tournament',
        ends_at: null,
        tournament_starts_at: '2030-09-09T15:00:00.000Z',
      }),
    ).toMatch(/^9 сентября \d{2}:00$/);
  });
});
