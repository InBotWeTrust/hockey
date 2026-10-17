import {expect,it} from 'vitest';
import {createAccident,accidentStageAt,nextAccidentAt} from './accident.js';
it('only uses upper lanes and brings opposite fronts together despite different speeds',()=>{
 for(const value of [0,.3,.99]){
  const event=createAccident(1000,()=>value);
  expect([0,1]).toContain(event.lane);
  expect(event.policeLane).toBe(1-event.lane);
  const seconds=(event.collisionAt-event.start)/1000;
  expect(-10+event.speedA*seconds+3.6).toBeCloseTo(110-event.speedB*seconds,3);
  expect(event.policeStart-event.collisionAt).toBeGreaterThanOrEqual(300000);
  expect(event.policeStart-event.collisionAt).toBeLessThanOrEqual(600000);
  expect(event.departAt-event.policeArrived).toBeGreaterThanOrEqual(300000);
  expect(event.departAt-event.policeArrived).toBeLessThanOrEqual(600000);
  expect(nextAccidentAt(event,()=>0)-event.start).toBeGreaterThanOrEqual(48*3600000);
 }
});
it('restores each phase by real time and finishes after leaving the map',()=>{
 const event=createAccident(1000,()=>.5);
 expect(accidentStageAt(event,event.start).phase).toBe('approach');
 expect(accidentStageAt(event,event.collisionAt).phase).toBe('waiting');
 expect(accidentStageAt(event,event.policeStart).phase).toBe('police-approach');
 expect(accidentStageAt(event,event.policeArrived).phase).toBe('police-wait');
 expect(accidentStageAt(event,event.departAt).phase).toBe('departing');
 expect(accidentStageAt(event,event.end).phase).toBe('done');
});

it('computes the contact point from unequal independent approach speeds',()=>{
 const values=[.1,.2,.8,.4,.5,.6];const event=createAccident(0,()=>values.shift()??.5);
 expect(event.speedA).not.toBe(event.speedB);
 const t=event.collisionAt/1000;
 expect(-10+event.speedA*t+3.6).toBeCloseTo(110-event.speedB*t,6);
});
