import {expect,it} from 'vitest';
import {officeDayMode} from './officeSchedule.js';
it('has one special day each calendar week without adjacent special days',()=>{
 for(const user of ['alice','bob','carol']){
  let previous=false;
  for(let week=0;week<80;week++){
   let count=0;
   for(let day=0;day<7;day++){
    const date=new Date(Date.UTC(2025,11,29+week*7+day)).toISOString().slice(0,10);
    const mode=officeDayMode(user,date);
    expect(officeDayMode(user,date)).toBe(mode);
    expect(['scene','seated','empty']).toContain(mode);
    const scene=mode==='scene';expect(previous&&scene).toBe(false);previous=scene;
    if(scene)count++;
   }
   expect(count).toBe(1);
  }
 }
});
it('keeps the non-special visits varied and all weekdays available',()=>{
 const seen=new Set<string>(),weekdays=new Set<number>();
 for(let day=0;day<365;day++){
  const date=new Date(Date.UTC(2026,0,1+day));
  const mode=officeDayMode('alice',date.toISOString().slice(0,10));seen.add(mode);
  if(mode==='scene')weekdays.add(date.getUTCDay());
 }
 expect([...seen].sort()).toEqual(['empty','scene','seated']);expect(weekdays.size).toBe(7);
});
