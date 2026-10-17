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
it('keeps disabled hand controls during reveal and replaces them with review controls',()=>{
 const g=review(true);g.series.phase='reveal';const now=g.series.reviewAt-1,send=vi.fn();
 const {rerender}=render(<OchkoField game={series.view(g,0,now)} player={0} now={now} disabled={false} character send={send}/>);
 for(const name of ['Ещё карту','Хватит']) {const b=screen.getByRole('button',{name});expect(b).toBeDisabled();fireEvent.click(b);}
 expect(send).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'Дальше'})).toBeNull();
 g.series.phase='review';
 rerender(<OchkoField game={series.view(g,0,g.series.reviewAt)} player={0} now={g.series.reviewAt} disabled={false} character send={send}/>);
 expect(screen.queryByRole('button',{name:'Хватит'})).toBeNull();
 expect(screen.getByRole('button',{name:'Проверить счёт'})).toBeEnabled();
 expect(screen.getByRole('button',{name:'Дальше'})).toBeEnabled();
});
it('does not display hidden-score sentinels as player totals',()=>{
 const g=review(false),v=series.view(g,0,g.series.reviewAt);v.scores=[-1,-1];
 const {container}=render(<OchkoField game={v} player={0} now={g.series.reviewAt} disabled={false} send={vi.fn()}/>);
 expect(container.querySelector('.bar-ochko-sum')).toBeNull();
 expect(screen.queryByText('-1')).not.toBeInTheDocument();
});
