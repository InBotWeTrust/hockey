import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { barPool, barDarts, command, createMatch, type BarGameSnapshot } from '@hockey/game-core';
import { GameMenu } from './GameMenu.js';
afterEach(cleanup);
function snapshot(kind: 'billiards' | 'darts'): BarGameSnapshot {
  return {
    id: 'presentation',
    kind,
    character: kind === 'darts' ? 'daria' : 'veronika',
    player: 0,
    participants: [
      { userId: 'p', displayName: 'Игрок', avatarUrl: null },
      { userId: 'bot', displayName: 'Соперник', avatarUrl: null },
    ],
    runtime: createMatch(kind, 0, 0, false, 1),
    ready: null,
    serverNow: 0,
  };
}
function shot(before: BarGameSnapshot): BarGameSnapshot {
  const after = structuredClone(before),
    g = after.runtime.game;
  if (g.kind !== 'billiards') throw Error('Expected pool');
  after.runtime.game = barPool.resolve(g, {
    firstContact: 1,
    pocketed: [1],
    railAfter: true,
    scratch: false,
  });
  after.runtime.feedback = { type: 'shot', actor: 0, pocketed: [1], foul: false };
  after.runtime.animationStart = 1000;
  after.runtime.animationUntil = 5000;
  after.runtime.poolFrames = [g.balls, after.runtime.game.balls];
  after.runtime.revision++;
  return after;
}
it('reveals newly assigned pool groups and counts only after the shot finishes', () => {
  const before = snapshot('billiards');
  if (before.runtime.game.kind !== 'billiards') throw Error();
  before.runtime.game.break = false;
  const { container, rerender } = render(<GameMenu view={before} now={0} />),
    after = shot(before);
  rerender(<GameMenu view={after} now={1001} />);
  expect(screen.queryByRole('img', { name: 'Сплошные шары' })).toBeNull();
  expect(container.querySelector('.bar-game-player--self .durak-player-count')).toHaveTextContent(
    '(0)',
  );
  rerender(<GameMenu view={structuredClone(after)} now={1500} />);
  expect(screen.queryByRole('img', { name: 'Сплошные шары' })).toBeNull();
  rerender(<GameMenu view={after} now={1900} />);
  expect(screen.getByRole('img', { name: 'Сплошные шары' })).toBeInTheDocument();
  expect(container.querySelector('.bar-game-player--self .durak-player-count')).toHaveTextContent(
    '(1)',
  );
});
it('keeps established pool groups and the old count during a shot', () => {
  const before = snapshot('billiards');
  if (before.runtime.game.kind !== 'billiards') throw Error();
  before.runtime.game.break = false;
  before.runtime.game.groups = ['solids', 'stripes'];
  const { container, rerender } = render(<GameMenu view={before} now={0} />);
  rerender(<GameMenu view={shot(before)} now={1001} />);
  expect(screen.getByRole('img', { name: 'Сплошные шары' })).toBeInTheDocument();
  expect(container.querySelector('.bar-game-player--self .durak-player-count')).toHaveTextContent(
    '(0)',
  );
});
it('does not reveal pool groups when opening a match in the middle of a shot or switching matches', () => {
  const before = snapshot('billiards');
  if (before.runtime.game.kind !== 'billiards') throw Error();
  before.runtime.game.break = false;
  const after = shot(before),
    { rerender } = render(<GameMenu view={after} now={1001} />);
  expect(screen.queryByRole('img', { name: 'Сплошные шары' })).toBeNull();
  rerender(<GameMenu view={after} now={1900} />);
  expect(screen.getByRole('img', { name: 'Сплошные шары' })).toBeInTheDocument();
  rerender(<GameMenu view={{ ...after, id: 'another' }} now={1001} />);
  expect(screen.queryByRole('img', { name: 'Сплошные шары' })).toBeNull();
});
it.each([
  [181, 3, 0.6, 90, 'остался 1'],
  [50, 1, 0.6, 0, 'превышен остаток'],
  [20, 1, 0.4, 0, 'нужно удвоение'],
] as const)(
  'explains the double-out bust from %s after %s darts',
  (start, throws, radius, angle, reason) => {
    const view = snapshot('darts');
    let m = view.runtime;
    if (m.game.kind !== 'darts') throw Error();
    m.game = { ...m.game, scores: [start, 501], turnStartScore: start, boardAngle: angle };
    const p = barDarts.rotatePoint({ x: 0, y: -radius }, angle),
      dy = (-(1.6 - p.y) * 400) / 720;
    for (let i = 0; i < throws; i++)
      m = command(
        m,
        0,
        { type: 'dart', gesture: { dx: (p.x / 1.4) * -dy, dy, durationMs: 400 } },
        m.animationUntil + 1,
      );
    expect(m.feedback?.bust).toBe(true);
    render(<GameMenu view={{ ...view, runtime: m }} now={m.animationStart + 800} />);
    expect(screen.getByRole('status')).toHaveTextContent(reason);
    expect(screen.getByRole('status')).toHaveTextContent('ход отменён');
  },
);
