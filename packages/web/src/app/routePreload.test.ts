import {afterEach, expect, it, vi} from 'vitest';
import {scheduleRoutePreload} from './routePreload.js';
afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals();});
it('warms routes in sequence after startup and stops on unmount', async () => {
 vi.useFakeTimers();
 let finish!: () => void;
 const first=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const second=vi.fn(async()=>undefined);
 const stop=scheduleRoutePreload([first,second]);
 expect(first).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1500);
 expect(first).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(5000);
 expect(second).not.toHaveBeenCalled();
 await finish();
 stop();
 await vi.runAllTimersAsync();
 expect(second).not.toHaveBeenCalled();
});
it('continues after a failed preload so navigation can retry normally', async () => {
 vi.useFakeTimers();
 const next=vi.fn(async()=>undefined);
 scheduleRoutePreload([async()=>{throw new Error('offline');},next]);
 await vi.runAllTimersAsync();
 expect(next).toHaveBeenCalledOnce();
});
it('does not spend data on a metered or slow connection', async () => {
 vi.useFakeTimers();
 vi.stubGlobal('navigator',{connection:{saveData:true}});
 const load=vi.fn(async()=>undefined);
 scheduleRoutePreload([load]);
 await vi.runAllTimersAsync();
 expect(load).not.toHaveBeenCalled();
});
it('cancels before the first route starts', async () => {
 vi.useFakeTimers();
 const load=vi.fn(async()=>undefined);
 const stop=scheduleRoutePreload([load]); stop();
 await vi.runAllTimersAsync();
 expect(load).not.toHaveBeenCalled();
});

it('pauses while hidden and resumes without concurrent imports', async () => {
 vi.useFakeTimers();
 const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
 const load=vi.fn(async()=>undefined);
 const stop=scheduleRoutePreload([load]);
 await vi.advanceTimersByTimeAsync(3000);
 expect(load).not.toHaveBeenCalled();
 visibility.mockReturnValue('visible');
 await vi.advanceTimersByTimeAsync(1500);
 expect(load).toHaveBeenCalledOnce();
 stop(); visibility.mockRestore();
});
it('skips speculative imports on a 2g network', async () => {
 vi.useFakeTimers(); vi.stubGlobal('navigator',{connection:{effectiveType:'2g'}});
 const load=vi.fn(async()=>undefined); scheduleRoutePreload([load]);
 await vi.runAllTimersAsync(); expect(load).not.toHaveBeenCalled();
});
