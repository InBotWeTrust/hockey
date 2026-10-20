import {expect,it} from 'vitest';
import {createCaretakerSchedule,activeCaretakerVisit,caretakerBlocked} from './caretakerSchedule.js';
it('creates five separated daytime visits lasting three to five minutes',()=>{
 const now=new Date(2026,9,17,12).getTime();
 for(const value of [0,.3,.9]){
  const schedule=createCaretakerSchedule(now,()=>value);
  expect(schedule.visits).toHaveLength(5);
  for(const visit of schedule.visits){expect(new Date(visit.start).getHours()).toBeGreaterThanOrEqual(6);expect(new Date(visit.end).getHours()).toBeLessThan(23);expect(visit.end-visit.start).toBeGreaterThanOrEqual(180000);expect(visit.end-visit.start).toBeLessThanOrEqual(300000);}
  for(let index=1;index<5;index++)expect(schedule.visits[index-1]!.end).toBeLessThan(schedule.visits[index]!.start);
 }
});
it('only shows a visit inside its time window and never restarts a missed visit',()=>{
 const schedule=createCaretakerSchedule(new Date(2026,9,17,12).getTime(),()=>.3),visit=schedule.visits[0]!;
 expect(activeCaretakerVisit(schedule,visit.start-1)).toBeNull();expect(activeCaretakerVisit(schedule,visit.start)).toEqual(visit);expect(activeCaretakerVisit(schedule,visit.end)).toBeNull();
});
it('blocks maintenance while daily or training is active, including daily breaks and unknown state',()=>{
 expect(caretakerBlocked('idle','idle')).toBe(false);expect(caretakerBlocked('closed','closed')).toBe(false);
 for(const daily of ['period_active','break_active',undefined])expect(caretakerBlocked(daily,'idle')).toBe(true);
 expect(caretakerBlocked('idle','active')).toBe(true);expect(caretakerBlocked('idle',undefined)).toBe(true);
});
