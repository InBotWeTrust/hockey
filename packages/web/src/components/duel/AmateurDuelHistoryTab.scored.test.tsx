import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { AmateurDuelHistoryTab } from './AmateurDuelHistoryTab.js';
vi.mock('../../api/amateurDuel.js', () => ({
  fetchAmateurHistoryCalendar: async () => ({
    range: { from: '2026-10', to: '2026-10' },
    month_key: '2026-10',
    timezone: 'Europe/Moscow',
    available_months: ['2026-10'],
    stats: { played: 2, wins: 1, draws: 1, losses: 0, win_percentage: 50 },
    days: [
      {
        day: 11,
        matches: [
          {
            id: 'sniper',
            settled_at: '2026-10-11T12:00:00Z',
            opponent: { user_id: 'b', display_name: 'Соперник', avatar_url: null },
            duel_kind: 'sniper',
            my_goals: 2,
            opponent_goals: 1,
            my_score: 2.3,
            opponent_score: 1.2,
            venue_role: 'neutral',
            result: 'win',
          },
          {
            id: 'marathon',
            settled_at: '2026-10-11T12:01:00Z',
            opponent: { user_id: 'b', display_name: 'Соперник', avatar_url: null },
            duel_kind: 'marathon',
            marathon_window_ms: 4000,
            my_goals: 3,
            opponent_goals: 2,
            my_score: 0,
            opponent_score: 0,
            venue_role: 'neutral',
            result: 'draw',
          },
        ],
      },
    ],
  }),
}));
it('shows format scores and the Marathon window in calendar history', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AmateurDuelHistoryTab
        initialMonthKey="2026-10"
        onOpenMatch={vi.fn()}
        onCloseMatch={vi.fn()}
        expandedMatchId={null}
        expandedContent={null}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '11, сыграно дуэлей: 2' }));
  expect(
    screen.getByRole('button', {
      name: 'Дуэль с Соперник, Снайпер, счёт 2.3:1.2, Нейтральное поле, Победа',
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', {
      name: 'Дуэль с Соперник, Марафон · 4 сек, счёт 0:0, Нейтральное поле, Ничья',
    }),
  ).toBeInTheDocument();
});
