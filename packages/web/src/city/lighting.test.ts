import {describe,it,expect} from 'vitest';
import {cityTimeOfDay} from './lighting.js';
describe('device-local city lighting',()=>{
 for(const [hour,minute,expected] of [[5,59,'night'],[6,0,'morning'],[9,59,'morning'],[10,0,'day'],[17,59,'day'],[18,0,'sunset'],[20,59,'sunset'],[21,0,'night'],[23,59,'night']] as const){
  it(`${hour}:${minute} is ${expected}`,()=>expect(cityTimeOfDay(new Date(2026,9,15,hour,minute))).toBe(expected));
 }
});

import {act, renderHook} from '@testing-library/react';
import {afterEach, vi} from 'vitest';
import {useCityImage} from './lighting.js';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('waits for decode, ignores stale completions, retries failures and cleans up', async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,15,9,59,59));
 const pending: {resolve:()=>void; reject:()=>void}[]=[];
 vi.stubGlobal('Image',class{src='';decode(){return new Promise<void>((resolve,reject)=>pending.push({resolve,reject}));}});
 const {result,unmount}=renderHook(()=>useCityImage());
 expect(result.current).toContain('morning');
 act(()=>{vi.advanceTimersByTime(1000);});
 expect(result.current).toContain('morning');
 act(()=>{vi.setSystemTime(new Date(2026,9,15,18));window.dispatchEvent(new Event('focus'));});
 await act(async()=>pending[0]!.resolve());
 expect(result.current).toContain('morning');
 await act(async()=>pending[1]!.reject());
 act(()=>{vi.advanceTimersByTime(1000);});
 await act(async()=>pending[2]!.resolve());
 expect(result.current).toContain('/maps/city-');
 unmount();expect(vi.getTimerCount()).toBe(0);
});
it('uses device local hours rather than UTC hours',()=>{
 const date=new Date();vi.spyOn(date,'getHours').mockReturnValue(10);
 expect(cityTimeOfDay(date)).toBe('day');
});

it('switches at 10 and reconciles local time on foreground return',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,15,9,59,59));
 vi.stubGlobal('Image',class{src='';decode(){return Promise.resolve();}});
 const {result}=renderHook(()=>useCityImage());
 await act(async()=>{vi.advanceTimersByTime(1000);});
 expect(result.current).toContain('city-day-');
 await act(async()=>{vi.setSystemTime(new Date(2026,9,16,6));document.dispatchEvent(new Event('visibilitychange'));});
 expect(result.current).toContain('city-morning-');
});

it('loads sunset at 18, night at 21 and morning at 6 without remounting',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,15,17,59,59));
 vi.stubGlobal('Image',class{src='';decode(){return Promise.resolve();}});
 const {result}=renderHook(()=>useCityImage());
 expect(result.current).toContain('city-day-');
 await act(async()=>{vi.advanceTimersByTime(1000);});
 expect(result.current).toContain('city-sunset-');
 await act(async()=>{vi.setSystemTime(new Date(2026,9,15,21));window.dispatchEvent(new Event('pageshow'));});
 expect(result.current).toContain('city-night-');
 await act(async()=>{vi.setSystemTime(new Date(2026,9,16,6));window.dispatchEvent(new Event('focus'));});
 expect(result.current).toContain('city-morning-');
});
