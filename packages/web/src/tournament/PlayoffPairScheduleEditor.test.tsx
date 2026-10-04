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
function show(onSaved?: () => Promise<void> | void) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlayoffPairScheduleEditor tournamentId="tournament-1" onSaved={onSaved} />
    </QueryClientProvider>,
  );
}

describe('pair day editor', () => {
  it('shows seed places and feeder series before participant names are known', async () => {
    vi.spyOn(api, 'fetchPlayoffPairSchedule').mockResolvedValue({
      days: ['R1S1', 'R1S2', 'R1S3', 'R1S4', 'R2S1', 'BRONZE'].map((seriesKey) => ({
        ...day,
        seriesId: seriesKey,
        seriesKey,
        homeName: null,
        awayName: null,
      })),
    });
    show();
    expect(await screen.findByLabelText('Серия 1 (1–8), день 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Серия 2 (4–5), день 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Серия 1 (победители серий 1 и 2), день 1')).toBeInTheDocument();
    expect(
      screen.getByLabelText('За третье место (проигравшие полуфиналов), день 1'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/R1S1|BRONZE/)).not.toBeInTheDocument();
  });

  it('saves only the selected pair time in tournament local time', async () => {
    vi.spyOn(api, 'fetchPlayoffPairSchedule').mockResolvedValue({ days: [day] });
    const update = vi.spyOn(api, 'updatePlayoffPairDay').mockResolvedValue({ changed: true });
    const onSaved = vi.fn();
    show(onSaved);
    const input = await screen.findByLabelText(/Первый.*Второй.*день 1/);
    fireEvent.change(input, { target: { value: '21:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить время пары' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('tournament-1', day, '21:00'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
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
