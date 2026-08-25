import { describe, expect, it } from 'vitest';
import { toBonusAttemptDto } from '../../src/bonusGames/service.js';
import type { BonusGameAttemptRow } from '../../src/bonusGames/types.js';

const attempt: BonusGameAttemptRow = {
  id: 'attempt-1',
  user_id: 'user-1',
  bonus_game_id: 'game-1',
  status: 'completed',
  state: 'closed',
  current_period: 2,
  period_started_at: null,
  break_started_at: null,
  closed_at: new Date('2026-08-24T10:05:00.000Z'),
  shots_taken: 28,
  goals: 20,
  attempt_seed: 'seed',
  game_core_version: 1,
  definition_revision: 3,
  rules_snapshot: {
    gameId: 'game-1',
    slug: 'beach',
    title: 'Пляж',
    revision: 3,
    targetGoals: 20,
    totalPeriods: 2,
    breakDurationMs: 30_000,
    periods: [
      {
        periodNumber: 1,
        durationMs: 240_000,
        shotsLimit: 25,
        goalFrequency: 0.45,
        goalieFrequency: 0.5,
        shooterFrequency: 0.65,
        puckSpeedPerMs: 1.2,
        goaliePattern: 'linear',
        goalieAmplitude: 1,
        goalAmplitude: 220,
      },
      {
        periodNumber: 2,
        durationMs: 240_000,
        shotsLimit: 25,
        goalFrequency: 0.5,
        goalieFrequency: 0.55,
        shooterFrequency: 0.7,
        puckSpeedPerMs: 1.25,
        goaliePattern: 'sine',
        goalieAmplitude: 1,
        goalAmplitude: 220,
      },
    ],
    goalkeeperReadyUrl: '/goalies/beach-ready.webp',
    goalkeeperSaveUrl: '/goalies/beach-save.webp',
    arena: {
      id: 'arena-1',
      slug: 'beach',
      title: 'Пляж',
      artworkUrl: '/arenas/beach.webp',
      thumbnailUrl: '/arenas/beach-thumb.webp',
    },
  },
  reward_snapshot: { coins: 100, stars: 1, experience: 50 },
  arena_theme_id_snapshot: 'arena-1',
  arena_snapshot: {
    id: 'arena-1',
    slug: 'beach',
    title: 'Пляж',
    artworkUrl: '/arenas/beach.webp',
    thumbnailUrl: '/arenas/beach-thumb.webp',
  },
  goalkeeper_ready_url: '/goalies/beach-ready.webp',
  goalkeeper_save_url: '/goalies/beach-save.webp',
  created_at: new Date('2026-08-24T10:00:00.000Z'),
  updated_at: new Date('2026-08-24T10:05:00.000Z'),
};

describe('bonus attempt service DTO', () => {
  it('keeps current-period shots separate from attempt totals', () => {
    const dto = toBonusAttemptDto(attempt, {
      currentPeriodShotsTaken: 3,
      rewardGranted: true,
    });

    expect(dto).toMatchObject({
      shotsTaken: 28,
      currentPeriodShotsTaken: 3,
      rewardGranted: true,
    });
  });

  it('uses the completion belonging to this attempt for replay reward state', () => {
    const dto = toBonusAttemptDto(attempt, {
      currentPeriodShotsTaken: 3,
      rewardGranted: false,
    });

    expect(dto.rewardGranted).toBe(false);
  });
});
