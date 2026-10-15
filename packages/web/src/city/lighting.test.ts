import {act, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cityImage, cityTimeOfDay, useCityImage} from './lighting.js';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('device-local city lighting',()=>{
 for(const [hour,minute,expected] of [[5,59,'night'],[6,0,'morning'],[9,59,'morning'],[10,0,'day'],[17,59,'day'],[18,0,'sunset'],[20,59,'sunset'],[21,0,'night'],[23,59,'night']] as const){
  it(`${hour}:${minute} is ${expected}`,()=>expect(cityTimeOfDay(new Date(2026,9,15,hour,minute))).toBe(expected));
 }
 it('uses device local hours rather than UTC hours',()=>{
  const date=new Date();vi.spyOn(date,'getHours').mockReturnValue(10);
  expect(cityTimeOfDay(date)).toBe('day');
 });
});

it('uses the approved shared background for all four lighting phases',()=>{
 for(const dpr of [1,2,3]){
  const sources=[7,12,19,23].map(hour=>cityImage(new Date(2026,9,16,hour),dpr));
  expect(new Set(sources).size).toBe(1);
  expect(sources[0]).toContain('city-approved-');
 }
 expect(cityImage(new Date(),1)).toContain('4096-');
 expect(cityImage(new Date(),2)).toContain('6144-');
});

it('does not load the same panorama again when lighting phases change',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,16,5,59,59));
 const decode=vi.fn(()=>Promise.resolve());
 vi.stubGlobal('Image',class{src='';decode=decode;});
 const {result,unmount}=renderHook(()=>useCityImage());
 const source=result.current;
 await act(async()=>{vi.advanceTimersByTime(1000);});
 for(const hour of [10,18,21]){
  await act(async()=>{vi.setSystemTime(new Date(2026,9,16,hour));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  expect(result.current).toBe(source);
 }
 expect(decode).not.toHaveBeenCalled();
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
