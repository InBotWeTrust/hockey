import { describe, expect, it } from 'vitest';
import type { BonusGameAttempt } from '../api/bonusGames.js';
import { deriveBonusGameClockBasis } from './bonusGameTiming.js';

function activeAttempt(overrides: Partial<BonusGameAttempt> = {}): BonusGameAttempt {
  return {
    id: 'attempt-1',
    game_id: 'game-1',
    game_slug: 'beach',
    game_title: 'Пляж',
    status: 'active',
    state: 'period_active',
    current_period: 1,
    period_started_at: '2026-08-24T10:00:00.000Z',
    period_ends_at: '2026-08-24T10:04:00.000Z',
    break_started_at: null,
    break_ends_at: null,
    closed_at: null,
    shots_taken: 0,
    current_period_shots_taken: 0,
    goals: 0,
    reward_granted: false,
    attempt_seed: 'seed',
    game_core_version: 1,
    definition_revision: 1,
    server_now: '2026-08-24T10:00:00.000Z',
    rules: {
      game_id: 'game-1',
      slug: 'beach',
      title: 'Пляж',
      revision: 1,
      target_goals: 18,
      total_periods: 2,
      break_duration_ms: 30_000,
      periods: [
        {
          period_number: 1,
          duration_ms: 240_000,
          shots_limit: 25,
          goal_frequency: 0.45,
          goalie_frequency: 0.5,
          shooter_frequency: 0.65,
          puck_speed_per_ms: 1.2,
          goalie_pattern: 'linear',
          goalie_amplitude: 1,
          goal_amplitude: 220,
        },
        {
          period_number: 2,
          duration_ms: 240_000,
          shots_limit: 25,
          goal_frequency: 0.5,
          goalie_frequency: 0.55,
          shooter_frequency: 0.7,
          puck_speed_per_ms: 1.3,
          goalie_pattern: 'sine',
          goalie_amplitude: 1,
          goal_amplitude: 220,
        },
      ],
    },
    reward: { coins: 100, stars: 1, experience: 50 },
    arena: {
      id: 'arena-1',
      slug: 'beach',
      title: 'Пляж',
      artwork_url: '/bonus-games/arenas/beach.webp',
      thumbnail_url: '/bonus-games/arenas/beach.webp',
    },
    goalkeeper_ready_url: '/bonus-games/goalkeepers/beach-ready.webp',
    goalkeeper_save_url: '/bonus-games/goalkeepers/beach-save.webp',
    ...overrides,
  };
}

describe('deriveBonusGameClockBasis', () => {
  it('starts fresh period scene and shooter clocks at zero', () => {
    expect(deriveBonusGameClockBasis(activeAttempt())).toEqual({
      sceneElapsedMs: 0,
      shooterElapsedMs: 0,
    });
  });

  it('restores separate clocks after multiple accepted current-period shots', () => {
    const clocks = deriveBonusGameClockBasis(
      activeAttempt({
        server_now: '2026-08-24T10:00:09.000Z',
        shots_taken: 3,
        current_period_shots_taken: 3,
      }),
    );

    expect(clocks.sceneElapsedMs).toBe(6_000);
    expect(clocks.shooterElapsedMs).toBeCloseTo(4_700, 8);
  });

  it('ignores shots archived in prior partial periods', () => {
    const clocks = deriveBonusGameClockBasis(
      activeAttempt({
        current_period: 2,
        period_started_at: '2026-08-24T10:10:00.000Z',
        server_now: '2026-08-24T10:10:09.000Z',
        shots_taken: 28,
        current_period_shots_taken: 3,
      }),
    );

    expect(clocks.sceneElapsedMs).toBe(6_000);
    expect(clocks.shooterElapsedMs).toBeCloseTo(4_800, 8);
  });

  it('rebases a reconciled snapshot from its new server time and accepted count', () => {
    const clocks = deriveBonusGameClockBasis(
      activeAttempt({
        server_now: '2026-08-24T10:00:10.000Z',
        shots_taken: 3,
        current_period_shots_taken: 3,
      }),
    );

    expect(clocks.sceneElapsedMs).toBe(7_000);
    expect(clocks.shooterElapsedMs).toBeCloseTo(5_700, 8);
  });

  it('starts a new period from its own start and zero current-period shots', () => {
    const clocks = deriveBonusGameClockBasis(
      activeAttempt({
        current_period: 2,
        period_started_at: '2026-08-24T10:20:00.000Z',
        server_now: '2026-08-24T10:20:02.000Z',
        shots_taken: 25,
        current_period_shots_taken: 0,
      }),
    );

    expect(clocks).toEqual({ sceneElapsedMs: 2_000, shooterElapsedMs: 2_000 });
  });
});
