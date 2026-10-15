import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { createMatch, type BarGameSnapshot } from '@hockey/game-core';
import { GameTable } from './BarGameScreen.js';
const view = (): BarGameSnapshot => ({
  id: 'test',
  kind: 'darts',
  character: 'maria',
  player: 0,
  participants: [
    { userId: 'p', displayName: 'Игрок', avatarUrl: '/player.webp' },
    { userId: 'maria', displayName: 'Мария', avatarUrl: '/bar/cards/avatar-v2.webp' },
  ],
  runtime: createMatch('darts', 0, 0, false, 1),
  ready: null,
  serverNow: 0,
});
it('uses the card menu with two avatars, a central timer and feedback above the field', () => {
  const v = view();
  const { container } = render(<GameTable view={v} now={0} disabled={false} send={() => {}} />);
  const menu = screen.getByRole('region', { name: 'Меню игры' });
  expect(menu).toHaveClass('durak-menu', 'game-scoreboard-stack');
  expect(within(menu).getByRole('img', { name: 'Твой аватар' })).toBeInTheDocument();
  expect(within(menu).getByRole('img', { name: 'Аватар: Мария' })).toBeInTheDocument();
  expect(within(menu).getByRole('timer', { name: 'Осталось времени' })).toHaveTextContent('40');
  expect(within(menu).getByRole('status')).toHaveTextContent('Твой ход');
  expect(menu.nextElementSibling).toBe(container.querySelector('.bar-game-field'));
  expect(container.querySelector('.bar-game-turn')).toBeNull();
});
it('reports the actual hit result in the feedback strip and preserves timer warning colours', () => {
  const v = view();
  v.runtime.feedback = { type: 'dart', actor: 0, points: 20, bust: false };
  v.runtime.game.kind === 'darts' && (v.runtime.game.scores[0] = 281);
  render(<GameTable view={v} now={33000} disabled={false} send={() => {}} />);
  const menu = screen.getByRole('region', { name: 'Меню игры' });
  expect(within(menu).getByRole('status')).toHaveTextContent('20 очков');
  expect(within(menu).getByRole('timer')).toHaveAttribute('data-tone', 'warning');
});
it('shows a bust rather than awarded points after an overscoring dart', () => {
  const v = view();
  v.runtime.feedback = { type: 'dart', actor: 0, points: 60, bust: true };
  render(<GameTable view={v} now={37000} disabled={false} send={() => {}} />);
  expect(
    within(screen.getByRole('region', { name: 'Меню игры' })).getByRole('status'),
  ).toHaveTextContent('Перебор');
  expect(screen.getByRole('timer')).toHaveAttribute('data-tone', 'danger');
});
