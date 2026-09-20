import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './apiFetch.js';
import { fetchBonusAttempt, type BonusAttemptResponse } from './bonusGames.js';

vi.mock('./apiFetch.js', () => ({ apiFetch: vi.fn() }));

describe('bonus game response normalization', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('preserves modern endurance qualification rules and authoritative window timestamps', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      attempt: {
        game_title: 'Выносливость 1',
        total_points: 0,
        current_goal_streak: 0,
        best_goal_streak: 0,
        preview_required: false,
        current_loadout: null,
        goal_window_started_at: '2026-09-20T10:00:00.000Z',
        goal_window_ends_at: '2026-09-20T10:00:07.000Z',
        rules: {
          skill_code: 'endurance',
          qualification_rules: {
            type: 'survive_goal_windows',
            activeTimeMs: 180_000,
            goalWindowMs: 7_000,
          },
          use_inventory: false,
          preview_title: 'Выносливость 1',
          preview_story: '',
          preview_artwork_url: '/bonus-games/amateur.webp',
          preview_revision: 1,
        },
        arena: { artwork_url: '/bonus-games/amateur.webp' },
      },
    } as unknown as BonusAttemptResponse);

    const normalized = await fetchBonusAttempt('attempt-1');

    expect(normalized.attempt.rules.qualification_rules).toEqual({
      type: 'survive_goal_windows',
      activeTimeMs: 180_000,
      goalWindowMs: 7_000,
    });
    expect(normalized.attempt).toMatchObject({
      goal_window_started_at: '2026-09-20T10:00:00.000Z',
      goal_window_ends_at: '2026-09-20T10:00:07.000Z',
    });
  });
});
