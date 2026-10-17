import {act,fireEvent,renderHook,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useCaretakerVisit,CityCaretaker} from './CityCaretaker.js';
import {caretakerDay} from './caretakerSchedule.js';
afterEach(()=>{localStorage.clear();vi.useRealTimers();});
it('persists an interrupted visit and does not resume it after a game or page return',()=>{
 vi.useFakeTimers();const now=new Date(2026,9,17,12).getTime();vi.setSystemTime(now);
 localStorage.setItem('city-caretaker-v1:player',JSON.stringify({day:caretakerDay(now),visits:[{start:now-1000,end:now+180000,kind:'scrape'}]}));
 const hook=renderHook(({blocked})=>useCaretakerVisit('player',blocked),{initialProps:{blocked:false}});
 expect(hook.result.current).toBe('scrape');hook.rerender({blocked:true});expect(hook.result.current).toBeNull();
 hook.rerender({blocked:false});expect(hook.result.current).toBeNull();hook.unmount();
 const restored=renderHook(()=>useCaretakerVisit('player',false));expect(restored.result.current).toBeNull();
 act(()=>vi.advanceTimersByTime(200000));expect(restored.result.current).toBeNull();
});
it('uses both existing caretaker sprites and never intercepts map gestures',()=>{
 const view=render(<CityCaretaker kind="flood" venue="yard"/>);
 expect(screen.getByRole('img',{name:'Григорий заливает лёд'}).querySelector('svg')).toBeNull();
 expect(screen.getByRole('img',{name:'Григорий заливает лёд'}).querySelector('img')).toHaveAttribute('src','/sprites/city-grigory-flood-long-v4.webp');
 view.rerender(<CityCaretaker kind="scrape" venue="yard"/>);
 expect(screen.getByRole('img',{name:'Григорий чистит снег'}).querySelector('img')).toHaveAttribute('src','/sprites/rink-caretaker-scrape.webp');
});

it('keeps the hose outside the viewport after the map scrolls to its left edge',()=>{
 let imageLeft=150;
 const rect=(left:number)=>({left,right:left+400,top:0,bottom:100,x:left,y:0,width:400,height:100,toJSON:()=>({})}) as DOMRect;
 const natural=vi.spyOn(HTMLImageElement.prototype,'naturalWidth','get').mockReturnValue(1536);
 const bounds=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
  if(this instanceof HTMLImageElement){const shift=parseFloat(this.closest('.city-caretaker')?.getAttribute('style')?.match(/--caretaker-edge-shift:\s*([-\d.]+)/)?.[1]??'0');return rect(imageLeft+shift);}
  return rect(100);
 });
 try{
  render(<div data-testid="viewport"><div><CityCaretaker kind="flood" venue="yard"/></div></div>);
  const image=screen.getByRole('img',{name:'Григорий заливает лёд'}).querySelector('img')!;
  expect(image.getBoundingClientRect().left).toBeLessThanOrEqual(80);
  imageLeft=250;fireEvent.scroll(screen.getByTestId('viewport'));
  expect(image.getBoundingClientRect().left).toBeLessThanOrEqual(80);
 }finally{bounds.mockRestore();natural.mockRestore();}
});

it('keeps an expired visit on the mounted map but hides it after leaving and returning',()=>{
 vi.useFakeTimers();const now=new Date(2026,9,17,12).getTime();vi.setSystemTime(now);
 localStorage.setItem('city-caretaker-v1:player',JSON.stringify({day:caretakerDay(now),visits:[{start:now-1000,end:now+180000,kind:'flood'}]}));
 const hook=renderHook(()=>useCaretakerVisit('player',false));expect(hook.result.current).toBe('flood');
 act(()=>vi.advanceTimersByTime(300000));expect(hook.result.current).toBe('flood');
 act(()=>window.dispatchEvent(new Event('focus')));expect(hook.result.current).toBe('flood');
 hook.unmount();const returned=renderHook(()=>useCaretakerVisit('player',false));expect(returned.result.current).toBeNull();
});
it('still hides a retained expired visit immediately when training begins',()=>{
 vi.useFakeTimers();const now=new Date(2026,9,17,12).getTime();vi.setSystemTime(now);
 localStorage.setItem('city-caretaker-v1:player',JSON.stringify({day:caretakerDay(now),visits:[{start:now-1000,end:now+180000,kind:'flood'}]}));
 const hook=renderHook(({blocked})=>useCaretakerVisit('player',blocked),{initialProps:{blocked:false}});
 act(()=>vi.advanceTimersByTime(300000));expect(hook.result.current).toBe('flood');
 hook.rerender({blocked:true});expect(hook.result.current).toBeNull();hook.rerender({blocked:false});expect(hook.result.current).toBeNull();
});
it('adds animated water only to flooding',()=>{
 const view=render(<CityCaretaker kind="flood" venue="yard"/>);expect(screen.getByTestId('caretaker-water')).toBeInTheDocument();
 view.rerender(<CityCaretaker kind="scrape" venue="yard"/>);expect(screen.queryByTestId('caretaker-water')).not.toBeInTheDocument();
});
