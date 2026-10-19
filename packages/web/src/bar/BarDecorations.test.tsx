import {fireEvent, render, screen} from '@testing-library/react';
import {createDefaultBarLayout, moveBarOccupant} from '@hockey/game-core';
import {expect, it, vi} from 'vitest';
import {BarScene} from './BarScene.js';
function pointer(target:Element,type:string,x:number){const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:200});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'}});fireEvent(target,event);}
it('opens the visitor shop from Igor club cards and ignores a drag across them', () => {
  const shop = vi.fn(), action = vi.fn();
  render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-9" onSelectSlot={vi.fn()} onAction={action} onVisitorShop={shop}/>);
  const cards = screen.getByRole('button', {name: 'Клубные карты'});
  fireEvent.click(cards);
  expect(shop).toHaveBeenCalledTimes(1);
  expect(action).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', {name: 'Карта и сообщения'})).not.toBeInTheDocument();
  shop.mockClear();
  pointer(cards, 'pointerdown', 200);
  pointer(cards, 'pointermove', 300);
  pointer(cards, 'pointerup', 300);
  fireEvent.click(cards, {detail: 1});
  expect(shop).not.toHaveBeenCalled();
});
it('keeps architectural doors in the panorama when Veronika moves', () => {
  const layout = moveBarOccupant(createDefaultBarLayout(), 'bar-2', 'veronika');
  const view = render(<BarScene layout={layout} activeSlotId="bar-2" onSelectSlot={vi.fn()} onAction={vi.fn()}/>);
  expect(view.container.querySelector('[data-bar-backdrop="veronika"]')).toBeNull();
  expect(view.container.querySelector('[data-bar-wall="west"] img')?.getAttribute('src')).toMatch(/west-.*-v2.webp$/);
  expect(view.container.querySelector('[data-bar-decoration="veronika"]')).toBeNull();
});
it('keeps the eastern panorama framing fixed between Igor and broadcasts', () => {
  const layout = createDefaultBarLayout();
  const props = {layout, onSelectSlot: vi.fn(), onAction: vi.fn()};
  const view = render(<BarScene {...props} activeSlotId="bar-9"/>);
  const before = (view.container.querySelector('[data-bar-wall="hall"] img') as HTMLElement).style.objectPosition;
  view.rerender(<BarScene {...props} activeSlotId="bar-10"/>);
  expect((view.container.querySelector('[data-bar-wall="hall"] img') as HTMLElement).style.objectPosition).toBe(before);
});

it('uses baked background details and centers the office doorway before entering', () => {
  const layout = moveBarOccupant(createDefaultBarLayout(), 'bar-6', 'maria');
  const open = vi.fn();
  const view = render(<BarScene layout={layout} activeSlotId="bar-6" onSelectSlot={vi.fn()} onAction={vi.fn()} onStaffRoom={open}/>);
  expect(view.container.querySelector('[data-bar-decoration]')).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Открыть служебную дверь'}));
  expect(open).not.toHaveBeenCalled();
  view.rerender(<BarScene layout={layout} activeSlotId="bar-9" onSelectSlot={vi.fn()} onAction={vi.fn()} onStaffRoom={open}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Открыть служебную дверь'}));
  expect(open).toHaveBeenCalledWith('bar-9');
});
it('drags across the service door without opening it or selecting a page', () => {
  const layout = createDefaultBarLayout();
  const open = vi.fn(), select = vi.fn();
  render(<BarScene layout={layout} activeSlotId="bar-10" onSelectSlot={select} onAction={vi.fn()} onStaffRoom={open}/>);
  const door = screen.getByRole('button', {name: 'Открыть служебную дверь'});
  pointer(door,'pointerdown',200);
  pointer(door,'pointermove',300);
  pointer(door,'pointerup',300);
  fireEvent.click(door,{detail:1});
  expect(open).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});

it('opens each centered background game with its own character and ignores a drag', () => {
  const action = vi.fn();
  const layout=createDefaultBarLayout();
  const view=render(<BarScene layout={layout} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={action}/>);
  for (const [name, kind, character] of [['Играть в дартс с Дарьей','darts','daria'],['Играть в очко с Григорием','ochko','grigory'],['Играть в карты с Марией','cards','maria'],['Играть в шашки с Арсеничем','checkers','arsenich'],['Играть в бильярд с Вероникой','billiards','veronika']] as const) {
    view.rerender(<BarScene layout={layout} activeSlotId={layout.slots.find(s=>s.occupantId===character)!.id} onSelectSlot={vi.fn()} onAction={action}/>);
    fireEvent.click(screen.getByRole('button', {name}));
    expect(action).toHaveBeenLastCalledWith(kind, character);
  }
  action.mockClear();
  view.rerender(<BarScene layout={layout} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={action}/>);
  const hit = screen.getByRole('button', {name:'Играть в дартс с Дарьей'});
  pointer(hit,'pointerdown',100);pointer(hit,'pointermove',180);pointer(hit,'pointerup',180);
  fireEvent.click(hit,{detail:1});
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

it('keeps object hints available across selections and never highlights the hidden door',()=>{
 const props={layout:createDefaultBarLayout(),onSelectSlot:vi.fn(),onAction:vi.fn()};
 const view=render(<BarScene {...props} activeSlotId="bar-1"/>);
 expect(view.container.querySelector('[data-bar-object-glow="daria"]')).not.toBeNull();
 expect(view.container.querySelectorAll('[data-bar-object-glow]')).toHaveLength(11);
 view.rerender(<BarScene {...props} activeSlotId="bar-9"/>);
 expect(view.container.querySelector('[data-bar-object-glow="igor"]')).not.toBeNull();
 view.rerender(<BarScene {...props} activeSlotId="bar-10"/>);
 expect(view.container.querySelectorAll('[data-bar-object-glow]')).toHaveLength(11);
 expect(view.container.querySelector('.bar-space__service-door-hit [data-bar-object-glow]')).toBeNull();
});
it('opens armwrestling from Oleg bicep without triggering the character incident',()=>{
 const action=vi.fn(),incident=vi.fn();
 const {container}=render(<BarScene layout={createDefaultBarLayout()} activeSlotId={createDefaultBarLayout().slots.find(s=>s.occupantId==='oleg')!.id} onSelectSlot={vi.fn()} onAction={action} onPhysicalIncident={incident}/>);
 const button=screen.getByRole('button',{name:'Играть в армрестлинг с Олегом'});
 expect(container.querySelector('[data-bar-object-glow="oleg"]')).not.toBeNull();
 fireEvent.pointerDown(button,{pointerId:1,clientX:150,clientY:200});
 fireEvent.pointerUp(button,{pointerId:1,clientX:150,clientY:200});
 fireEvent.click(button);
 expect(action).toHaveBeenCalledWith('armwrestling','oleg');expect(incident).not.toHaveBeenCalled();
 expect(container.querySelector('[data-bar-character="oleg"]')).not.toBeNull();
});

it('keeps an exit to the map before every bar character circle',()=>{
 render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={vi.fn()}/>);
 const navigation=screen.getByRole('navigation',{name:'Места в баре'});
 const exit=screen.getByRole('link',{name:'На карту'});
 expect(exit).toHaveAttribute('href','/sections');
 expect(navigation.firstElementChild).toBe(exit);
 expect(exit).toHaveTextContent('Выход');
});

it('opens the office from Igor next to the TV without highlighting its door', () => {
 const open=vi.fn();
 const {container}=render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-9" onSelectSlot={vi.fn()} onAction={vi.fn()} onStaffRoom={open}/>);
 fireEvent.click(screen.getByRole('button',{name:'Открыть служебную дверь'}));
 expect(open).toHaveBeenCalledWith('bar-9');
 expect(container.querySelector('.bar-space__service-door-hit [data-bar-object-glow]')).toBeNull();
});
