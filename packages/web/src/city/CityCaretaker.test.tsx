import {act,renderHook,render,screen} from '@testing-library/react';
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
