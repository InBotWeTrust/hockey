import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ResponsiveFightControls } from './ResponsiveFightControls.js';
afterEach(()=>{vi.useRealTimers();});
const mount=()=>{const onInput=vi.fn(),onAttack=vi.fn();render(<ResponsiveFightControls disabled={false} reset={0} inRange onInput={onInput} onAttack={onAttack}/>);return {onInput,onAttack};};
it('publishes only one neutral input for pointer release and lost capture',()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const {onInput}=mount();const arrow=screen.getByRole('button',{name:'Двигаться вперёд'});
 fireEvent.pointerDown(arrow,{pointerId:1});fireEvent.pointerUp(arrow,{pointerId:1});fireEvent.lostPointerCapture(arrow,{pointerId:1});
 expect(onInput.mock.calls.at(-1)![0].direction).toBe(1);
 act(()=>vi.advanceTimersByTime(120));
 expect(onInput.mock.calls.filter(([input])=>input.direction===0)).toHaveLength(1);
});
it('starts an attack on press without waiting for finger release or firing twice',()=>{
 const {onAttack}=mount();const attack=screen.getByRole('button',{name:'Удар'});
 fireEvent.pointerDown(attack,{pointerId:2});expect(onAttack).toHaveBeenCalledTimes(1);
 fireEvent.pointerUp(attack,{pointerId:2});fireEvent.click(attack,{detail:1});expect(onAttack).toHaveBeenCalledTimes(1);
 fireEvent.click(attack,{detail:0});expect(onAttack).toHaveBeenCalledTimes(2);
});

it('releases a long arrow hold immediately',()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const {onInput}=mount();const arrow=screen.getByRole('button',{name:'Двигаться вперёд'});
 fireEvent.pointerDown(arrow,{pointerId:3});act(()=>vi.advanceTimersByTime(300));fireEvent.pointerUp(arrow,{pointerId:3});
 expect(onInput.mock.calls.at(-1)![0].direction).toBe(0);
});


it('keeps crouch and guard held independently while attacking and releasing movement', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const { onInput, onAttack } = mount();
  const forward = screen.getByRole('button', { name: 'Двигаться вперёд' });
  const crouch = screen.getByRole('button', { name: 'Присесть' });
  const guard = screen.getByRole('button', { name: 'Блок' });
  fireEvent.pointerDown(forward, { pointerId: 1 });
  fireEvent.pointerDown(crouch, { pointerId: 2 });
  fireEvent.pointerDown(guard, { pointerId: 3 });
  expect(onInput.mock.calls.at(-1)![0]).toEqual({ direction: 1, crouch: true, guard: true });
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Удар' }), { pointerId: 4 });
  expect(onAttack).toHaveBeenCalledTimes(1);
  expect(guard).toHaveAttribute('aria-pressed', 'true');
  act(() => vi.advanceTimersByTime(300));
  fireEvent.pointerUp(forward, { pointerId: 1 });
  expect(onInput.mock.calls.at(-1)![0]).toEqual({ direction: 0, crouch: true, guard: true });
  fireEvent.pointerCancel(crouch, { pointerId: 2 });
  expect(onInput.mock.calls.at(-1)![0]).toEqual({ direction: 0, crouch: false, guard: true });
  fireEvent.lostPointerCapture(guard, { pointerId: 3 });
  expect(onInput.mock.calls.at(-1)![0]).toEqual({ direction: 0, crouch: false, guard: false });
});

it('a rapid second tap on the same arrow is not stopped by the first tap release timer', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const { onInput } = mount();
  const arrow = screen.getByRole('button', { name: 'Двигаться вперёд' });
  fireEvent.pointerDown(arrow, { pointerId: 1 });
  fireEvent.pointerUp(arrow, { pointerId: 1 });
  act(() => vi.advanceTimersByTime(40));
  fireEvent.pointerDown(arrow, { pointerId: 1 });
  act(() => vi.advanceTimersByTime(200));
  expect(onInput.mock.calls.at(-1)![0].direction).toBe(1);
  expect(arrow).toHaveAttribute('aria-pressed', 'true');
  fireEvent.pointerUp(arrow, { pointerId: 1 });
  expect(onInput.mock.calls.at(-1)![0].direction).toBe(0);
});

it('disabling controls clears held buttons and pending tap release before the next fight', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const onInput = vi.fn();
  const onAttack = vi.fn();
  const view = render(<ResponsiveFightControls disabled={false} reset={0} inRange onInput={onInput} onAttack={onAttack} />);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Двигаться вперёд' }), { pointerId: 1 });
  fireEvent.pointerUp(screen.getByRole('button', { name: 'Двигаться вперёд' }), { pointerId: 1 });
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Блок' }), { pointerId: 2 });
  view.rerender(<ResponsiveFightControls disabled reset={1} inRange onInput={onInput} onAttack={onAttack} />);
  expect(onInput.mock.calls.at(-1)![0]).toEqual({ direction: 0, crouch: false, guard: false });
  const count = onInput.mock.calls.length;
  act(() => vi.advanceTimersByTime(500));
  expect(onInput).toHaveBeenCalledTimes(count);
  view.rerender(<ResponsiveFightControls disabled={false} reset={1} inRange onInput={onInput} onAttack={onAttack} />);
  expect(screen.getByRole('button', { name: 'Блок' })).toHaveAttribute('aria-pressed', 'false');
});
