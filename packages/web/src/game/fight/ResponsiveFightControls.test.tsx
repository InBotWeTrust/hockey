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

it('combines physical keyboard crouch, block and punch across keyboard layouts',()=>{
 const {onInput,onAttack}=mount();
 fireEvent.keyDown(window,{code:'ArrowDown',key:'ArrowDown'});
 fireEvent.keyDown(window,{code:'KeyZ',key:'я'});
 expect(onInput).toHaveBeenLastCalledWith({direction:0,crouch:true,guard:true});
 fireEvent.keyDown(window,{code:'KeyX',key:'ч'});
 fireEvent.keyDown(window,{code:'KeyX',key:'ч',repeat:true});
 expect(onAttack).toHaveBeenCalledTimes(1);
 fireEvent.keyUp(window,{code:'KeyZ'});
 expect(onInput).toHaveBeenLastCalledWith({direction:0,crouch:true,guard:false});
 fireEvent.keyUp(window,{code:'ArrowDown'});
 expect(onInput).toHaveBeenLastCalledWith({direction:0,crouch:false,guard:false});
});

it('keeps mouse and keyboard holds independent and clears both on blur',()=>{
 const {onInput}=mount();
 fireEvent.keyDown(window,{code:'ArrowRight'});
 fireEvent.pointerDown(screen.getByRole('button',{name:'Блок'}),{pointerId:12});
 fireEvent.keyDown(window,{code:'KeyZ'});
 fireEvent.keyUp(window,{code:'KeyZ'});
 expect(onInput).toHaveBeenLastCalledWith({direction:1,crouch:false,guard:true});
 fireEvent.blur(window);
 expect(onInput).toHaveBeenLastCalledWith({direction:0,crouch:false,guard:false});
});

it('ignores shortcuts while disabled, typing, or using browser modifiers',()=>{
 const onInput=vi.fn(),onAttack=vi.fn();
 const view=render(<ResponsiveFightControls disabled reset={0} inRange onInput={onInput} onAttack={onAttack}/>);
 fireEvent.keyDown(window,{code:'KeyX'});
 expect(onAttack).not.toHaveBeenCalled();
 view.rerender(<><input aria-label="Chat"/><ResponsiveFightControls disabled={false} reset={0} inRange onInput={onInput} onAttack={onAttack}/></>);
 fireEvent.keyDown(screen.getByRole('textbox'),{code:'KeyX'});
 fireEvent.keyDown(window,{code:'KeyX',ctrlKey:true});
 expect(onAttack).not.toHaveBeenCalled();
 view.unmount();fireEvent.keyDown(window,{code:'KeyX'});
 expect(onAttack).not.toHaveBeenCalled();
});

it('releases keyboard controls on hiding and cancels opposite directions',()=>{
 const {onInput,onAttack}=mount();
 fireEvent.keyDown(window,{code:'ArrowLeft'});
 expect(onInput).toHaveBeenLastCalledWith({direction:-1,crouch:false,guard:false});
 fireEvent.keyDown(window,{code:'ArrowRight'});
 expect(onInput).toHaveBeenLastCalledWith({direction:0,crouch:false,guard:false});
 fireEvent.keyUp(window,{code:'ArrowRight'});
 expect(onInput).toHaveBeenLastCalledWith({direction:-1,crouch:false,guard:false});
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);
 fireEvent(document,new Event('visibilitychange'));
 expect(onInput).toHaveBeenLastCalledWith({direction:0,crouch:false,guard:false});
 hidden.mockRestore();
 fireEvent.keyDown(window,{code:'KeyX'});fireEvent.keyUp(window,{code:'KeyX'});fireEvent.keyDown(window,{code:'KeyX'});
 expect(onAttack).toHaveBeenCalledTimes(2);
});
