import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import {
  barOchkoSeries,
  createMatch,
  publicRuntime,
  type BarGameSnapshot,
} from '@hockey/game-core';
import { GameMenu } from './GameMenu.js';
it('keeps round and cumulative scores inside the header and labels the three-minute review clock', () => {
  let runtime = createMatch('ochko', 0, 0, true, 1);
  let g = barOchkoSeries.create(
    Array.from({ length: 36 }, (_, i) => 35 - i),
    0,
    true,
    0,
    3000,
    5,
  );
  g = barOchkoSeries.act(g, 0, 'stand', 1, 1400);
  g = barOchkoSeries.act(g, 1, 'stand', 1, 1400);
  g = barOchkoSeries.advance(g, g.series.reviewAt);
  runtime = { ...runtime, game: g };
  const now = g.series.reviewUntil - 138000;
  const view: BarGameSnapshot = {
    id: 'series-menu',
    kind: 'ochko',
    character: 'grigory',
    player: 0,
    participants: [
      { userId: 'a', displayName: 'Игрок', avatarUrl: null },
      { userId: 'g', displayName: 'Григорий', avatarUrl: null },
    ],
    runtime: publicRuntime(runtime, 0, now),
    ready: null,
    serverNow: now,
  };
  const { container } = render(<GameMenu view={view} now={now} />);
  const header = container.querySelector('.game-scoreboard')! as HTMLElement;
  expect(within(header).getByRole('group', {name:'Раздача'})).toHaveTextContent('1/5');
  expect(screen.getByRole('timer')).toHaveTextContent('Таймер');
  expect(screen.getByRole('timer')).not.toHaveTextContent('Раздача');
  expect(screen.queryByText('Раздача 1 из 4')).not.toBeInTheDocument();
  expect(screen.getByRole('timer')).toHaveTextContent('2:18');
  expect(screen.getByRole('timer')).not.toHaveTextContent('Проверка');
});
