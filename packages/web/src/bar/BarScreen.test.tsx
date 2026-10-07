import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { BarScreen } from './BarScreen.js';
import type { BarSocketOptions } from './BarSocket.js';
import type { BarMatch } from './types.js';
let options: BarSocketOptions;
const disconnect = vi.fn();
vi.mock('./BarSocket.js', () => ({
  BarSocket: class {
    constructor(o: BarSocketOptions) {
      options = o;
    }
    connect() {}
    disconnect() {
      disconnect();
    }
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const match: BarMatch = {
  id: 'm',
  kind: 'duel',
  format: 'express',
  totalPeriods: 3,
  title: null,
  group: 'online',
  status: 'active',
  startsAt: null,
  expiresAt: null,
  players: [
    {
      userId: 'a',
      name: 'Первый',
      avatarUrl: null,
      grip: 'left',
      goals: 2,
      state: 'period_active',
      period: 1,
      until: null,
    },
    {
      userId: 'b',
      name: 'Второй',
      avatarUrl: null,
      grip: 'right',
      goals: 1,
      state: 'break_active',
      period: 1,
      until: null,
    },
  ],
};
describe('bar board', () => {
  it('filters online matches and targeted invitations, and replaces expired cards', () => {
    render(
      <MemoryRouter>
        <BarScreen />
      </MemoryRouter>,
    );
    act(() => {
      options.onStatus('ready');
      options.onSnapshot({
        totals: { online: 12, upcoming: 47 },
        online: [match],
        upcoming: [{ ...match, id: 'inv', group: 'upcoming', status: 'invited' }],
        hasMore: false,
        page: 0,
      });
    });
    expect(screen.getByText('Онлайн')).toBeInTheDocument();
    expect(screen.getByText('Предстоящие')).toBeInTheDocument();
    expect(screen.getByText('Текущие встречи (12)')).toBeInTheDocument();
    expect(screen.getByText(/Дуэль.*Экспресс/)).toBeInTheDocument();
    expect(screen.getByText('Период 1/3')).toBeInTheDocument();
    expect(screen.getByText('Перерыв')).toBeInTheDocument();
    expect(screen.getByText('2 : 1')).toBeInTheDocument();
    expect(screen.queryByText('Ожидает ответа')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Онлайн' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Предстоящие' }));
    expect(screen.getByText('Текущие встречи (47)')).toBeInTheDocument();
    expect(screen.queryByText('2 : 1')).not.toBeInTheDocument();
    const invite = screen.getByText('Ожидает ответа').closest('button');
    expect(invite).toBeDisabled();
    act(() => options.onSnapshot({ online: [match], upcoming: [], totals: { online: 12, upcoming: 0 }, hasMore: false, page: 0 }));
    expect(screen.queryByText('Ожидает ответа')).not.toBeInTheDocument();
    expect(screen.getByText('Пока нет предстоящих матчей')).toBeInTheDocument();
  });
  it('shows the scheduled tournament start only for upcoming meetings', () => {
    render(<MemoryRouter><BarScreen /></MemoryRouter>);
    const startsAt = '2026-10-08T16:00:00Z';
    const tournament = { ...match, kind: 'tournament' as const, startsAt };
    act(() => options.onSnapshot({ online: [tournament], upcoming: [{ ...tournament, group: 'upcoming' }], hasMore: false, page: 0 }));
    expect(screen.queryByText(/^Начало:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Предстоящие' }));
    expect(screen.getByText(/^Начало:/)).toHaveAttribute('datetime', startsAt);
    expect(screen.queryByText('Ожидает начала')).not.toBeInTheDocument();
  });
  it('disconnects the board subscription when leaving the page', () => {
    const view = render(
      <MemoryRouter>
        <BarScreen />
      </MemoryRouter>,
    );
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
