import {act,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {BarReopeningCountdown} from './BarReopeningCountdown.js';
afterEach(()=>{vi.useRealTimers();});
it('updates the remaining time and requests one access check at zero',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-12T20:59:58Z'));
 const expired=vi.fn();const view=render(<BarReopeningCountdown until="2026-10-12T21:00:00Z" onExpire={expired}/>);
 expect(screen.getByRole('timer')).toHaveTextContent('00:00:02');
 await act(()=>vi.advanceTimersByTimeAsync(1000));expect(screen.getByRole('timer')).toHaveTextContent('00:00:01');
 await act(()=>vi.advanceTimersByTimeAsync(1000));expect(screen.getByRole('timer')).toHaveTextContent('00:00:00');expect(expired).toHaveBeenCalledOnce();
 await act(()=>vi.advanceTimersByTimeAsync(2000));expect(expired).toHaveBeenCalledOnce();
 view.unmount();expect(vi.getTimerCount()).toBe(0);
});
it('recomputes after returning to the page instead of counting missed ticks',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-12T20:00:00Z'));
 render(<BarReopeningCountdown until="2026-10-12T21:00:00Z" onExpire={()=>{}}/>);
 expect(screen.getByRole('timer')).toHaveTextContent('01:00:00');
 vi.setSystemTime(new Date('2026-10-12T20:40:00Z'));
 act(()=>document.dispatchEvent(new Event('visibilitychange')));
 expect(screen.getByRole('timer')).toHaveTextContent('00:20:00');
});
