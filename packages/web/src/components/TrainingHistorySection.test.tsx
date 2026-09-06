import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrainingHistorySection } from './TrainingHistorySection.js';
import * as trainingApi from '../api/training.js';

vi.mock('../api/training.js', () => ({ fetchTrainingHistory: vi.fn() }));

describe('TrainingHistorySection', () => {
  it('shows lifetime and month stats with completed and active training days', async () => {
    vi.mocked(trainingApi.fetchTrainingHistory).mockResolvedValue({
      sessions: [
        {
          day_date: '2026-09-06',
          selected_period: 1,
          shots_limit: 100,
          total_shots: 40,
          total_goals: 20,
          completed: false,
        },
        {
          day_date: '2026-09-05',
          selected_period: 2,
          shots_limit: 80,
          total_shots: 80,
          total_goals: 48,
          completed: true,
        },
      ],
      hasMore: false,
      nextOffset: null,
      summary: {
        played_trainings: 2,
        completed_trainings: 1,
        total_shots: 120,
        total_goals: 68,
      },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TrainingHistorySection currentDayDate="2026-09-06" />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'За всё время' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'За сентябрь' })).toBeInTheDocument();
    expect(screen.getAllByText('57% (68 из 120)')).toHaveLength(2);
    const calendar = screen.getByRole('region', { name: 'Календарь тренировок' });
    const activeDay = within(calendar).getByRole('button', {
      name: /6 сентября 2026: тренировка начата, но не завершена/,
    });
    expect(activeDay).toHaveClass(
      'daily-calendar__day--incomplete',
      'daily-calendar__day--active-today',
    );
    expect(
      within(calendar).getByRole('button', { name: /5 сентября 2026: тренировка завершена/ }),
    ).toHaveClass('daily-calendar__day--completed');

    fireEvent.click(activeDay);
    const modal = screen.getByRole('dialog', { name: 'Результат тренировки за 06.09.2026' });
    expect(within(modal).getByText('20 из 40')).toBeInTheDocument();
    expect(within(modal).getByText('40 из 100')).toBeInTheDocument();
    expect(within(modal).getByText('50%')).toBeInTheDocument();
  });
});
