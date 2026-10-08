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
