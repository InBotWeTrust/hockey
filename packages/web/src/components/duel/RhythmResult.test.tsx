import {RhythmShotNotice} from './RhythmShotNotice.js';
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
  expect(screen.getByRole('list', {name:'Вы'})).toBeInTheDocument();
  expect(screen.getByRole('list', {name:'Соперник'})).toBeInTheDocument();
  const table = screen.getByRole('table', { name: 'Итоговый результат' });
  expect(within(table).getByText('9')).toBeInTheDocument();
  expect(within(table).getByText('8')).toBeInTheDocument();
});

it('groups repeated series by length and separates each player in the result', () => {
  const groupedMatch = {
    ...match,
    me: {...match.me, rhythm_series:[2,6,4,6,6,4]},
    opponent: {...match.opponent, rhythm_series:[3,5,3]},
  };
  render(<DuelResultCard match={groupedMatch} />);
  const own = screen.getByRole('list', {name:'Вы'});
  const opponent = screen.getByRole('list', {name:'Соперник'});
  expect(within(own).getAllByRole('listitem').map(item=>item.textContent)).toEqual(['6×3','4×2','2×1']);
  expect(within(opponent).getAllByRole('listitem').map(item=>item.textContent)).toEqual(['5×1','3×2']);
  expect(within(own).getByText('×1')).toBeInTheDocument();
});

it('shows the last goal series below the menu and hides it on a missed shot', () => {
  const goals=[{travel:5,goal:true},{travel:6,goal:true}];
  const view=render(<RhythmShotNotice shots={goals.slice(0,1)} version={2}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Серия началась');
  view.rerender(<RhythmShotNotice shots={goals} version={2}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Серия 2');
  view.rerender(<RhythmShotNotice shots={[...goals,{travel:6.5,goal:false}]} version={2}/>);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  view.rerender(<RhythmShotNotice shots={[...goals,{travel:9,goal:true}]} version={2}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Серия началась');
});
