import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createDefaultBarLayout, moveBarOccupant } from '@hockey/game-core';
import { MemoryRouter } from 'react-router-dom';
import { BarScene } from './BarScene.js';
function pointer(target:Element,type:string,x:number){const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:200});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'}});fireEvent(target,event);}
it('navigates by avatar click and suppresses clicks after dragging the dock', () => {
 const select=vi.fn();render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-3" onSelectSlot={select} onAction={vi.fn()}/>);
 const avatar=screen.getByRole('button',{name:'Арсенич'}),nav=screen.getByRole('navigation',{name:'Места в баре'});
 fireEvent.click(avatar,{detail:1});expect(select).toHaveBeenCalledWith('bar-4');select.mockClear();
 pointer(nav,'pointerdown',10);pointer(nav,'pointermove',80);pointer(nav,'pointerup',80);fireEvent.click(avatar,{detail:1});expect(select).not.toHaveBeenCalled();
});
it('hides the dock during conversation',()=>{
 render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-3" hideIdentity onSelectSlot={vi.fn()} onAction={vi.fn()}/>);
 expect(screen.queryByRole('navigation',{name:'Места в баре'})).not.toBeInTheDocument();
});
it('opens terminal controls only on request and can close them',()=>{
 render(<MemoryRouter><BarScene layout={createDefaultBarLayout()} activeSlotId="bar-5" onSelectSlot={vi.fn()} onAction={vi.fn()}/></MemoryRouter>);
 expect(screen.queryByText('Начать поиск')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Открыть терминал'}));
 expect(screen.getByRole('button',{name:'Закрыть терминал'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Закрыть терминал'}).closest('section')?.parentElement?.classList.contains('bar-space')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Закрыть терминал'}));
 expect(screen.queryByText('Начать поиск')).not.toBeInTheDocument();
});
it('renders identity, safe actions and stable navigation', () => {
  const layout = createDefaultBarLayout();
  const select = vi.fn(),
    action = vi.fn();
  const view = render(
    <BarScene layout={layout} activeSlotId="bar-3" onSelectSlot={select} onAction={action} />,
  );
  expect(screen.getByRole('heading', { name: 'Мария' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Игры' }));
  expect(action).toHaveBeenCalledWith('cards', 'maria');
  fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
  expect(select).toHaveBeenCalledWith('bar-4');
  expect(screen.queryByRole('button', { name: 'Разговор' })).not.toBeInTheDocument();
  const moved = moveBarOccupant(layout, 'bar-6', 'maria');
  view.rerender(
    <BarScene layout={moved} activeSlotId="bar-6" onSelectSlot={select} onAction={action} />,
  );
  expect(screen.getByRole('heading', { name: 'Мария' })).toBeInTheDocument();
});
it('shows Veronika with conversation and her assigned game', () => {
  render(
    <BarScene
      layout={createDefaultBarLayout()}
      activeSlotId="bar-8"
      onSelectSlot={vi.fn()}
      onAction={vi.fn()}
      onTalk={vi.fn()}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Вероника' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Разговор' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Игры' })).toBeInTheDocument();
});

it('shows a silhouette and no interactions for an empty place', () => {
  const layout = createDefaultBarLayout();
  layout.slots[7]!.occupantId = null;
  const { container } = render(<BarScene layout={layout} activeSlotId="bar-8"
    onSelectSlot={vi.fn()} onAction={vi.fn()} onTalk={vi.fn()} />);
  expect(screen.getByText('Персонаж в разработке')).toBeInTheDocument();
  expect(container.querySelectorAll('.bar-space__silhouette')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Разговор' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Игры' })).not.toBeInTheDocument();
});

it('never loads remote or invalid paths from an unsaved admin draft', () => {
  const layout = createDefaultBarLayout();
  layout.profiles.maria.avatar = 'https://example.com/avatar.png';
  layout.profiles.maria.composition = '/bar/../secret.png';
  const { container } = render(
    <BarScene
      layout={layout}
      activeSlotId="bar-3"
      onSelectSlot={vi.fn()}
      onAction={vi.fn()}
      preview
    />,
  );
  expect(container.querySelector('img[src="https://example.com/avatar.png"]')).toBeNull();
  expect(container.querySelector('img[src="/bar/../secret.png"]')).toBeNull();
});

it('navigates when clicking a marker with its preview already open', () => {
  const select = vi.fn();
  render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-3" onSelectSlot={select} onAction={vi.fn()} />);
  const marker = screen.getByRole('button', { name: /^Григорий$/ });
  fireEvent.focus(marker);
  fireEvent.click(marker);
  expect(select).toHaveBeenCalledWith('bar-2');
});
it('detects character taps, ignores background and cancels a drag', () => {
 const incident=vi.fn(),select=vi.fn();
 const {container,rerender}=render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-3" onSelectSlot={select} onAction={vi.fn()} onPhysicalIncident={incident}/>);
 const main=container.querySelector('.bar-space__viewport')!,hit=container.querySelector('[data-bar-character="maria"]')!;
 const pointer=(target:Element,type:string,x=0)=>{const event=new MouseEvent(type,{bubbles:true,clientX:x});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'}});fireEvent(target,event);};
 pointer(hit,'pointerdown');pointer(main,'pointerup');pointer(hit,'pointerdown');pointer(main,'pointermove',60);pointer(main,'pointerup',60);
 expect(incident).not.toHaveBeenCalled();expect(select).not.toHaveBeenCalled();
 for(let i=0;i<3;i++){pointer(main,'pointerdown');pointer(main,'pointerup');}expect(incident).not.toHaveBeenCalled();
 for(let i=0;i<3;i++){pointer(hit,'pointerdown');pointer(main,'pointerup');}expect(incident).toHaveBeenCalledWith('maria');expect(incident).toHaveBeenCalledTimes(1);
 rerender(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-3" hideIdentity onSelectSlot={select} onAction={vi.fn()} onPhysicalIncident={incident}/>);
 expect(container.querySelector('[data-bar-character]')).toBeNull();
});
