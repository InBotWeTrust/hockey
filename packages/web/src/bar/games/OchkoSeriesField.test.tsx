import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { barOchkoSeries as series } from '@hockey/game-core';
import { OchkoField } from './OchkoField.js';
function review(character: boolean) {
  let g = series.create(
    Array.from({ length: 36 }, (_, i) => 35 - i),
    0,
    character,
    0,
  );
  g = series.act(g, 0, 'stand', 1, 1400);
  g = series.act(g, 1, 'stand', 1, 1400);
  return series.advance(g, g.series.reviewAt);
}
it('binds hand and review commands to the current round and hides online challenges', () => {
  const g = review(false),
    send = vi.fn();
  render(
    <OchkoField
      game={series.view(g, 0, g.series.reviewAt)}
      player={0}
      now={g.series.reviewAt}
      disabled={false}
      send={send}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Проверить счёт' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
  expect(send).toHaveBeenCalledWith({ type: 'ochko-next', round: 1 });
});
it('offers exactly one challenge to Grigory and disables hand actions during review', () => {
  const g = review(true),
    send = vi.fn();
  render(
    <OchkoField
      character
      game={series.view(g, 0, g.series.reviewAt)}
      player={0}
      now={g.series.reviewAt}
      disabled={false}
      send={send}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Ещё карту' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Проверить счёт' }));
  expect(send).toHaveBeenCalledWith({ type: 'ochko-challenge', round: 1 });
});
