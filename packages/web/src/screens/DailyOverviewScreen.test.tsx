import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyOverviewScreen } from './DailyOverviewScreen.js';

const { fetchDailyStateMock, fetchDailyHistoryMock } = vi.hoisted(() => ({
  fetchDailyStateMock: vi.fn(),
  fetchDailyHistoryMock: vi.fn(),
}));

vi.mock('../api/duel.js', () => ({
  fetchDailyState: fetchDailyStateMock,
  fetchDailyHistory: fetchDailyHistoryMock,
}));

const dailyState = {
  state: 'idle',
  current_period: 0,
  current_period_shots: 0,
  current_period_goals: 0,
  daily_total_shots: 0,
  daily_total_goals: 0,
  lifetime_total_shots: 0,
  lifetime_total_goals: 0,
  period_started_at: null,
  period_ends_at: null,
  break_ends_at: null,
  day_date: '2026-08-30',
  next_day_starts_at: '2026-08-31T00:00:00.000Z',
  server_now: '2026-08-30T12:00:00.000Z',
  daily_seed: null,
  goalie_id: 'rookie',
  shots_per_period: 30,
  total_periods: 3,
  period_speed_presets: [],
  recent_periods: [],
  previous_game: null,
  training_cooldown_ends_at: null,
};

const historyResponse = {
  games: [
    {
      day_date: '2026-08-29',
      total_shots: 90,
      total_goals: 45,
      total_duration_ms: 1_800_000,
      periods: [1, 2, 3].map((periodNumber) => ({
        period_number: periodNumber,
        shots_taken: 30,
        goals: 15,
        closed_reason: 'quota',
        duration_ms: 600_000,
        ended_at: `2026-08-29T1${periodNumber}:00:00.000Z`,
      })),
    },
    {
      day_date: '2026-08-28',
      total_shots: 30,
      total_goals: 14,
      total_duration_ms: 600_000,
      periods: [
        {
          period_number: 1,
          shots_taken: 30,
          goals: 14,
          closed_reason: 'day_end',
          duration_ms: 600_000,
          ended_at: '2026-08-28T12:00:00.000Z',
        },
      ],
    },
    {
      day_date: '2026-08-27',
      total_shots: 0,
      total_goals: 0,
      total_duration_ms: 0,
      periods: [],
    },
  ],
  hasMore: false,
  nextOffset: null,
  summary: {
    possible_games: 3,
    played_games: 2,
    completed_games: 1,
    total_shots: 120,
    total_goals: 59,
  },
};

function renderScreen(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DailyOverviewScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DailyOverviewScreen', () => {
  beforeEach(() => {
    fetchDailyStateMock.mockReset().mockResolvedValue(dailyState);
    fetchDailyHistoryMock.mockReset().mockResolvedValue(historyResponse);
  });

  it('uses the same catalog-width shell and header as the section pages', async () => {
    renderScreen();

    const heading = await screen.findByRole('heading', { name: 'Ежедневная игра' });
    expect(heading.closest('main')).toHaveClass('mode-shell', 'mode-shell--section-hub');
    expect(heading.parentElement).toHaveClass('bonus-games-catalog__header');
    expect(heading).toHaveClass('bonus-games-catalog__title', 'screen-title-on-arena');
    expect(screen.getByRole('button', { name: 'Назад' })).toHaveClass(
      'icon-btn',
      'catalog-header-back',
    );
  });

  it('renders the day countdown as plain text without a pill container', async () => {
    renderScreen();

    const countdown = await screen.findByLabelText(/^До конца дня:/);
    expect(countdown).toHaveStyle({
      padding: '0',
      border: '0',
      background: 'transparent',
      boxShadow: 'none',
    });
  });

  it('shows daily history as a calendar with completed, incomplete and missed days', async () => {
    renderScreen();

    const historyHeading = await screen.findByRole('heading', { name: 'За всё время' });
    const historySummary = historyHeading.closest('article') as HTMLElement;
    expect(historySummary).toHaveClass('glass', 'daily-history-summary');
    expect(historySummary.style.background).toBe('');
    expect(historySummary.style.boxShadow).toBe('');
    const monthSummary = screen.getByRole('article', { name: 'Статистика за август' });
    expect(within(monthSummary).getByRole('heading', { name: 'За август' })).toBeInTheDocument();
    expect(within(monthSummary).getByText('49% (59 из 120)')).toBeInTheDocument();
    expect(within(monthSummary).getByText('2/3')).toBeInTheDocument();
    expect(within(monthSummary).getByText('67%')).toBeInTheDocument();
    expect(within(monthSummary).getByText('1/2')).toBeInTheDocument();
    expect(within(monthSummary).getByText('50%')).toBeInTheDocument();
    const calendar = screen.getByRole('region', { name: 'Календарь ежедневных игр' });
    expect(within(calendar).getByText('Август 2026')).toBeInTheDocument();
    expect(
      within(calendar).getByRole('button', { name: /29 августа 2026: игра завершена/ }),
    ).toHaveClass('daily-calendar__day--completed');
    expect(
      within(
        within(calendar).getByRole('button', { name: /29 августа 2026: игра завершена/ }),
      ).getByLabelText('Забито шайб: 45'),
    ).toHaveTextContent('45');
    expect(
      within(calendar).getByRole('button', {
        name: /28 августа 2026: игра начата, но не завершена/,
      }),
    ).toHaveClass('daily-calendar__day--incomplete');
    expect(
      within(
        within(calendar).getByRole('button', {
          name: /28 августа 2026: игра начата, но не завершена/,
        }),
      ).getByLabelText('Забито шайб: 14'),
    ).toHaveTextContent('14');
    expect(
      within(calendar).getByRole('button', { name: /27 августа 2026: без бросков/ }),
    ).toHaveClass('daily-calendar__day--missed');
    expect(
      within(
        within(calendar).getByRole('button', { name: /27 августа 2026: без бросков/ }),
      ).getByLabelText('Забито шайб: 0'),
    ).toHaveTextContent('0');
    expect(screen.queryByText('29.08.2026')).not.toBeInTheDocument();
  });

  it('opens the server current month and shows an active zero-shot day immediately', async () => {
    fetchDailyStateMock.mockResolvedValue({
      ...dailyState,
      state: 'period_active',
      current_period: 1,
      day_date: '2026-09-01',
      period_started_at: '2026-09-01T09:00:00.000Z',
      period_ends_at: '2026-09-01T09:20:00.000Z',
      next_day_starts_at: '2026-09-02T00:00:00.000Z',
      server_now: '2026-09-01T09:01:00.000Z',
    });

    renderScreen();

    const calendar = await screen.findByRole('region', { name: 'Календарь ежедневных игр' });
    expect(within(calendar).getByText('Сентябрь 2026')).toBeInTheDocument();
    const activeDay = within(calendar).getByRole('button', {
      name: /1 сентября 2026: игра идёт/,
    });
    expect(activeDay).toHaveClass(
      'daily-calendar__day--incomplete',
      'daily-calendar__day--active-today',
    );
    expect(within(activeDay).getByLabelText('Забито шайб: 0')).toHaveTextContent('0');
  });

  it('uses live totals for today without duplicating a cached history day', async () => {
    fetchDailyStateMock.mockResolvedValue({
      ...dailyState,
      state: 'period_active',
      current_period: 2,
      current_period_shots: 4,
      current_period_goals: 3,
      daily_total_shots: 34,
      daily_total_goals: 17,
      day_date: '2026-08-29',
      period_started_at: '2026-08-29T13:00:00.000Z',
      period_ends_at: '2026-08-29T13:20:00.000Z',
    });

    renderScreen();

    const calendar = await screen.findByRole('region', { name: 'Календарь ежедневных игр' });
    const activeDays = within(calendar).getAllByRole('button', {
      name: /29 августа 2026: игра идёт/,
    });
    expect(activeDays).toHaveLength(1);
    expect(within(activeDays[0]!).getByLabelText('Забито шайб: 17')).toHaveTextContent('17');
    expect(
      within(calendar).getByRole('button', {
        name: /28 августа 2026: игра начата, но не завершена/,
      }),
    ).not.toHaveClass('daily-calendar__day--active-today');
  });

  it('opens a completed day result in a modal and navigates between calendar months', async () => {
    renderScreen();

    const completedDay = await screen.findByRole('button', {
      name: /29 августа 2026: игра завершена/,
    });
    fireEvent.click(completedDay);

    const dialog = screen.getByRole('dialog', { name: 'Результат за 29.08.2026' });
    expect(within(dialog).getByText('45 из 90')).toBeInTheDocument();
    expect(within(dialog).getByText('1 период')).toBeInTheDocument();
    expect(within(dialog).getByText('3 период')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    expect(
      screen.queryByRole('dialog', { name: 'Результат за 29.08.2026' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий месяц' }));
    expect(screen.getByText('Июль 2026')).toBeInTheDocument();
  });

  it('keeps all period slots visible when a daily game ended after one period', async () => {
    renderScreen();

    fireEvent.click(
      await screen.findByRole('button', {
        name: /28 августа 2026: игра начата, но не завершена/,
      }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Результат за 28.08.2026' });
    expect(within(dialog).getByText('1 период')).toBeInTheDocument();
    expect(within(dialog).getByText('2 период')).toBeInTheDocument();
    expect(within(dialog).getByText('3 период')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Не сыгран')).toHaveLength(2);
  });
});
