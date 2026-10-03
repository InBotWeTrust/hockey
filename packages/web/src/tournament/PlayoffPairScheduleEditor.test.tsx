import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from './adminApi.js';
import { PlayoffPairScheduleEditor } from './PlayoffPairScheduleEditor.js';

afterEach(() => {
  vi.restoreAllMocks();
});
const day: api.PlayoffPairDay = {
  seriesId: 'series-1',
  seriesKey: 'R1S1',
  dayId: 'day-1',
  dayNumber: 1,
  localDate: '2030-10-26',
  timezone: 'Europe/Moscow',
  homeName: 'Первый',
  awayName: 'Второй',
  editable: true,
  defaultStartsAt: '2030-10-26T17:00:00.000Z',
  overrideStartsAt: null,
  effectiveStartsAt: '2030-10-26T17:00:00.000Z',
};
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlayoffPairScheduleEditor tournamentId="tournament-1" />
    </QueryClientProvider>,
  );
}

describe('pair day editor', () => {
  it('saves only the selected pair time in tournament local time', async () => {
    vi.spyOn(api, 'fetchPlayoffPairSchedule').mockResolvedValue({ days: [day] });
    const update = vi.spyOn(api, 'updatePlayoffPairDay').mockResolvedValue({ changed: true });
    show();
    const input = await screen.findByLabelText(/Первый.*Второй.*день 1/);
    fireEvent.change(input, { target: { value: '21:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить время пары' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('tournament-1', day, '21:00'));
  });

  it('keeps the current block locked and the next day editable', async () => {
    vi.spyOn(api, 'fetchPlayoffPairSchedule').mockResolvedValue({
      days: [
        { ...day, editable: false },
        { ...day, dayId: 'day-2', dayNumber: 2 },
      ],
    });
    show();
    expect(await screen.findByLabelText(/Первый.*Второй.*день 1/)).toBeDisabled();
    expect(screen.getByLabelText(/Первый.*Второй.*день 2/)).not.toBeDisabled();
  });

  it('restores inheritance with an explicit null', async () => {
    vi.spyOn(api, 'fetchPlayoffPairSchedule').mockResolvedValue({ days: [day] });
    const update = vi.spyOn(api, 'updatePlayoffPairDay').mockResolvedValue({ changed: true });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Использовать время раунда' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('tournament-1', day, null));
  });
});
