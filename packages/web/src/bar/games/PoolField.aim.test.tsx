import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { barPool } from '@hockey/game-core';
import { PoolField } from './GameFields.js';
afterEach(cleanup);
function setup(ballInHand = false) {
  const game = { ...barPool.create(0), ballInHand },
    send = vi.fn();
  const { container } = render(
    <PoolField game={game} balls={game.balls} disabled={false} send={send} />,
  );
  const table = screen.getByRole('img', { name: 'Бильярдный стол' });
  Object.assign(table, {
    getScreenCTM: () => ({ inverse: () => ({}) }),
    setPointerCapture: vi.fn(),
    createSVGPoint: () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x / 100, y: this.y / 100 };
      },
    }),
  });
  send.mockClear();
  return { container, table, send };
}
function pointer(
  type: 'pointerDown' | 'pointerMove' | 'pointerUp',
  element: Element,
  x: number,
  y: number,
) {
  const event = createEvent[type](element);
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: 1 },
  });
  fireEvent(element, event);
}
it('ignores dragging the aiming line and only rotates when dragging the cue', () => {
  const { container, table, send } = setup();
  pointer('pointerDown', table, 50, 50);
  pointer('pointerMove', table, 20, 60);
  pointer('pointerUp', table, 20, 60);
  expect(send).not.toHaveBeenCalled();
  const handle = container.querySelector('.bar-pool-cue-handle');
  expect(handle).not.toBeNull();
  pointer('pointerDown', handle!, 50, 200);
  pointer('pointerMove', table, 20, 180);
  pointer('pointerUp', table, 20, 180);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'aim' }));
});
it('still places a ball in hand by tapping the table', () => {
  const { table, send } = setup(true);
  pointer('pointerDown', table, 35, 110);
  expect(send).toHaveBeenCalledWith({ type: 'place', point: { x: 0.35, y: 1.1 } });
});
