import {useState} from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {createDefaultBarLayout} from '@hockey/game-core';
import {expect, it, vi} from 'vitest';
import {BarScene} from './BarScene.js';
function setup(initial='bar-3') {
 const action=vi.fn(),incident=vi.fn(),select=vi.fn();
 function Scene(){const [slot,setSlot]=useState(initial);return <BarScene layout={createDefaultBarLayout()} activeSlotId={slot} onSelectSlot={id=>{select(id);setSlot(id);}} onAction={action} onPhysicalIncident={incident}/>;}
 const view=render(<Scene/>);
 const viewport=screen.getByLabelText('Панорама бара');
 Object.defineProperty(viewport,'clientWidth',{configurable:true,value:390});
 Object.defineProperty(view.container.querySelector('.bar-space__track'),'clientWidth',{configurable:true,value:3900});
 const scroll=vi.fn();viewport.scrollTo=scroll;
 viewport.scrollLeft=(Number(initial.split('-')[1])-1)*390;
 return {...view,viewport,scroll,action,incident,select};
}
function pointer(target:Element,type:string,x:number){const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:200});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'},isPrimary:{value:true}});fireEvent(target,event);}
it('recenters an off-center character before counting taps for an incident',()=>{
 const {container,viewport,scroll,incident}=setup();viewport.scrollLeft=700;
 const hit=container.querySelector('[data-bar-character="maria"]')!;
 for(let i=0;i<3;i++){pointer(hit,'pointerdown',150);pointer(hit,'pointerup',150);fireEvent.click(hit,{detail:1});}
 expect(scroll).toHaveBeenCalledWith({left:780,behavior:'smooth'});expect(incident).not.toHaveBeenCalled();
 viewport.scrollLeft=780;
 for(let i=0;i<3;i++){pointer(hit,'pointerdown',150);pointer(hit,'pointerup',150);}
 expect(incident).toHaveBeenCalledOnce();
});
it('drags the panorama continuously through a game hotspot without switching pages or starting a game',()=>{
 const {viewport,select,action}=setup('bar-1');viewport.scrollLeft=100;
 const hit=screen.getByRole('button',{name:'Играть в дартс с Дарьей'});
 pointer(hit,'pointerdown',200);pointer(hit,'pointermove',140);pointer(hit,'pointerup',140);fireEvent.click(hit,{detail:1});
 expect(viewport.scrollLeft).toBe(160);expect(select).not.toHaveBeenCalled();expect(action).not.toHaveBeenCalled();
});
it('centers a game object on the first click, then opens its original game',()=>{
 const {viewport,action,scroll}=setup('bar-1');viewport.scrollLeft=85;
 const hit=screen.getByRole('button',{name:'Играть в дартс с Дарьей'});
 fireEvent.click(hit,{detail:1});expect(scroll).toHaveBeenCalledWith({left:0,behavior:'smooth'});expect(action).not.toHaveBeenCalled();
 viewport.scrollLeft=0;fireEvent.click(hit,{detail:1});expect(action).toHaveBeenCalledWith('darts','daria');
});
it('recenters even the already selected circle without opening anything',()=>{
 const {viewport,scroll,action}=setup();viewport.scrollLeft=700;
 fireEvent.click(screen.getByRole('button',{name:'Мария'}));
 expect(scroll).toHaveBeenCalledWith({left:780,behavior:'smooth'});expect(action).not.toHaveBeenCalled();
});
it('moves the terminal with its page and centers it before opening',()=>{
 const {viewport,scroll}=setup('bar-5');viewport.scrollLeft=1450;
 fireEvent.click(screen.getByRole('button',{name:'Открыть терминал'}));
 expect(scroll).toHaveBeenCalledWith({left:1560,behavior:'smooth'});
 expect(screen.queryByRole('button',{name:'Закрыть терминал'})).not.toBeInTheDocument();
});
it('cancels a hold when native scrolling starts and still allows keyboard actions after a drag',()=>{
 vi.useFakeTimers();
 try {
  const {container,viewport,incident,action}=setup('bar-1');
  const hit=container.querySelector('[data-bar-character="daria"]')!;
  pointer(hit,'pointerdown',150);fireEvent.scroll(viewport);vi.advanceTimersByTime(2100);
  expect(incident).not.toHaveBeenCalled();
  pointer(hit,'pointermove',80);pointer(hit,'pointerup',80);viewport.scrollLeft=0;
  fireEvent.click(screen.getByRole('button',{name:'Играть в дартс с Дарьей'}),{detail:0});
  expect(action).toHaveBeenCalledWith('darts','daria');
 } finally {vi.useRealTimers();}
});
