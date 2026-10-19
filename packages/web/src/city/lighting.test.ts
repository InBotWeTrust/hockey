import {act, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cityImage, cityTimeOfDay, useCityImage} from './lighting.js';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('device-local city lighting',()=>{
 for(const [hour,minute,expected] of [[5,59,'night'],[6,0,'night'],[6,59,'night'],[7,0,'morning'],[9,59,'morning'],[10,0,'day'],[17,59,'day'],[18,0,'sunset'],[20,59,'sunset'],[21,0,'sunset'],[21,59,'sunset'],[22,0,'night'],[23,59,'night']] as const){
  it(`${hour}:${minute} is ${expected}`,()=>expect(cityTimeOfDay(new Date(2026,9,15,hour,minute))).toBe(expected));
 }
 it('uses device local hours rather than UTC hours',()=>{
  const date=new Date();vi.spyOn(date,'getHours').mockReturnValue(10);
  expect(cityTimeOfDay(date)).toBe('day');
 });
});

it('selects the matching distinct background for every phase and density',()=>{
 for(const dpr of [1,2,3]){
  const sources=[7,12,19,23].map(hour=>cityImage(new Date(2026,9,16,hour),dpr));
  expect(new Set(sources).size).toBe(4);
  for(const [i,phase] of ['morning','day','sunset','night'].entries())expect(sources[i]).toContain(`city-${phase}-`);
 }
 expect(cityImage(new Date(),1)).toContain('4096-');
 expect(cityImage(new Date(),2)).toContain('6144-');
});

it('changes phases only after decode and avoids loading again within a phase',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,16,6,59,59));
 const pending:(()=>void)[]=[];
 const decode=vi.fn(()=>new Promise<void>(resolve=>pending.push(resolve)));
 vi.stubGlobal('Image',class{src='';decode=decode;});
 const {result,unmount}=renderHook(()=>useCityImage());
 expect(result.current).toContain('city-night-');
 act(()=>{vi.advanceTimersByTime(1000);});
 expect(result.current).toContain('city-night-');
 await act(async()=>pending[0]!());
 expect(result.current).toContain('city-morning-');
 for(const [i,hour,phase] of [[1,10,'day'],[2,18,'sunset'],[3,22,'night']] as const){
  act(()=>{vi.setSystemTime(new Date(2026,9,16,hour));window.dispatchEvent(new Event('focus'));});
  await act(async()=>pending[i]!());
  expect(result.current).toContain(`city-${phase}-`);
  act(()=>{vi.advanceTimersByTime(1000);document.dispatchEvent(new Event('visibilitychange'));});
  expect(decode).toHaveBeenCalledTimes(i+1);
 }
 unmount();expect(vi.getTimerCount()).toBe(0);
});

it('decodes resolution changes, ignores stale completions and retries failures',async()=>{
 vi.useFakeTimers();
 const dpr=vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(1);
 const pending:{resolve:()=>void;reject:()=>void}[]=[];
 vi.stubGlobal('Image',class{src='';decode(){return new Promise<void>((resolve,reject)=>pending.push({resolve,reject}));}});
 const {result,unmount}=renderHook(()=>useCityImage());
 expect(result.current).toContain('4096-');
 act(()=>{dpr.mockReturnValue(2);window.dispatchEvent(new Event('focus'));});
 expect(result.current).toContain('4096-');
 act(()=>{dpr.mockReturnValue(1);window.dispatchEvent(new Event('pageshow'));});
 await act(async()=>pending[0]!.resolve());
 expect(result.current).toContain('4096-');
 await act(async()=>pending[1]!.reject());
 act(()=>{dpr.mockReturnValue(2);vi.advanceTimersByTime(1000);});
 await act(async()=>pending[2]!.reject());
 act(()=>{vi.advanceTimersByTime(1000);});
 await act(async()=>pending[3]!.resolve());
 expect(result.current).toContain('6144-');
 unmount();expect(vi.getTimerCount()).toBe(0);
});
