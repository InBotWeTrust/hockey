import {act,renderHook,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useCityAccident} from './useCityAccident.js';
import {createAccident,nextAccidentAt} from './accident.js';
afterEach(()=>{localStorage.clear();vi.useRealTimers();vi.restoreAllMocks();});
it('does not start an accident over existing upper-lane traffic, then persists its 48-hour cooldown',()=>{
 vi.useFakeTimers();vi.setSystemTime(1000000);vi.spyOn(Math,'random').mockReturnValue(.3);
 localStorage.setItem('city-accident-v1:user',JSON.stringify({nextAt:999999,event:null}));
 const view=renderHook(({busy})=>useCityAccident('user',busy),{initialProps:{busy:true}});
 expect(view.result.current).toBeNull();view.rerender({busy:false});act(()=>vi.advanceTimersByTime(500));
 expect(view.result.current?.phase).toBe('approach');
 const saved=JSON.parse(localStorage.getItem('city-accident-v1:user')!);expect(saved.nextAt-saved.event.start).toBeGreaterThanOrEqual(48*3600000);
 view.unmount();act(()=>vi.advanceTimersByTime(3600000));
 const returned=renderHook(()=>useCityAccident('user',false));expect(returned.result.current).toBeNull();returned.unmount();expect(vi.getTimerCount()).toBe(0);
});
it('restores police waiting by real time and catches up when a hidden tab returns',()=>{
 vi.useFakeTimers();const event=createAccident(1000000,()=>.5);vi.setSystemTime(event.policeArrived+1000);
 localStorage.setItem('city-accident-v1:user',JSON.stringify({nextAt:nextAccidentAt(event),event}));
 const view=renderHook(()=>useCityAccident('user',false));expect(view.result.current?.phase).toBe('police-wait');
 act(()=>{vi.setSystemTime(event.end+1);fireEvent(document,new Event('visibilitychange'));});expect(view.result.current).toBeNull();view.unmount();
});
