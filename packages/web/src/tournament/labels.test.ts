import { describe, expect, it } from 'vitest';
import { tournamentStandingValueLabel } from './labels.js';

describe('tournament standing value labels', () => {
  it('shows classic goal totals as human-readable goals', () => {
    expect(tournamentStandingValueLabel('24.0000', 'classic', 'goals_sum')).toBe('24 гола');
    expect(tournamentStandingValueLabel('0.0000', 'classic', 'goals_sum')).toBe('0 голов');
  });

  it('shows classic accuracy as a percentage', () => {
    expect(tournamentStandingValueLabel('0.4567', 'classic', 'accuracy_average')).toBe('45,7%');
  });

  it('keeps points for head-to-head and place-point standings', () => {
    expect(tournamentStandingValueLabel('6.5000', 'head_to_head', null)).toBe('6,5 очка');
    expect(tournamentStandingValueLabel('10.0000', 'classic', 'daily_place_points')).toBe(
      '10 очков',
    );
  });
});
