import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { barOchko } from '@hockey/game-core';
import { OchkoField } from './OchkoField.js';
afterEach(cleanup);
it('renders only the provided hand and sends numbered commands', () => {
  const g = barOchko.ochkoView(barOchko.createOchko(1, 0), 0);
  const send = vi.fn();
  render(<OchkoField game={g} player={0} now={800} disabled={false} send={send} />);
  expect(screen.getAllByAltText('Закрытая карта')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Хватит' }));
  expect(send).toHaveBeenCalledWith({ type: 'ochko-stand', seq: 1 });
});
it('blocks action while dealing and after stand', () => {
  const g = {
    ...barOchko.ochkoView(barOchko.createOchko(1, 0), 0),
    done: [true, false] as [boolean, boolean],
  };
  render(<OchkoField game={g} player={0} now={800} disabled={false} send={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Ещё карту' })).toBeDisabled();
});
