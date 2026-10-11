import { describe, it, expect, vi, afterEach } from 'vitest';
import { CharacterGesture } from './characterGesture.js';
afterEach(()=>{vi.useRealTimers();});
describe('character gestures',()=>{
 it('requires three taps within three seconds',()=>{vi.useFakeTimers();const fire=vi.fn(),g=new CharacterGesture(fire);for(let i=0;i<2;i++){g.down(1,0,0);g.up(1);vi.advanceTimersByTime(400);}expect(fire).not.toHaveBeenCalled();g.down(1,0,0);g.up(1);expect(fire).toHaveBeenCalledOnce();});
 it('expires the streak and holds for two seconds only once',()=>{vi.useFakeTimers();const fire=vi.fn(),g=new CharacterGesture(fire);g.down(1,0,0);g.up(1);vi.advanceTimersByTime(3001);g.down(1,0,0);g.up(1);expect(fire).not.toHaveBeenCalled();g.down(1,0,0);vi.advanceTimersByTime(1999);expect(fire).not.toHaveBeenCalled();vi.advanceTimersByTime(1);g.up(1);expect(fire).toHaveBeenCalledOnce();g.cancel();});
 it('movement, cancellation and a second pointer clear the streak',()=>{vi.useFakeTimers();const fire=vi.fn(),g=new CharacterGesture(fire);g.down(1,0,0);g.up(1);g.down(1,0,0);g.move(1,13,0);g.up(1);g.down(1,0,0);g.down(2,0,0);vi.advanceTimersByTime(2500);g.up(1);g.up(2);expect(fire).not.toHaveBeenCalled();g.cancel();});
});
