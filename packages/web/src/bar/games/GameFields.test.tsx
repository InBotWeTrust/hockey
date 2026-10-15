import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { barCheckers, barPool, createMatch, type BarGameSnapshot, type barDarts } from '@hockey/game-core';
import { CheckersField, PoolField, DartsField } from './GameFields.js';
import { GameResult, GameHelp } from './GameModals.js';
const snapshot = (kind: 'darts' | 'billiards' | 'checkers'): BarGameSnapshot => ({
  id: 'test',
  kind,
  character: kind === 'darts' ? 'maria' : kind === 'billiards' ? 'veronika' : 'arsenich',
  player: 0,
  participants: [
    { userId: 'a', displayName: 'Я', avatarUrl: null },
    { userId: 'bot', displayName: 'Персонаж', avatarUrl: null },
  ],
  runtime: createMatch(kind, 0, 0, true, 1),
  ready: null,
  serverNow: 0,
});
it('offers only legal checkers destinations and sends the complete selected path', () => {
  const game = barCheckers.create(0),
    send = vi.fn();
  render(<CheckersField game={game} disabled={false} send={send} />);
  const path = barCheckers.moves(game)[0]!;
  fireEvent.click(screen.getByRole('button', { name: `Клетка ${path[0]! + 1}` }));
  fireEvent.click(screen.getByRole('button', { name: `Клетка ${path[1]! + 1}` }));
  expect(send).toHaveBeenCalledWith({ type: 'checkers', path });
});
it('blocks a pool shot until the player has aimed, shows a power slider', () => {
  const send = vi.fn();
  render(
    <PoolField
      game={barPool.create(0)}
      balls={barPool.create(0).balls}
      disabled={true}
      send={send}
    />,
  );
  expect(screen.getByRole('slider', { name: 'Сила удара' })).toBeDisabled();
  expect(send).not.toHaveBeenCalled();
});
it('shows accurate game rules and the close control in its header', () => {
  render(<GameHelp kind="darts" close={() => {}} />);
  expect(screen.getByRole('dialog')).toHaveTextContent('301');
  expect(screen.getByRole('dialog')).toHaveTextContent('40 секунд');
  expect(screen.getByRole('button', { name: 'Закрыть' }).closest('.modal-header')).not.toBeNull();
});
it('uses character art and reply plus repeat/back, while online only acknowledges', () => {
  const view = snapshot('darts');
  view.runtime.game.winner = 0;
  view.runtime.reason = 'played';
  const { rerender } = render(<GameResult view={view} replay={() => {}} back={() => {}} />);
  expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  expect(screen.getByRole('img')).toHaveAttribute('src', '/bar/games/darts-character-win-v1.webp');
  rerender(<GameResult view={{ ...view, character: null }} replay={() => {}} back={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Понятно' })).toBeInTheDocument();
});
it('renders a precise dartboard rather than generated scoring geometry', () => {
  render(
    <DartsField
      game={snapshot('darts').runtime.game as barDarts.Game}
      lastDart={null}
      disabled={true}
      send={() => {}}
    />,
  );
  expect(screen.getByLabelText('Мишень для дартса')).toBeInTheDocument();
  expect(screen.getByText('20')).toBeInTheDocument();
});
