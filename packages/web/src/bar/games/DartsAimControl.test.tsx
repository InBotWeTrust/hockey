import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { barDarts } from '@hockey/game-core';
import { DartsField } from './GameFields.js';
afterEach(cleanup);
function pointer(
  type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
  element: Element,
  x = 180,
  y = 700,
) {
  const event = createEvent[type](element);
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: 1 },
  });
  fireEvent(element, event);
}
it('aims while held and submits one bounded dart on release without using swipe speed', () => {
  const send = vi.fn();
  const { container } = render(
    <DartsField game={barDarts.create(0)} lastDart={null} disabled={false} send={send} />,
  );
  const svg = container.querySelector('svg')!;
  Object.assign(svg, {
    getScreenCTM: () => ({ a: 1, b: 0 }),
    createSVGPoint: () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      },
    }),
  });
  const handle = screen.getByRole('button', { name: 'Зажми дротик, наведи и отпусти' });
  Object.assign(handle, { setPointerCapture: vi.fn() });
  pointer('pointerDown', handle);
  pointer('pointerMove', handle, 195, 675);
  expect(send).not.toHaveBeenCalled();
  pointer('pointerUp', handle, 195, 675);
  fireEvent.lostPointerCapture(handle, {pointerId:1});
  expect(send).toHaveBeenCalledTimes(1);
  const action = send.mock.calls[0]![0];
  expect(action.type).toBe('dart');
  expect(action.gesture.durationMs).toBe(400);
  const point = barDarts.aim(action.gesture);
  expect(Math.abs(point.x)).toBeLessThan(1.11);
  expect(Math.abs(point.y)).toBeLessThan(1.11);
  pointer('pointerDown', handle);
  pointer('pointerCancel', handle);
  pointer('pointerUp', handle);
  expect(send).toHaveBeenCalledTimes(1);
});
it('retains swipe controls for matches started on older engine versions', () => {
  render(
    <DartsField
      game={barDarts.create(0)}
      engineVersion={3}
      lastDart={null}
      disabled={false}
      send={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole('button', { name: 'Зажми дротик, наведи и отпусти' }),
  ).not.toBeInTheDocument();
});

it('allows another throw after the browser loses pointer capture',()=>{
 const send=vi.fn();const {container}=render(<DartsField game={barDarts.create(0)} lastDart={null} disabled={false} send={send}/>);
 const svg=container.querySelector('svg')!;
 Object.assign(svg,{getScreenCTM:()=>null});
 const handle=screen.getByRole('button',{name:'Зажми дротик, наведи и отпусти'});
 Object.assign(handle,{setPointerCapture:vi.fn()});
 pointer('pointerDown',handle);
 fireEvent.lostPointerCapture(handle,{pointerId:1});
 expect(handle).toHaveAttribute('data-holding','false');
 pointer('pointerDown',handle);pointer('pointerUp',handle);
 expect(send).toHaveBeenCalledTimes(1);
});

it('cancels aiming on window blur instead of leaving the dart stuck',()=>{
 const send=vi.fn();const {container}=render(<DartsField game={barDarts.create(0)} lastDart={null} disabled={false} send={send}/>);
 Object.assign(container.querySelector('svg')!,{getScreenCTM:()=>null});
 const handle=screen.getByRole('button',{name:'Зажми дротик, наведи и отпусти'});
 Object.assign(handle,{setPointerCapture:vi.fn()});
 pointer('pointerDown',handle);fireEvent.blur(window);
 expect(handle).toHaveAttribute('data-holding','false');
 pointer('pointerUp',handle);expect(send).not.toHaveBeenCalled();
 pointer('pointerDown',handle);pointer('pointerUp',handle);expect(send).toHaveBeenCalledTimes(1);
});
