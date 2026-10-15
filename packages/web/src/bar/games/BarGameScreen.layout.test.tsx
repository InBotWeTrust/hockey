import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { createMatch } from '@hockey/game-core';
import { BarGameScreen } from './BarGameScreen.js';
vi.mock('./useGameMatch.js', () => ({
  useGameMatch: () => ({
    view: {
      id: 'layout',
      kind: 'checkers',
      character: 'arsenich',
      player: 0,
      participants: [
        { userId: 'player', displayName: 'Игрок', avatarUrl: null },
        { userId: 'arsenich', displayName: 'Арсенич', avatarUrl: null },
      ],
      runtime: createMatch('checkers', 0, Date.now(), true, 12),
      ready: null,
    },
    now: Date.now(),
    busy: false,
    send: vi.fn(),
  }),
}));
it('places checkers exit and rules after the board without a title', () => {
  render(
    <MemoryRouter>
      <BarGameScreen />
    </MemoryRouter>,
  );
  const board = screen.getByRole('group', { name: 'Шашечная доска' });
  for (const name of ['Выйти из партии', 'Правила игры']) {
    expect(
      board.compareDocumentPosition(screen.getByRole('button', { name })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
  expect(screen.queryByRole('heading', { name: 'Шашки' })).not.toBeInTheDocument();
});
