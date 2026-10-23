import {act, renderHook} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {useBarLighting} from './barLighting.js';

afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals();});
it('decodes only the new map panorama before switching the lighting phase',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,23,17,59,59));
 let complete:()=>void=()=>{};
 const paths:string[]=[];
 vi.stubGlobal('Image',class {
  src='';
  decode(){paths.push(this.src);return new Promise<void>(resolve=>{complete=resolve;});}
 });
 const hook=renderHook(()=>useBarLighting('map'));
 await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
 expect(paths).toEqual(['/bar/map-v41/sunset-v1.webp']);
 expect(hook.result.current.phase).toBe('day');
 await act(async()=>{complete();});
 expect(hook.result.current).toEqual({phase:'sunset',previous:'day'});
 hook.unmount();
});
it('keeps loaded artwork until the floor and all new wall sections decode and ignores stale phase loads', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 16, 9, 59, 59));
  const loads: {src: string; resolve: () => void; reject: () => void}[] = [];
  vi.stubGlobal('Image', class {
    src = '';
    decode() {return new Promise<void>((resolve, reject) => loads.push({src: this.src, resolve, reject}));}
  });
  const hook = renderHook(() => useBarLighting('interior'));
  expect(hook.result.current.phase).toBe('morning');
  await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
  expect(loads).toHaveLength(3);
  await act(async () => {loads[1]!.resolve(); loads[2]!.resolve();});
  expect(hook.result.current.phase).toBe('morning');
  vi.setSystemTime(new Date(2026, 9, 16, 18));
  await act(async () => {window.dispatchEvent(new Event('focus'));});
  expect(loads).toHaveLength(6);
  await act(async () => {loads.slice(0,3).forEach(load => load.resolve());});
  expect(hook.result.current.phase).toBe('morning');
  await act(async () => {loads.slice(3).forEach(load => load.resolve());});
  expect(hook.result.current.phase).toBe('sunset');
  expect(hook.result.current.previous).toBe('morning');
  hook.unmount();
});
it('keeps the last good phase on failure and retries only requested artwork', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 16, 19, 29, 59));
  const decode = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
  vi.stubGlobal('Image', class {src = ''; decode = decode;});
  const hook = renderHook(() => useBarLighting('blocked'));
  await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
  expect(hook.result.current.phase).toBe('sunset');
  await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
  expect(hook.result.current.phase).toBe('night');
  expect(decode).toHaveBeenCalledTimes(2);
  hook.unmount();
});
