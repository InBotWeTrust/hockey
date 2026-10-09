import { render, screen, within, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FightResultModal } from './FightResultModal.js';

afterEach(() => {
  vi.useRealTimers();
});
describe('fight result rewards', () => {
  it.each([true, false])(
    'shows the confirmed reward for winner=%s without manual dismissal',
    (won) => {
      vi.useFakeTimers();
      render(<FightResultModal won={won} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(700));
      const result = screen.getByRole('dialog', { name: won ? 'Вы победили' : 'Вы проиграли' });
      expect(within(result).getByRole('group', { name: '+1 опыт' })).toHaveClass(
        'profile-balance__amount--experience',
      );
      expect(Boolean(within(result).queryByRole('group', { name: '+1 звезда' }))).toBe(won);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );
});

it('shows a fight without a winner without claiming loss or rewards', () => {
  vi.useFakeTimers();
  render(<FightResultModal won={false} draw />);
  act(() => vi.advanceTimersByTime(700));
  const dialog = screen.getByRole('dialog', { name: 'Ничья' });
  expect(within(dialog).getByText('Драка завершена без победителя')).toBeInTheDocument();
  expect(within(dialog).queryByRole('group')).not.toBeInTheDocument();
});

it('explains a technical cancellation without inventing a draw or rewards', () => {
 vi.useFakeTimers();
 render(<FightResultModal won={false} draw interrupted />);
 act(() => vi.advanceTimersByTime(700));
 const dialog=screen.getByRole('dialog',{name:'Драка прервана'});
 expect(within(dialog).getByText('Вызов возвращён')).toBeInTheDocument();
 expect(within(dialog).queryByRole('group')).not.toBeInTheDocument();
});
