import {fireEvent, render, screen} from '@testing-library/react';
import {createDefaultBarLayout, moveBarOccupant} from '@hockey/game-core';
import {expect, it, vi} from 'vitest';
import {BarScene} from './BarScene.js';
it('keeps architectural doors in the panorama when Veronika moves', () => {
  const layout = moveBarOccupant(createDefaultBarLayout(), 'bar-2', 'veronika');
  const view = render(<BarScene layout={layout} activeSlotId="bar-2" onSelectSlot={vi.fn()} onAction={vi.fn()}/>);
  expect(view.container.querySelector('[data-bar-backdrop="veronika"]')).toBeNull();
  expect(view.container.querySelector('.bar-space__background--middle')?.getAttribute('src')).toMatch(/middle-.*-v7.webp$/);
  expect(view.container.querySelector('[data-bar-decoration="veronika"]')).toBeNull();
});
it('keeps the eastern panorama framing fixed between Igor and broadcasts', () => {
  const layout = createDefaultBarLayout();
  const props = {layout, onSelectSlot: vi.fn(), onAction: vi.fn()};
  const view = render(<BarScene {...props} activeSlotId="bar-9"/>);
  const before = (view.container.querySelector('.bar-space__background--east') as HTMLElement).style.objectPosition;
  view.rerender(<BarScene {...props} activeSlotId="bar-10"/>);
  expect((view.container.querySelector('.bar-space__background--east') as HTMLElement).style.objectPosition).toBe(before);
});

it('uses baked background details without overlays and opens the door only at the last page', () => {
  const layout = moveBarOccupant(createDefaultBarLayout(), 'bar-6', 'maria');
  const open = vi.fn();
  const view = render(<BarScene layout={layout} activeSlotId="bar-6" onSelectSlot={vi.fn()} onAction={vi.fn()} onStaffRoom={open}/>);
  expect(view.container.querySelector('[data-bar-decoration]')).toBeNull();
  expect(screen.queryByRole('button', {name: 'Открыть служебную дверь'})).not.toBeInTheDocument();
  view.rerender(<BarScene layout={layout} activeSlotId="bar-10" onSelectSlot={vi.fn()} onAction={vi.fn()} onStaffRoom={open}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Открыть служебную дверь'}));
  expect(open).toHaveBeenCalledWith('bar-10');
});
it('swipes across the service door without opening it', () => {
  const layout = createDefaultBarLayout();
  const open = vi.fn(), select = vi.fn();
  render(<BarScene layout={layout} activeSlotId="bar-10" onSelectSlot={select} onAction={vi.fn()} onStaffRoom={open}/>);
  const door = screen.getByRole('button', {name: 'Открыть служебную дверь'});
  fireEvent.pointerDown(door, {pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 200});
  fireEvent.pointerMove(door, {pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 200});
  fireEvent.pointerUp(door, {pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 200});
  fireEvent.click(door);
  expect(open).not.toHaveBeenCalled();
  expect(select).toHaveBeenCalledWith('bar-9');
});

it('opens each background game with its own character and ignores a swipe', () => {
  const action = vi.fn();
  render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={action}/>);
  for (const [name, kind, character] of [['Играть в дартс с Дарьей','darts','daria'],['Играть в карты с Григорием','cards','grigory'],['Играть в карты с Марией','cards','maria'],['Играть в шашки с Арсеничем','checkers','arsenich'],['Играть в бильярд с Вероникой','billiards','veronika']] as const) {
    fireEvent.click(screen.getByRole('button', {name}));
    expect(action).toHaveBeenLastCalledWith(kind, character);
  }
  action.mockClear();
  const hit = screen.getByRole('button', {name:'Играть в дартс с Дарьей'});
  fireEvent.pointerDown(hit, {pointerId:1,clientX:100,clientY:100});
  fireEvent.pointerUp(hit, {pointerId:1,clientX:180,clientY:100});
  fireEvent.click(hit);
  expect(action).not.toHaveBeenCalled();
});

it('shrinks characters while preserving the bottom anchor', () => {
 const view=render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={vi.fn()}/>);
 const figure=view.container.querySelector('.bar-space__figure img') as HTMLElement;
 expect(figure.style.width).toBe('90%');
 expect(figure.style.height).toBe('90%');
 expect(figure.style.top).toBe('55%');
});

it('shows activity badges on online and character circles and removes zero counts',()=>{
 const props={layout:createDefaultBarLayout(),activeSlotId:'bar-5',onSelectSlot:vi.fn(),onAction:vi.fn()};
 const view=render(<BarScene {...props} activityCounts={{online:2,veronika:1}}/>);
 expect(screen.getByRole('button',{name:'Играть онлайн'})).toHaveTextContent('2');
 expect(screen.getByRole('button',{name:'Вероника'})).toHaveTextContent('1');
 view.rerender(<BarScene {...props} activityCounts={{online:0}}/>);
 expect(view.container.querySelector('.bar-avatar-dock__badge')).toBeNull();
});

it('highlights only the selected character object and never the hidden door',()=>{
 const props={layout:createDefaultBarLayout(),onSelectSlot:vi.fn(),onAction:vi.fn()};
 const view=render(<BarScene {...props} activeSlotId="bar-1"/>);
 expect(view.container.querySelector('[data-bar-object-glow="daria"]')).not.toBeNull();
 expect(view.container.querySelectorAll('[data-bar-object-glow]')).toHaveLength(1);
 view.rerender(<BarScene {...props} activeSlotId="bar-9"/>);
 expect(view.container.querySelector('[data-bar-object-glow="igor"]')).not.toBeNull();
 view.rerender(<BarScene {...props} activeSlotId="bar-10"/>);
 expect(view.container.querySelector('[data-bar-object-glow]')).toBeNull();
});
