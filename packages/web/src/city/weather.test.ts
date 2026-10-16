import {act,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useWeatherCycle} from './weather.js';
const hour=3_600_000;
const random=()=>0;
beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date(2026,0,1,6));vi.spyOn(document,'hidden','get').mockReturnValue(false);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('starts clear for a full day, then turns overcast',()=>{
 const {result,unmount}=renderHook(()=>useWeatherCycle(random));
 act(()=>vi.advanceTimersByTime(24*hour-1));expect(result.current.weather).toBe('clear');
 act(()=>vi.advanceTimersByTime(1));expect(result.current.weather).toBe('overcast');unmount();
});
it('restores the same weather and deadline across visits',()=>{
 const first=renderHook(()=>useWeatherCycle(random));
 act(()=>vi.advanceTimersByTime(23*hour));first.unmount();
 const second=renderHook(()=>useWeatherCycle(random));expect(second.result.current.weather).toBe('clear');
 act(()=>vi.advanceTimersByTime(hour));expect(second.result.current.weather).toBe('overcast');second.unmount();
});
it('runs blizzard only after snow, five days after initial visit, for three hours',()=>{
 const {result,unmount}=renderHook(()=>useWeatherCycle(random));
 act(()=>vi.advanceTimersByTime(5*24*hour-6*hour));expect(result.current.weather).toBe('snow');
 act(()=>vi.advanceTimersByTime(6*hour));expect(result.current.weather).toBe('blizzard');
 act(()=>vi.advanceTimersByTime(3*hour));expect(result.current.weather).toBe('overcast');
 act(()=>vi.advanceTimersByTime(5*24*hour-3*hour));expect(result.current.weather).toBe('blizzard');unmount();
});
it('catches up elapsed real time when returning from a hidden tab',()=>{
 const hidden=vi.spyOn(document,'hidden','get');const {result,unmount}=renderHook(()=>useWeatherCycle(random));
 act(()=>{hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));});
 vi.setSystemTime(Date.now()+24*hour);
 act(()=>{hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));});
 expect(result.current.weather).toBe('overcast');unmount();expect(vi.getTimerCount()).toBe(0);
});
it('manual previews do not overwrite the saved automatic schedule',()=>{
 const {result,unmount}=renderHook(()=>useWeatherCycle(random));
 act(()=>result.current.selectWeather('fog'));expect(result.current.weather).toBe('fog');
 act(()=>vi.advanceTimersByTime(24*hour));expect(result.current.weather).toBe('fog');
 act(()=>result.current.startAutomatic());expect(result.current.weather).toBe('overcast');unmount();
});
it('recovers from invalid storage',()=>{
 localStorage.setItem('city-weather-v1','{"weather":"broken"}');
 const {result,unmount}=renderHook(()=>useWeatherCycle(random));expect(result.current.weather).toBe('clear');unmount();
});
it('also supports the upper limit of ten days and eight hours',()=>{
 const high=()=>1;const {result,unmount}=renderHook(()=>useWeatherCycle(high));
 act(()=>vi.advanceTimersByTime(10*24*hour-1));expect(result.current.weather).toBe('snow');
 act(()=>vi.advanceTimersByTime(1));expect(result.current.weather).toBe('blizzard');
 act(()=>vi.advanceTimersByTime(8*hour-1));expect(result.current.weather).toBe('blizzard');
 act(()=>vi.advanceTimersByTime(1));expect(result.current.weather).toBe('overcast');unmount();
});
it('continues after a long absence without replaying timers',()=>{
 const first=renderHook(()=>useWeatherCycle(random));first.unmount();
 vi.setSystemTime(Date.now()+40*24*hour);
 const second=renderHook(()=>useWeatherCycle(random));expect(weatherKindsForTest.includes(second.result.current.weather)).toBe(true);second.unmount();expect(vi.getTimerCount()).toBe(0);
});
const weatherKindsForTest=['clear','snow','blizzard','fog','overcast'];
