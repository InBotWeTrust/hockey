import {render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {createDefaultBarLayout} from '@hockey/game-core';
import {afterEach,expect,it,vi} from 'vitest';
import {BarMapScene} from './BarMapScene.js';
import {useState} from 'react';
const lighting=vi.hoisted(()=>({phase:'day' as 'day'|'night'|'morning'|'sunset',previous:null}));
vi.mock('./barLighting.js',()=>({useBarLighting:()=>lighting}));
afterEach(()=>{lighting.phase='day';});

it('preserves physical character interactions and cancels them during a pan',()=>{
 const layout=createDefaultBarLayout(),incident=vi.fn();
 const id=layout.slots.find(slot=>slot.occupantId==='grigory')!.id;
 const view=render(<MemoryRouter><BarMapScene layered layout={layout} activeSlotId={id} onSelectSlot={vi.fn()} onAction={vi.fn()} onPhysicalIncident={incident}/></MemoryRouter>);
 const hit=view.container.querySelector('[data-map-character="grigory"] [data-bar-character]')!;
 const pointer=(type:string,x=0)=>{
  const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:100});
  Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'}});fireEvent(hit,event);
 };
 for(let i=0;i<3;i++){pointer('pointerdown');pointer('pointermove',40);pointer('pointerup',40);}
 expect(incident).not.toHaveBeenCalled();
 view.container.querySelector<HTMLElement>('.bar-map-viewport')!.scrollLeft=0;
 for(let i=0;i<3;i++){pointer('pointerdown');pointer('pointerup');fireEvent.click(hit);}
 expect(incident).toHaveBeenCalledOnce();
 expect(incident).toHaveBeenCalledWith('grigory');
});

it.each(['morning','sunset','night'] as const)('uses the fresh %s panorama while preserving the game layers',phase=>{
 lighting.phase=phase;
 const view=render(<MemoryRouter><BarMapScene layered layout={createDefaultBarLayout()} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={vi.fn()}/></MemoryRouter>);
 expect(view.container.querySelector('[data-bar-map-background]')).toHaveAttribute('src',`/bar/map-v38/${phase}-v1.webp`);
 expect(view.container.querySelectorAll('[data-map-character]')).toHaveLength(8);
 expect(view.container.querySelectorAll('[data-map-prop]')).toHaveLength(5);
});


it('keeps avatar navigation smooth after the controlled selection updates',()=>{
 const layout=createDefaultBarLayout();
 function Controlled(){
  const [active,setActive]=useState(layout.slots.find(slot=>slot.occupantId==='oleg')!.id);
  return <MemoryRouter><BarMapScene layered layout={layout} activeSlotId={active} onSelectSlot={setActive} onAction={vi.fn()}/></MemoryRouter>;
 }
 const view=render(<Controlled/>);
 const viewport=view.container.querySelector<HTMLElement>('.bar-map-viewport')!;
 const scroll=vi.fn();viewport.scrollTo=scroll;
 fireEvent.click(screen.getByRole('button',{name:'Григорий'}));
 expect(scroll).toHaveBeenCalled();
 expect(scroll.mock.lastCall?.[0]).toMatchObject({behavior:'smooth'});
});

it('gives every interactive object a fixed pulse anchor with a separate expanding ring',()=>{
 const view=render(<MemoryRouter><BarMapScene layered layout={createDefaultBarLayout()} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={vi.fn()}/></MemoryRouter>);
 const targets=view.container.querySelectorAll('[data-map-target]');
 expect(targets).toHaveLength(11);
 for(const target of targets){
  const anchor=target.querySelector('.bar-map-pulse');
  expect(anchor,target.getAttribute('data-map-target')!).not.toBeNull();
  expect(anchor).toHaveAttribute('aria-hidden','true');
  expect(anchor!.querySelector(':scope > .bar-map-pulse__ring')).not.toBeNull();
 }
});

it('keeps independent game tables from intersecting in the panorama',()=>{
 const view=render(<MemoryRouter><BarMapScene layered layout={createDefaultBarLayout()} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={vi.fn()}/></MemoryRouter>);
 const tables=Array.from(view.container.querySelectorAll<HTMLElement>('[data-map-prop]')).map(el=>({
  id:el.dataset.mapProp!,left:parseFloat(el.style.left),top:parseFloat(el.style.top),width:parseFloat(el.style.width),height:parseFloat(el.style.height),
 }));
 for(let i=0;i<tables.length;i++)for(let j=i+1;j<tables.length;j++){
  const a=tables[i]!,b=tables[j]!;
  const overlapX=Math.min(a.left+a.width,b.left+b.width)-Math.max(a.left,b.left);
  const overlapY=Math.min(a.top+a.height,b.top+b.height)-Math.max(a.top,b.top);
  expect(overlapX>0&&overlapY>0,`${a.id} intersects ${b.id}`).toBe(false);
 }
});

it('places eight separate characters over one map without duplicating TV or terminal artwork',()=>{
 const view=render(<MemoryRouter><BarMapScene layout={createDefaultBarLayout()} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={vi.fn()}/></MemoryRouter>);
 expect(view.container.querySelectorAll('[data-map-character]')).toHaveLength(8);
 expect(view.container.querySelectorAll('[data-bar-map-background]')).toHaveLength(1);
 expect(view.container.querySelector('[data-map-character="broadcasts"]')).toBeNull();
 expect(view.container.querySelector('[data-map-character="online"]')).toBeNull();
 for(const name of ['Играть в карты с Марией','Играть в очко с Григорием','Играть в морской бой с Тимофеем','Играть в шашки с Арсеничем','Играть в дартс с Дарьей','Играть в бильярд с Вероникой'])expect(screen.getByRole('button',{name})).toBeInTheDocument();
});

it('selects the game owner first and invokes the existing action after selection',()=>{
 const layout=createDefaultBarLayout(),select=vi.fn(),action=vi.fn();
 const props={layout,activeSlotId:layout.slots.find(s=>s.occupantId==='oleg')!.id,onSelectSlot:select,onAction:action};
 const view=render(<MemoryRouter><BarMapScene {...props}/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'Играть в дартс с Дарьей'}));
 const id=layout.slots.find(s=>s.occupantId==='daria')!.id;
 expect(select).toHaveBeenCalledWith(id);expect(action).not.toHaveBeenCalled();
 view.rerender(<MemoryRouter><BarMapScene {...props} activeSlotId={id}/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'Играть в дартс с Дарьей'}));
 expect(action).toHaveBeenCalledWith('darts','daria');
});

it('renders layered neutral masters and five independent game tables without switching back to old emotional furniture',()=>{
 const view=render(<MemoryRouter><BarMapScene layered layout={createDefaultBarLayout()} activeSlotId="bar-1" characterEmotions={{timofey:'joy'}} onSelectSlot={vi.fn()} onAction={vi.fn()}/></MemoryRouter>);
 expect(view.container.querySelector('[data-bar-map-background]')).toHaveAttribute('src','/bar/map-v38/day-v1.webp');
 expect(view.container.querySelectorAll('[data-map-prop]')).toHaveLength(5);
 expect(view.container.querySelector('[data-map-character="arsenich"] img')).toHaveAttribute('src','/bar/map-v36/arsenich-neutral-v1.webp');
 for(const id of ['timofey','maria','grigory','daria'])expect(view.container.querySelector(`[data-map-character="${id}"] img`)).toHaveAttribute('src',`/bar/map-v30/${id}-neutral-v1.webp`);
});

it('occludes Igor with the complete counter sprite while keeping the dartboard inside the room art',()=>{
 const view=render(<MemoryRouter><BarMapScene layered layout={createDefaultBarLayout()} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={vi.fn()}/></MemoryRouter>);
 expect(view.container.querySelector('.bar-map-counter')).toHaveAttribute('src','/bar/map-v31/counter-v1.webp');
 expect(view.container.querySelector('[data-map-dartboard]')).toBeNull();
});
