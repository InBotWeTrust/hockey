import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { createMatch, publicRuntime, type BarGameSnapshot } from '@hockey/game-core';
import { BarGameScreen } from './BarGameScreen.js';

const state = vi.hoisted(() => ({ view: null as BarGameSnapshot | null }));
vi.mock('./useGameMatch.js', () => ({
  useGameMatch: () => ({
    view: state.view, now: 1000, busy: false, armBlocked: false, error: null,
    uncertain: false, send: vi.fn(), retry: vi.fn(),
  }),
}));
afterEach(cleanup);

it.each(['billiards', 'darts', 'checkers', 'ochko', 'battleship', 'armwrestling'] as const)(
  'blocks browser selection menus and native dragging in %s', kind => {
    state.view = {
      id: 'selection-test', kind, character: null, player: 0,
      participants: [
        { userId: 'a', displayName: 'Игрок', avatarUrl: '/player.webp' },
        { userId: 'b', displayName: 'Соперник', avatarUrl: '/opponent.webp' },
      ],
      runtime: publicRuntime(createMatch(kind, 0, 0, false, 4), 0),
      ready: null, serverNow: 1000,
    };
    render(<MemoryRouter><BarGameScreen /></MemoryRouter>);
    const main = screen.getByRole('main');
    expect(fireEvent.contextMenu(main)).toBe(false);
    expect(fireEvent.dragStart(screen.getByRole('img', { name: 'Твой аватар' }))).toBe(false);
    expect(main).toHaveAttribute('data-game-interaction');
    fireEvent.click(screen.getByRole('button', { name: 'Правила игры' }));
    expect(fireEvent.contextMenu(screen.getByRole('dialog'))).toBe(false);
  },
);
