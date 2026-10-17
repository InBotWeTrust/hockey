import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DuelResultCard } from '../../screens/DailyScreen.js';
import type { AmateurDuelMatch } from '../../api/amateurDuel.js';
const participant = (id: string, goals: number, score: number) => ({
  user_id: id,
  display_name: id,
  avatar_url: null,
  state: 'completed',
  current_period: 1,
  goals,
  format_score: score,
  rhythm_series: [score],
  shots_taken: 10,
  active_duration_ms: 150000,
  result_points: 3,
  loadout: { items: [] },
  inventory_report: [],
});
const match = {
  id: 'result-rhythm',
  status: 'settled',
  source: 'challenge',
  starts_at: '2026-10-17T10:00:00Z',
  winner_user_id: 'me',
  outcome: 'challenger_win',
  venue_role: 'neutral',
  rules: {
    duelKind: 'rhythm',
    totalPeriods: 1,
    title: 'Ритм',
    periodDurationMs: 150000,
    periodRules: [{ mode: 'time_attack', periodNumber: 1, durationMs: 150000, shotsLimit: null }],
  },
  me: participant('me', 9, 2),
  opponent: participant('other', 8, 1),
  recent_periods: [],
  opponent_recent_periods: [],
} as unknown as AmateurDuelMatch;
it('shows credited Rhythm score and series in compact history while retaining real-goal statistics', () => {
  render(<DuelResultCard match={match} compact />);
  expect(screen.getByText('Счёт')).toBeInTheDocument();
  expect(screen.getByText('2:1')).toBeInTheDocument();
  expect(screen.getByText('Серии')).toBeInTheDocument();
  const table = screen.getByRole('table', { name: 'Итоговый результат' });
  expect(within(table).getByText('9')).toBeInTheDocument();
  expect(within(table).getByText('8')).toBeInTheDocument();
});
