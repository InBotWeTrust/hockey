import {afterEach,expect,it,vi} from 'vitest';
import {claimDailyGreeting,hasDailyGreeting,localDay,nextLocalMidnight} from './dailyGreeting.js';
afterEach(()=>{localStorage.clear();vi.useRealTimers();});
it('persists one greeting per character and account until local midnight',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,16,23,59));
 expect(claimDailyGreeting('a','maria')).toBe(true);
 expect(claimDailyGreeting('a','maria')).toBe(false);
 expect(hasDailyGreeting('a','maria')).toBe(true);
 expect(claimDailyGreeting('a','oleg')).toBe(true);
 expect(claimDailyGreeting('b','maria')).toBe(true);
 vi.setSystemTime(new Date(2026,9,17,0,0));
 expect(hasDailyGreeting('a','maria')).toBe(false);
 expect(claimDailyGreeting('a','maria')).toBe(true);
});
it('uses the local calendar rather than UTC and calculates calendar midnight',()=>{
 const now=new Date(2026,9,16,23,59,59);
 expect(localDay(now)).toBe('2026-10-16');
 expect(nextLocalMidnight(now)).toBe(new Date(2026,9,17).getTime());
});
it('survives unavailable storage without repeating greetings within the mounted app',()=>{
 const get=vi.spyOn(localStorage,'getItem').mockImplementation(()=>{throw Error('blocked');});
 const set=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw Error('blocked');});
 try{
  expect(claimDailyGreeting('blocked','igor')).toBe(true);
  expect(claimDailyGreeting('blocked','igor')).toBe(false);
 }finally{get.mockRestore();set.mockRestore();}
});
it('keeps the in-memory mark when reads work but writes are blocked',()=>{
 const set=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw Error('quota');});
 try{
  expect(claimDailyGreeting('quota','oleg')).toBe(true);
  expect(claimDailyGreeting('quota','oleg')).toBe(false);
 }finally{set.mockRestore();}
});
