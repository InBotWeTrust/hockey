import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { createMatch } from '@hockey/game-core';
import { BarGameScreen } from './BarGameScreen.js';
const scenario = vi.hoisted(() => ({ kind: 'checkers' as 'checkers' | 'darts' }));
afterEach(cleanup);
vi.mock('./useGameMatch.js', () => ({
  useGameMatch: () => ({
    view: {
      id: 'layout',
      kind: scenario.kind,
      character: 'arsenich',
      player: 0,
      participants: [
        { userId: 'player', displayName: 'Игрок', avatarUrl: null },
        { userId: 'arsenich', displayName: 'Арсенич', avatarUrl: null },
      ],
      runtime: createMatch(scenario.kind, 0, Date.now(), true, 12),
      ready: null,
    },
    now: Date.now(),
    busy: false,
    send: vi.fn(),
  }),
}));
it('places checkers controls in the notice row without a title', () => {
  scenario.kind = 'checkers';
  render(
    <MemoryRouter>
      <BarGameScreen />
    </MemoryRouter>,
  );
  for (const name of ['Выйти из партии', 'Правила игры']) {
    expect(screen.getByRole('button', { name }).closest('.bar-game-notice-row')).not.toBeNull();
  }
  expect(screen.queryByRole('heading', { name: 'Шашки' })).not.toBeInTheDocument();
});

it('removes the darts title and renders controls outside its throwing area', () => {
  scenario.kind = 'darts';
  render(
    <MemoryRouter>
      <BarGameScreen />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('heading', { name: 'Дартс' })).not.toBeInTheDocument();
  for (const name of ['Выйти из партии', 'Правила игры']) {
    const button = screen.getByRole('button', { name });
    expect(button.closest('.bar-darts-field')).toBeNull();
    expect(button.closest('.bar-game-notice-row')).not.toBeNull();
  }
});
