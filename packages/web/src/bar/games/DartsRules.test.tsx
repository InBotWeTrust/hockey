import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { createMatch, command, type BarGameSnapshot } from '@hockey/game-core';
import { GameHelp } from './GameModals.js';
import { GameMenu } from './GameMenu.js';
afterEach(cleanup);
it('describes single-out and preserving earlier darts for new games', () => {
  render(<GameHelp kind="darts" close={() => {}} />);
  expect(screen.getByRole('dialog')).toHaveTextContent('Удвоение для победы не требуется');
  expect(screen.getByRole('dialog')).toHaveTextContent('не засчитывается только этот дротик');
  expect(screen.getByRole('dialog')).toHaveTextContent('остаток станет 1');
  expect(screen.getByRole('dialog')).not.toHaveTextContent('все набранные за него очки отменяются');
});
it('keeps double-out instructions for an already started engine 10 game', () => {
  render(<GameHelp kind="darts" engineVersion={10} close={() => {}} />);
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Последний дротик должен попасть в удвоение',
  );
  expect(screen.getByRole('dialog')).toHaveTextContent('все набранные за него очки отменяются');
});
it('only says that the offending dart is not counted in the new mode', () => {
  let m = createMatch('darts', 0, 0, false, 1);
  if (m.game.kind !== 'darts') throw Error();
  m.game = { ...m.game, scores: [30, 501], turnStartScore: 50 };
  m = command(
    m,
    0,
    { type: 'dart', gesture: { dx: 0, dy: (-2.2 * 400) / 720, durationMs: 400 } },
    1,
  );
  const view: BarGameSnapshot = {
    id: 'single',
    kind: 'darts',
    character: 'daria',
    player: 0,
    runtime: m,
    ready: null,
    serverNow: 801,
    participants: [
      { userId: 'p', displayName: 'Игрок', avatarUrl: null },
      { userId: 'daria', displayName: 'Дарья', avatarUrl: null },
    ],
  };
  render(<GameMenu view={view} now={801} />);
  expect(screen.getByRole('status')).toHaveTextContent('Перебор – дротик не засчитан');
  expect(screen.getByRole('status')).not.toHaveTextContent('ход отменён');
});
