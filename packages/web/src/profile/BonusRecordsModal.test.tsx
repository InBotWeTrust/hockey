import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BonusRecordsModal, formatBonusRecord, formatBonusPreviewRecord } from './BonusRecordsModal.js';
import { fetchBonusRecords } from '../api/bonusGames.js';
vi.mock('../api/bonusGames.js', () => ({ fetchBonusRecords: vi.fn() }));
const fetch = vi.mocked(fetchBonusRecords);
function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BonusRecordsModal
        gameId="game"
        skillCode="speed"
        title="Пляж"
        currentUserId="me"
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('bonus records modal', () => {
  it.each([
    [1, '1 бросок'],
    [2, '2 броска'],
    [11, '11 бросков'],
    [21, '21 бросок'],
    [22, '22 броска'],
    [25, '25 бросков'],
  ] as const)('declines %s shots correctly', (shots, text) => {
    expect(formatBonusRecord('marksmanship', { elapsedMs: 12000, shots, goals: 1 })).toContain(
      text,
    );
  });
  it('formats durations with two decimal seconds and keeps minutes', () => {
    expect(formatBonusRecord('speed', { elapsedMs: 130000, shots: 20, goals: 12 })).toBe(
      '2 мин 10,00 сек',
    );
    expect(formatBonusRecord('speed', { elapsedMs: 60000, shots: 20, goals: 12 })).toBe(
      '1 мин 0,00 сек',
    );
    expect(formatBonusRecord('accuracy', { elapsedMs: 61500, shots: 20, goals: 12 })).toBe(
      '12 из 20 (60%) · 1 мин 1,50 сек',
    );
  });
  it('preserves hundredths and carries rounded seconds into minutes', () => {
    expect(formatBonusRecord('speed', { elapsedMs: 2174, shots: 1, goals: 1 })).toBe('2,17 сек');
    expect(formatBonusRecord('speed', { elapsedMs: 59999, shots: 1, goals: 1 })).toBe('1 мин 0,00 сек');
  });
  it('formats time per goal with a decimal and no zero division', () => {
    expect(formatBonusRecord('endurance', { elapsedMs: 180000, shots: 18, goals: 12 })).toBe(
      '15,00 сек/гол · 12 шайб',
    );
    expect(formatBonusRecord('endurance', { elapsedMs: 65000, shots: 7, goals: 4 })).toBe(
      '16,25 сек/гол · 4 шайбы',
    );
    expect(formatBonusRecord('endurance', { elapsedMs: 65000, shots: 7, goals: 0 })).toBe('—');
  });
  it('shows equal star and experience awards for personal and location records', () => {
    fetch.mockResolvedValue({ rows: [], currentUser: null, skillCode: 'speed', nextOffset: null });
    show();
    expect(screen.getByLabelText('10 звёзд')).toBeInTheDocument();
    expect(screen.getByLabelText('30 звёзд')).toBeInTheDocument();
    expect(screen.getByLabelText('10 опыта')).toBeInTheDocument();
    expect(screen.getByLabelText('30 опыта')).toBeInTheDocument();
    expect(screen.queryByLabelText('2 звезды')).not.toBeInTheDocument();
  });
  it('renders loading, empty and retry after failure', async () => {
    fetch.mockRejectedValueOnce(new Error('network'));
    show();
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем');
    await screen.findByRole('alert');
    fetch.mockResolvedValueOnce({
      rows: [],
      currentUser: null,
      skillCode: 'speed',
      nextOffset: null,
    });
    fireEvent.click(screen.getByText('Повторить'));
    await screen.findByText('Рейтинг пока пуст');
  });
  it('shows shared ranks and pins the current user outside top 100', async () => {
    fetch.mockResolvedValue({
      rows: [1, 2].map((n) => ({
        place: 1,
        userId: `u${n}`,
        displayName: `Игрок ${n}`,
        avatarUrl: null,
        elapsedMs: 12000,
        shots: 5,
        goals: 3,
        points: 0,
      })),
      currentUser: {
        place: 121,
        userId: 'me',
        displayName: 'Я',
        avatarUrl: null,
        elapsedMs: 15000,
        shots: 7,
        goals: 3,
        points: 0,
      },
      skillCode: 'speed',
      nextOffset: null,
    });
    show();
    await screen.findByText('Игрок 1');
    expect(screen.getByRole('heading', { name: 'Рекорды' })).toBeInTheDocument();
    expect(screen.getByText('Скорость · Пляж')).toBeInTheDocument();
    expect(screen.getByTestId('stat-rating-pinned-current')).toHaveTextContent('121');
    expect(screen.getByText('Я')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('game', 0));
  });
});

it('shows only centisecond time for Rhythm preview records while retaining ranking details',()=>{
 const record={elapsedMs:73120,shots:32,goals:20,bestSeries:6};
 expect(formatBonusPreviewRecord('rhythm',record)).toBe('1 мин 13,12 сек');
 expect(formatBonusRecord('rhythm',record)).toContain('серия 6');
 expect(formatBonusPreviewRecord('speed',record)).toBe(formatBonusRecord('speed',record));
});
