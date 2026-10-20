import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { barCheckers, type CheckersMotion } from '@hockey/game-core';
import { CheckersField } from './GameFields.js';
function fixture() {
  const game = barCheckers.create(0);
  game.board.fill(0);
  game.board[42] = 1;
  game.board[33] = -1;
  game.board[17] = -1;
  game.board[7] = -1;
  const motion: CheckersMotion = {
    board: [...game.board],
    path: [42, 24, 10],
    actor: 0,
    durationMs: 900,
  };
  return { game, motion, end: barCheckers.move(game, motion.path) };
}
it('shows opponent jumps in sequence and removes victims only on landing', () => {
  const { end, motion } = fixture();
  const props = { game: end, disabled: true, send: vi.fn(), motion, animationStart: 100 };
  const { rerender } = render(<CheckersField {...props} now={100} />);
  expect(screen.getAllByLabelText('Чёрная шашка')).toHaveLength(3);
  expect(screen.getByLabelText('Белая шашка движется')).toBeInTheDocument();
  rerender(<CheckersField {...props} now={550} />);
  expect(screen.getAllByLabelText('Чёрная шашка')).toHaveLength(2);
  rerender(<CheckersField {...props} now={1000} />);
  expect(screen.getAllByLabelText('Чёрная шашка')).toHaveLength(1);
  expect(screen.queryByLabelText('Белая шашка движется')).not.toBeInTheDocument();
});
it('animates partial input and does not replay completed jumps when the server acknowledges', () => {
  const { game, motion, end } = fixture(),
    send = vi.fn();
  const { rerender } = render(<CheckersField game={game} disabled={false} send={send} now={0} />);
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 43' }));
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 25' }));
  expect(
    within(screen.getByRole('button', { name: 'Клетка 34' })).getByLabelText('Чёрная шашка'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 11' }));
  expect(send).not.toHaveBeenCalled();
  rerender(<CheckersField game={game} disabled={false} send={send} now={450} />);
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 11' }));
  expect(send).toHaveBeenCalledWith({ type: 'checkers', path: [42, 24, 10] });
  rerender(
    <CheckersField
      game={end}
      disabled={true}
      send={send}
      motion={motion}
      animationStart={500}
      now={500}
    />,
  );
  expect(
    screen.getByLabelText('Белая шашка движется').style.getPropertyValue('--checker-from-x'),
  ).toBe('1.75%');
  rerender(
    <CheckersField
      game={end}
      disabled={true}
      send={send}
      motion={motion}
      animationStart={500}
      now={1000}
    />,
  );
  expect(screen.queryByLabelText('Белая шашка движется')).toBeNull();
  expect(screen.getAllByLabelText('Чёрная шашка')).toHaveLength(1);
});

it('returns to the authoritative board if a submitted move is rejected', () => {
  const { game } = fixture();
  game.board[17] = 0;
  const send = vi.fn();
  const { rerender } = render(<CheckersField game={game} disabled={false} send={send} now={0} />);
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 43' }));
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 25' }));
  expect(send).toHaveBeenCalledOnce();
  rerender(<CheckersField game={game} disabled={false} send={send} now={500} />);
  expect(
    within(screen.getByRole('button', { name: 'Клетка 43' })).getByLabelText('Белая шашка'),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('button', { name: 'Клетка 34' })).getByLabelText('Чёрная шашка'),
  ).toBeInTheDocument();
});
it('does not restart a running segment on clock updates or an identical poll', () => {
  const { end, motion } = fixture();
  const props = { game: end, disabled: true, send: vi.fn(), motion, animationStart: 100 };
  const { rerender } = render(<CheckersField {...props} now={200} />);
  expect(screen.getByLabelText('Белая шашка движется').style.animationDelay).toBe('-100ms');
  rerender(<CheckersField {...props} motion={{ ...motion }} now={300} />);
  expect(screen.getByLabelText('Белая шашка движется').style.animationDelay).toBe('-100ms');
  rerender(<CheckersField {...props} now={800} />);
  expect(screen.getByLabelText('Белая шашка движется').style.animationDelay).toBe('-250ms');
});

it('requires finishing the chosen capture chain after the first landing', () => {
  const { game } = fixture(),
    send = vi.fn();
  game.board[46] = 1;
  game.board[37] = -1;
  const { rerender } = render(<CheckersField game={game} disabled={false} send={send} now={0} />);
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 43' }));
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 25' }));
  rerender(<CheckersField game={game} disabled={false} send={send} now={450} />);
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 47' }));
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 29' }));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Клетка 11' }));
  expect(send).toHaveBeenCalledWith({ type: 'checkers', path: [42, 24, 10] });
});
